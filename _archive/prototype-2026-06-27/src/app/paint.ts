/**
 * Pure rendering layer: turn an {@link AppState} plus a terminal size into a
 * fully-composited {@link ScreenBuffer}. No React, no side effects — given the
 * same inputs it always paints the same pixels, which keeps the UI easy to
 * reason about and test.
 *
 * Every control's position comes from {@link geometry}, the same module the
 * mouse hit-tester uses, so what is drawn and what is clickable stay in sync.
 */

import { ScreenBuffer, type Style } from '../tui/buffer.js';
import { BLOCK, THEME } from '../tui/theme.js';
import { FILE_MENU, Mode, type AppState } from './state.js';
import {
  FILE_MENU_RECT,
  dialogOkRect,
  dialogRect,
  dropdownInnerWidth,
  dropdownRect,
  helloButtonRect,
  windowRect,
} from './geometry.js';
import type { ScreenSize } from '../tui/useScreenSize.js';

/** Title shown in the central application window. */
const WINDOW_TITLE = 'Hello App';

/** Overwrite a cell with a shadow glyph while preserving its background. */
function thinShadowCell(buf: ScreenBuffer, x: number, y: number, glyph: string): void {
  const cell = buf.get(x, y);
  if (!cell) return;
  // Keep the existing background so the half-block's empty half blends in.
  buf.set(x, y, glyph, { fg: THEME.buttonShadow, bg: cell.bg });
}

/** Draw a Turbo Vision push-button at a rectangle's top-left corner. */
function drawButton(buf: ScreenBuffer, x: number, y: number, label: string, focused: boolean): void {
  const style: Style = focused ? THEME.buttonFocused : THEME.button;
  const text = `  ${label}  `;
  const w = [...text].length;
  buf.text(x, y, text, style);

  // A thin Turbo Vision drop shadow falling to the lower-right (light from the
  // top-left). The bottom strip is `▀` along the row below, offset one column
  // right; the corner is `▄` to the right of the button. Both are half-blocks,
  // so the shadow reads as a small rectangle and the lit top-right stays clear.
  for (let i = 1; i <= w; i += 1) {
    thinShadowCell(buf, x + i, y + 1, BLOCK.upperHalf); // bottom edge, offset right
  }
  thinShadowCell(buf, x + w, y, BLOCK.lowerHalf); // lower-right corner
}

/**
 * Draw a label that highlights a single "hotkey" character in an accent colour,
 * as Turbo Vision does for menu and button accelerators.
 */
function drawHotkeyLabel(
  buf: ScreenBuffer,
  x: number,
  y: number,
  label: string,
  hotkeyIndex: number,
  base: Style,
  hotkey: string,
): void {
  const chars = [...label];
  for (let i = 0; i < chars.length; i += 1) {
    const style = i === hotkeyIndex ? { fg: hotkey, bg: base.bg } : base;
    buf.set(x + i, y, chars[i], style);
  }
}

/**
 * Fill the screen with the uniform desktop backdrop: the `░` stipple in light
 * grey over blue, identical in every cell (Turbo Vision's TBackground).
 */
function paintDesktop(buf: ScreenBuffer): void {
  buf.fillRect(0, 0, buf.width, buf.height, THEME.desktop.pattern, {
    fg: THEME.desktop.fg,
    bg: THEME.desktop.bg,
  });
}

/** Paint the top menu bar with the (optionally active) File entry. */
function paintMenuBar(buf: ScreenBuffer, state: AppState): void {
  const bar: Style = { fg: THEME.menuBar.fg, bg: THEME.menuBar.bg };
  buf.fillRect(0, 0, buf.width, 1, ' ', bar);

  const menuActive = state.mode === Mode.Menu;
  const fileStyle: Style = menuActive
    ? { fg: THEME.menuBarActive.fg, bg: THEME.menuBarActive.bg }
    : bar;
  const hotkey = menuActive ? THEME.menuSelected.hotkey : THEME.menuBar.hotkey;
  // Padding spaces around the label give the highlighted entry a button feel.
  buf.fillRect(FILE_MENU_RECT.x, 0, FILE_MENU_RECT.w, 1, ' ', fileStyle);
  drawHotkeyLabel(buf, FILE_MENU_RECT.x + 1, 0, 'File', 0, fileStyle, hotkey);
}

