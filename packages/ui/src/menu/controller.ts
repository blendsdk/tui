/**
 * Menu navigation state machine (RD-05 AR-68, PA-9). The `MenuBar` owns one controller; it holds the
 * open-menu state (a stack of levels = nested popups), mounts/unmounts `MenuPopup`s + a full-viewport
 * outside-click **catcher** into the injected overlay, and drives highlight/activation. It performs no
 * dispatch itself — the `MenuBar.onEvent` translates keys/clicks into the method calls below.
 *
 * Open flow (PF-10): `overlay.state.visible = true` BEFORE mounting the catcher + first popup; close
 * unmounts them and sets `visible = false` so an empty overlay never wins the top-z hit-test.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { View } from '../view/index.js';
import type { Group, DispatchEvent } from '../view/index.js';
import type { LayoutProps, Rect } from '../layout/index.js';
import { MenuPopup } from './popup.js';
import type { MenuItem } from './builders.js';
import { parseTilde, layoutTitles } from './builders.js';

/** The loop seam the controller needs for activation, greying, and focus save/restore (PA-7). */
export interface MenuLoopSeam {
  /** Raise the activated item's command onto the dispatch tick (AR-52). */
  emitCommand(command: string, arg?: unknown): void;
  /** Whether a command is enabled — drives greying + non-activatability (AR-68). */
  isCommandEnabled(command: string): boolean;
  /** Focus a view — used to restore the pre-menu focus on close (PA-2). */
  focusView(view: View): void;
  /** The currently-focused view, captured on open to restore on close (PA-2). */
  getFocused(): View | null;
}

/** The public surface the `MenuBar` drives (one method per navigation action). */
export interface MenuController {
  /** Whether a top-level menu is currently open. */
  isOpen(): boolean;
  /** The open top-level index (for the bar's title highlight), or `null` when closed. */
  openIndex(): number | null;
  /** Open the top-level menu at `index` (saving focus the first time); switches if already open. */
  openTop(index: number): void;
  /** Close the deepest open popup; closing the last level closes the whole menu. */
  closeLevel(): void;
  /** Close every level + the catcher and restore the saved focus. */
  close(): void;
  /** Move the deepest level's highlight, skipping separators + disabled items (AR-68). */
  move(dir: -1 | 1): void;
  /** Activate the deepest highlighted item: open a `sub`, or emit an enabled `item`'s command + close. */
  activate(): void;
  /** `←`: close a nested level, or switch to the previous top-level when at depth 1. */
  left(): void;
  /** `→`: open a highlighted `sub`, else switch to the next top-level. */
  right(): void;
  /** `Alt+<char>`: open/switch to the top-level menu whose hotkey matches; `true` if consumed. */
  topHotkey(char: string): boolean;
  /** A plain `<char>` while open: activate the deepest item whose hotkey matches; `true` if consumed. */
  itemHotkey(char: string): boolean;
}

/** One open level = a mounted popup over its items. The popup owns the highlight (its source of truth). */
interface Level {
  items: readonly MenuItem[];
  popup: MenuPopup;
}

/** Minimum popup width (cells) — Turbo Vision's `TMenuBox::getRect` floor (`w = 10`). */
const POPUP_MIN_WIDTH = 10;
/** A safe fallback viewport when the overlay has no rect yet (never reached once composed). */
const FALLBACK_VIEWPORT: Rect = { x: 0, y: 0, width: 80, height: 24 };

/** A transparent full-viewport overlay child that closes the menu on any mouse-down (PF-06). */
class CatcherView extends View {
  /** Free-floating, full-viewport; the controller sets `rect`. */
  override layout: LayoutProps = { position: 'absolute' };

  constructor(private readonly onOutside: () => void) {
    super();
  }

  /** Paint nothing — the catcher only intercepts outside clicks (it must stay visible to hit-test). */
  draw(): void {
    // intentionally empty (transparent)
  }

  /** Close the menu on a mouse-down anywhere not covered by a popup (which paints above). */
  override onEvent(ev: DispatchEvent): void {
    const inner = ev.event;
    if (inner.type === 'mouse' && inner.kind === 'down') {
      this.onOutside();
      ev.handled = true;
    }
  }
}

/** A non-separator item is selectable for navigation iff it is a `sub` or an enabled command (AR-68). */
function isSelectable(node: MenuItem, isEnabled: (command: string) => boolean): boolean {
  if (node.kind === 'separator') return false;
  if (node.kind === 'sub') return true;
  return isEnabled(node.command);
}

