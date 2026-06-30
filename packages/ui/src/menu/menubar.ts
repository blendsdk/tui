/**
 * `MenuBar` — the top menu row + its navigation entry point (RD-05 AR-68/AR-77, PA-9).
 *
 * A **pre-process** view (it sees keys before the focused window, AR-51): it draws the top-level
 * titles with their `~hotkey~` char accented and owns the {@link MenuController} (created in
 * {@link MenuBar.attach}). `onEvent` translates F10 / Alt+hotkey / a title click into "open", and —
 * while a menu is open — `↑↓`/`Enter`/`←→`/`Esc`/item-hotkey into navigation, consuming each via
 * `ev.handled` so it never reaches the focused window. The popups themselves live in the overlay.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { Attr } from '@jsvision/core';
import type { Style } from '@jsvision/core';
import { View } from '../view/index.js';
import type { Group, DrawContext, DispatchEvent } from '../view/index.js';
import type { MenuItem } from './builders.js';
import { layoutTitles, titleIndexAt } from './builders.js';
import { createMenuController } from './controller.js';
import type { MenuController, MenuLoopSeam } from './controller.js';

/** The application menu bar: a pre-process view driving the nested-menu controller (AR-68). */
export class MenuBar extends View {
  /** The top-level menu nodes (set by the {@link menuBar} builder). */
  items: readonly MenuItem[] = [];
  /** The navigation controller; `null` until {@link attach} wires the overlay + loop seam (PA-7). */
  controller: MenuController | null = null;

  constructor() {
    super();
    this.preProcess = true; // accelerators see events before the focused window (AR-51)
  }

  /**
   * @internal Wire the controller (called once by `createApplication`, PA-7): the overlay that hosts
   * the popups + outside-click catcher, and the loop seam for activation/greying/focus.
   *
   * @param overlay The app-root overlay layer (top-z, absolute, full-viewport).
   * @param seam    The loop seam (`emitCommand`/`isCommandEnabled`/`focusView`/`getFocused`).
   */
  attach(overlay: Group, seam: MenuLoopSeam): void {
    this.controller = createMenuController(this.items, overlay, seam);
  }

  /** Draw the bar background then each top-level title, accenting its `~hotkey~` char (AR-77). */
  draw(ctx: DrawContext): void {
    const base = ctx.color('menuBar');
    const selected = ctx.color('menuSelected');
    const accent: Style = { ...base, attrs: (base.attrs ?? Attr.none) | Attr.underline };
    const open = this.controller?.isOpen() === true;

    const openIndex = this.controller?.openIndex() ?? null;
    ctx.fillRect(0, 0, ctx.size.width, 1, ' ', base);
    for (const title of layoutTitles(this.items)) {
      const style = open && openIndex === title.index ? selected : base;
      ctx.text(title.x, 0, title.label.text, style);
      if (title.label.hotkeyCol >= 0) {
        const hotChar = title.label.text[title.label.hotkeyCol] ?? '';
        ctx.text(title.x + title.label.hotkeyCol, 0, hotChar, open ? style : accent);
      }
    }
  }

  /**
   * Handle a key or a title click (AR-68). Pre-process keys arrive here first; mouse-downs arrive via
   * the hit-test when they land on the bar (the bar is the top-most view on row 0 while closed).
   *
   * @param ev The dispatch envelope; `ev.handled = true` consumes the event.
   */
  override onEvent(ev: DispatchEvent): void {
    const controller = this.controller;
    if (controller === null) return;
    const inner = ev.event;

    if (inner.type === 'mouse') {
      if (inner.kind === 'down' && ev.local !== undefined) {
        const index = titleIndexAt(this.items, ev.local.x);
        if (index !== null) {
          controller.openTop(index);
          ev.handled = true;
        }
      }
      return;
    }
    if (inner.type !== 'key') return;

    // Alt+<letter> opens/switches to that top-level menu, whether the menu is open or closed.
    if (inner.alt && inner.key.length === 1) {
      if (controller.topHotkey(inner.key)) ev.handled = true;
      return;
    }
    if (inner.key === 'f10') {
      if (controller.isOpen()) controller.close();
      else controller.openTop(0);
      ev.handled = true;
      return;
    }
    if (!controller.isOpen()) return; // closed: pass every other key to the focused view

    switch (inner.key) {
      case 'up':
        controller.move(-1);
        ev.handled = true;
        break;
      case 'down':
        controller.move(1);
        ev.handled = true;
        break;
      case 'left':
        controller.left();
        ev.handled = true;
        break;
      case 'right':
        controller.right();
        ev.handled = true;
        break;
      case 'enter':
        controller.activate();
        ev.handled = true;
        break;
      case 'escape':
        controller.closeLevel();
        ev.handled = true;
        break;
      default:
        if (inner.key.length === 1 && controller.itemHotkey(inner.key)) ev.handled = true;
        break;
    }
  }
}

/**
 * Build a {@link MenuBar} from a top-level item list (AR-68). The builder only assembles data; the
 * controller is wired later by `createApplication` via {@link MenuBar.attach}.
 *
 * @param items The top-level menu nodes (each typically a `subMenu`).
 * @returns A constructed `MenuBar`.
 */
export function menuBar(items: MenuItem[]): MenuBar {
  const bar = new MenuBar();
  bar.items = items;
  return bar;
}