/** Paint the central application window containing the Hello button. */
function paintWindow(buf: ScreenBuffer, state: AppState, size: ScreenSize): void {
  const win = windowRect(size);
  buf.shadow(win.x, win.y, win.w, win.h, THEME.shadow);
  buf.box(win.x, win.y, win.w, win.h, { fg: THEME.window.fg, bg: THEME.window.bg }, 'double', WINDOW_TITLE);

  const body: Style = { fg: THEME.window.fg, bg: THEME.window.bg };
  const line = 'Press the button to greet the world.';
  buf.text(win.x + Math.floor((win.w - line.length) / 2), win.y + 2, line, body);

  // The desktop button is focused whenever the dialog/menu are not in front.
  const btn = helloButtonRect(size);
  drawButton(buf, btn.x, btn.y, 'Hello', state.mode === Mode.Desktop);
}

/** Paint the File drop-down menu and its drop shadow. */
function paintMenuDropdown(buf: ScreenBuffer, state: AppState): void {
  if (state.mode !== Mode.Menu) return;

  const d = dropdownRect();
  const inner = dropdownInnerWidth();
  buf.shadow(d.x, d.y, d.w, d.h, THEME.shadow);
  buf.box(d.x, d.y, d.w, d.h, { fg: THEME.menuDropdown.fg, bg: THEME.menuDropdown.bg }, 'single');

  for (let i = 0; i < FILE_MENU.length; i += 1) {
    const item = FILE_MENU[i];
    const selected = i === state.menuIndex;
    const rowStyle: Style = selected
      ? { fg: THEME.menuSelected.fg, bg: THEME.menuSelected.bg }
      : { fg: THEME.menuDropdown.fg, bg: THEME.menuDropdown.bg };
    const hotkeyColor = selected ? THEME.menuSelected.hotkey : THEME.menuDropdown.hotkey;
    const rowY = d.y + 1 + i;

    // Paint the full interior width so the selection bar spans edge to edge.
    buf.fillRect(d.x + 1, rowY, inner, 1, ' ', rowStyle);
    drawHotkeyLabel(buf, d.x + 2, rowY, item.label, item.hotkeyIndex, rowStyle, hotkeyColor);
    const shortcutX = d.x + d.w - 1 - [...item.shortcut].length - 1;
    buf.text(shortcutX, rowY, item.shortcut, rowStyle);
  }
}

/** Paint the modal Hello World dialog centred on screen. */
function paintDialog(buf: ScreenBuffer, state: AppState, size: ScreenSize): void {
  if (state.mode !== Mode.Dialog) return;

  const d = dialogRect(size);
  const box: Style = { fg: THEME.dialog.fg, bg: THEME.dialog.bg };
  buf.shadow(d.x, d.y, d.w, d.h, THEME.shadow);
  buf.box(d.x, d.y, d.w, d.h, box, 'double', 'Information');

  const message = 'Hello, World!';
  buf.text(d.x + Math.floor((d.w - message.length) / 2), d.y + 3, message, box);

  // OK button is the only control in the dialog, so it is always focused.
  const ok = dialogOkRect(size);
  drawButton(buf, ok.x, ok.y, 'OK', true);
}

/** Paint the bottom status/hint bar with accelerator hints. */
function paintStatusBar(buf: ScreenBuffer): void {
  const bar: Style = { fg: THEME.statusBar.fg, bg: THEME.statusBar.bg };
  const y = buf.height - 1;
  buf.fillRect(0, y, buf.width, 1, ' ', bar);

  // Each hint pairs a red accelerator with grey help text.
  const hints: Array<{ key: string; text: string }> = [
    { key: 'Alt-F', text: ' Menu' },
    { key: 'Enter', text: ' Hello' },
    { key: 'Esc', text: ' Close' },
    { key: 'Alt-X', text: ' Exit' },
  ];

  let cursor = 1;
  for (const hint of hints) {
    cursor = buf.text(cursor, y, hint.key, { fg: THEME.statusBar.hotkey, bg: bar.bg });
    cursor = buf.text(cursor, y, hint.text, bar);
    cursor = buf.text(cursor, y, '   ', bar);
  }
}

/**
 * Compose the entire screen for the given state and size.
 *
 * Layers are painted back-to-front: desktop, menu bar, window, then whichever
 * modal surface (drop-down or dialog) is active, and finally the status bar.
 */
export function paint(state: AppState, size: ScreenSize): ScreenBuffer {
  const buf = new ScreenBuffer(size.columns, size.rows, {
    char: THEME.desktop.pattern,
    fg: THEME.desktop.fg,
    bg: THEME.desktop.bg,
  });

  paintDesktop(buf);
  paintMenuBar(buf, state);
  paintWindow(buf, state, size);
  paintMenuDropdown(buf, state);
  paintDialog(buf, state, size);
  paintStatusBar(buf);

  return buf;
}