/** The first non-separator row (the initial highlight — a disabled item may sit here; Enter no-ops). */
function firstSelectable(items: readonly MenuItem[]): number {
  const index = items.findIndex((node) => node.kind !== 'separator');
  return index === -1 ? 0 : index;
}

/**
 * One item's width contribution, per Turbo Vision's `TMenuBox::getRect`: the display name plus 6
 * chrome cells (outer blank gutter + border + one inner pad, on each side), plus 3 for a submenu's
 * ` ►` cascade marker or `key.length + 2` for a right-aligned shortcut. Separators contribute 0.
 *
 * @param node A menu item.
 * @returns Its required popup width in cells.
 */
function itemWidth(node: MenuItem): number {
  if (node.kind === 'separator') return 0;
  let width = parseTilde(node.title).text.length + 6;
  if (node.kind === 'sub') width += 3;
  else if (node.key !== undefined) width += node.key.length + 2;
  return width;
}

/** The popup width: the widest item's contribution, floored at {@link POPUP_MIN_WIDTH} (TV getRect). */
function popupWidth(items: readonly MenuItem[]): number {
  let max = POPUP_MIN_WIDTH;
  for (const node of items) max = Math.max(max, itemWidth(node));
  return max;
}

/**
 * Create the menu navigation controller.
 *
 * @param tops    The top-level menu nodes (each typically a `sub`).
 * @param overlay The app-root overlay layer the popups + catcher mount into (PA-2/PA-15).
 * @param seam    The loop seam for activation/greying/focus (PA-7).
 * @returns A {@link MenuController} the `MenuBar` drives.
 */
