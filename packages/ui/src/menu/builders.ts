/**
 * Menu data builders + the tilde-hotkey convention (RD-05 AR-68/AR-77).
 *
 * The menu tree is plain data — `subMenu`/`item`/`separator` produce {@link MenuItem} nodes; the
 * `MenuBar` (menubar.ts) and `MenuPopup` (popup.ts) render them. `~X~` marks the accelerator char:
 * `parseTilde` strips the tildes and reports the hotkey char + its display column. `layoutTitles`
 * lays the top-level titles left-to-right (shared by the bar's draw + click hit-test and the
 * controller's popup positioning).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */

/** A node in the menu tree (plain data). */
export type MenuItem =
  | { kind: 'item'; title: string; command: string; key?: string } // tilde ~X~ marks the hotkey (AR-77)
  | { kind: 'sub'; title: string; items: MenuItem[] }
  | { kind: 'separator' };

/** A label with its `~X~` accelerator parsed out. */
export interface ParsedLabel {
  /** The display text (tildes removed). */
  text: string;
  /** The lowercase accelerator char, or `null` if the label had no `~X~`. */
  hotkey: string | null;
  /** The accelerator char's column in {@link text}, or `-1` when there is none. */
  hotkeyCol: number;
}

/** A top-level title's placement on the menu bar. */
export interface TitleLayout {
  index: number;
  /** The button's left column (the leading pad space), per `TMenuBar::getItemRect`. */
  x: number;
  /** The full ` text ` button width — display text + one pad column on each side. */
  width: number;
  label: ParsedLabel;
}

/** Leading blank column before the first button (`TMenuBar` starts drawing at x = 1). */
const TITLE_MARGIN = 1;
/** Pad columns around each bar title — one space on each side (` text `), as `TMenuBar` draws a button. */
const TITLE_PAD = 2;

/**
 * Parse a `~X~` accelerator out of a label. The char between the first matching tilde pair is the
 * accelerator; the tildes are removed from the display text.
 *
 * @param label A label, optionally containing one `~X~` accelerator marker.
 * @returns The display text, the lowercase hotkey char (or `null`), and its column.
 */
export function parseTilde(label: string): ParsedLabel {
  const open = label.indexOf('~');
  if (open === -1 || open + 2 >= label.length || label[open + 2] !== '~') {
    return { text: label.replace(/~/g, ''), hotkey: null, hotkeyCol: -1 };
  }
  const hotChar = label[open + 1];
  const text = label.slice(0, open) + hotChar + label.slice(open + 3);
  return { text, hotkey: hotChar.toLowerCase(), hotkeyCol: open };
}

/** The title text of a top-level menu node (`''` for a separator, which is never a top-level title). */
function titleOf(node: MenuItem): string {
  return node.kind === 'separator' ? '' : node.title;
}

/**
 * Lay the top-level titles left-to-right as abutting ` text ` buttons, exactly like
 * `TMenuBar::getItemRect` / `draw` (Turbo Vision `tmenubar.cpp`): the first button starts at column
 * 1, each button spans the display text plus one pad space on each side, and the next button begins
 * where the previous ended (the pad spaces are the visible gap).
 *
 * @param tops The top-level menu nodes.
 * @returns Each title's index, button left x, full button width, and parsed label.
 */
export function layoutTitles(tops: readonly MenuItem[]): TitleLayout[] {
  const out: TitleLayout[] = [];
  let x = TITLE_MARGIN;
  tops.forEach((node, index) => {
    const label = parseTilde(titleOf(node));
    const width = label.text.length + TITLE_PAD;
    out.push({ index, x, width, label });
    x += width;
  });
  return out;
}

/** The top-level title index whose x-range contains `x`, or `null`. */
export function titleIndexAt(tops: readonly MenuItem[], x: number): number | null {
  for (const t of layoutTitles(tops)) {
    if (x >= t.x && x < t.x + t.width) return t.index;
  }
  return null;
}

/** Build a submenu node. */
export function subMenu(title: string, items: MenuItem[]): MenuItem {
  return { kind: 'sub', title, items };
}

/** Build a command item node (`key` is a display accelerator label, e.g. `'Alt+X'`). */
export function item(title: string, command: string, key?: string): MenuItem {
  return { kind: 'item', title, command, key };
}

/** Build a separator node. */
export function separator(): MenuItem {
  return { kind: 'separator' };
}