export function createMenuController(tops: readonly MenuItem[], overlay: Group, seam: MenuLoopSeam): MenuController {
  const levels: Level[] = [];
  let openTopIndex: number | null = null;
  let savedFocus: View | null = null;
  let catcher: CatcherView | null = null;

  const isEnabled = (command: string): boolean => seam.isCommandEnabled(command);
  const viewport = (): Rect => overlay.layout.rect ?? FALLBACK_VIEWPORT;
  const deepest = (): Level | null => levels[levels.length - 1] ?? null;
  const isOpen = (): boolean => openTopIndex !== null;

  /** The next selectable row from `from` stepping by `dir` (wrapping); `from` if none qualifies. */
  function nextSelectable(items: readonly MenuItem[], from: number, dir: -1 | 1): number {
    const count = items.length;
    for (let step = 1; step <= count; step += 1) {
      const index = (((from + dir * step) % count) + count) % count;
      const node = items[index];
      if (node !== undefined && isSelectable(node, isEnabled)) return index;
    }
    return from;
  }

  /** Clamp a popup origin so the whole popup stays on-screen (open up/left if it would overflow). */
  function clampRect(x: number, y: number, width: number, height: number): Rect {
    const vp = viewport();
    const nx = x + width > vp.width ? Math.max(0, vp.width - width) : x;
    const ny = y + height > vp.height ? Math.max(0, vp.height - height) : y;
    return { x: nx, y: ny, width, height };
  }

  /** Build, position, and mount a popup over `items` at the anchor; push it as the new deepest level. */
  function pushLevel(items: readonly MenuItem[], anchorX: number, anchorY: number): void {
    const popup = new MenuPopup();
    popup.castsShadow = true; // TV sfShadow — the menu box casts a drop-shadow over what's behind it
    popup.items = items;
    popup.highlight = firstSelectable(items);
    popup.isEnabled = isEnabled;
    const width = popupWidth(items);
    const height = items.length + 2; // top + bottom border
    popup.layout = { position: 'absolute', rect: clampRect(anchorX, anchorY, width, height) };
    popup.onPick = (row) => pickRow(popup, row);
    overlay.add(popup);
    levels.push({ items, popup });
  }

  /** Open the level-0 popup for a top-level `sub` directly under its bar title. */
  function openLevelForTop(index: number): void {
    const node = tops[index];
    if (node === undefined || node.kind !== 'sub') return;
    const title = layoutTitles(tops)[index];
    // TV places the box left = bar-item left, then shifts one column left for a horizontal bar
    // (`if (size.y == 1) r.a.x--;`, tmnuview.cpp:380), and the top one row below the bar.
    const anchorX = Math.max(0, (title?.x ?? 1) - 1);
    pushLevel(node.items, anchorX, 1);
  }

  /** Remove every mounted popup (leaving the catcher) and empty the level stack. */
  function clearLevels(): void {
    while (levels.length > 0) {
      const level = levels.pop();
      if (level !== undefined) overlay.remove(level.popup);
    }
  }

  /** Mount the outside-click catcher as the overlay's first (bottom-most) child. */
  function mountCatcher(): void {
    const vp = viewport();
    catcher = new CatcherView(() => close());
    catcher.layout = { position: 'absolute', rect: { x: 0, y: 0, width: vp.width, height: vp.height } };
    overlay.add(catcher);
  }

  function openTop(index: number): void {
    const wasOpen = isOpen();
    if (!wasOpen) savedFocus = seam.getFocused();
    clearLevels();
    if (!wasOpen) mountCatcher();
    openTopIndex = index;
    overlay.state.visible = true; // PF-10: visible BEFORE the catcher/popups are hit-testable

    const node = tops[index];
    if (node !== undefined && node.kind === 'sub') {
      openLevelForTop(index);
    } else if (node !== undefined && node.kind === 'item') {
      // A bare top-level command item: emit (if enabled) then close.
      if (isEnabled(node.command)) seam.emitCommand(node.command);
      close();
    }
  }

  function close(): void {
    clearLevels();
    if (catcher !== null) {
      overlay.remove(catcher);
      catcher = null;
    }
    overlay.state.visible = false;
    openTopIndex = null;
    const restore = savedFocus;
    savedFocus = null;
    if (restore !== null) seam.focusView(restore);
  }

  function closeLevel(): void {
    if (levels.length === 0) return;
    if (levels.length === 1) {
      close();
      return;
    }
    const level = levels.pop();
    if (level !== undefined) overlay.remove(level.popup);
  }

  /** Switch the open top-level by `dir` (wrapping), re-opening at level 0. */
  function switchTop(dir: -1 | 1): void {
    if (openTopIndex === null) return;
    const count = tops.length;
    const next = (((openTopIndex + dir) % count) + count) % count;
    clearLevels();
    openTopIndex = next;
    openLevelForTop(next);
  }

  function move(dir: -1 | 1): void {
    const level = deepest();
    if (level === null) return;
    level.popup.highlight = nextSelectable(level.items, level.popup.highlight, dir);
    level.popup.invalidate();
  }

  /** Open a `sub`'s child popup to the right of `parent` at its highlighted row. */
  function openNested(parent: Level, node: Extract<MenuItem, { kind: 'sub' }>): void {
    const rect = parent.popup.layout.rect ?? FALLBACK_VIEWPORT;
    const anchorX = rect.x + rect.width - 1; // overlap the parent's right border by one column
    const anchorY = rect.y + parent.popup.highlight + 1; // align with the highlighted row
    pushLevel(node.items, anchorX, anchorY);
  }

  function activate(): void {
    const level = deepest();
    if (level === null) return;
    const node = level.items[level.popup.highlight];
    if (node === undefined) return;
    if (node.kind === 'sub') {
      openNested(level, node);
    } else if (node.kind === 'item') {
      if (!isEnabled(node.command)) return; // disabled ⇒ no-op (AR-68)
      seam.emitCommand(node.command);
      close();
    }
  }

  function left(): void {
    if (levels.length > 1) closeLevel();
    else switchTop(-1);
  }

  function right(): void {
    const level = deepest();
    if (level === null) return;
    const node = level.items[level.popup.highlight];
    if (node !== undefined && node.kind === 'sub') openNested(level, node);
    else switchTop(1);
  }

  /** A mouse-pick on a popup row: drop deeper levels, highlight the row, then activate it. */
  function pickRow(popup: MenuPopup, row: number): void {
    const index = levels.findIndex((level) => level.popup === popup);
    if (index === -1) return;
    while (levels.length - 1 > index) closeLevel();
    const node = levels[index]?.items[row];
    if (node === undefined || node.kind === 'separator') return;
    popup.highlight = row;
    activate();
  }

  function topHotkey(char: string): boolean {
    const lower = char.toLowerCase();
    const match = layoutTitles(tops).find((title) => title.label.hotkey === lower);
    if (match === undefined) return false;
    openTop(match.index);
    return true;
  }

  function itemHotkey(char: string): boolean {
    const level = deepest();
    if (level === null) return false;
    const lower = char.toLowerCase();
    const index = level.items.findIndex((node) => node.kind !== 'separator' && parseTilde(node.title).hotkey === lower);
    if (index === -1) return false;
    level.popup.highlight = index;
    activate();
    return true;
  }

  return {
    isOpen,
    openIndex: () => openTopIndex,
    openTop,
    closeLevel,
    close,
    move,
    activate,
    left,
    right,
    topHotkey,
    itemHotkey,
  };
}
