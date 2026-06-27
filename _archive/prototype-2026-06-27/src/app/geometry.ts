/**
 * Single source of truth for where every interactive control sits on screen.
 *
 * Both the painter (which draws the controls) and the mouse hit-tester (which
 * maps a click to a control) derive their coordinates from here, so the visual
 * layout and the clickable regions can never drift apart.
 */

import { FILE_MENU } from './state.js';
import type { ScreenSize } from '../tui/useScreenSize.js';

/** An axis-aligned rectangle in character cells (top-left origin). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** True when the point (x, y) lies inside the rectangle. */
export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

/** Width in cells of a button rendered as `  <label>  `. */
export function buttonWidth(label: string): number {
  return [...`  ${label}  `].length;
}

/** Clickable region of the "File" entry in the menu bar. */
export const FILE_MENU_RECT: Rect = { x: 1, y: 0, w: 6, h: 1 };

/** The central application window that hosts the Hello button. */
export function windowRect(size: ScreenSize): Rect {
  const w = Math.min(46, size.columns - 6);
  const h = 9;
  const x = Math.floor((size.columns - w) / 2);
  const y = Math.floor((size.rows - h) / 2) - 2;
  return { x, y, w, h };
}

/** The Hello push-button centred inside the application window. */
export function helloButtonRect(size: ScreenSize): Rect {
  const win = windowRect(size);
  const w = buttonWidth('Hello');
  return { x: win.x + Math.floor((win.w - w) / 2), y: win.y + 5, w, h: 1 };
}

/** Interior width (between the frame columns) of the File drop-down. */
export function dropdownInnerWidth(): number {
  const labelWidth = Math.max(...FILE_MENU.map((m) => [...m.label].length));
  const shortcutWidth = Math.max(...FILE_MENU.map((m) => [...m.shortcut].length));
  return labelWidth + 2 + shortcutWidth + 2; // label + gap + shortcut + side padding
}

/** Outer rectangle (including the frame) of the File drop-down menu. */
export function dropdownRect(): Rect {
  const inner = dropdownInnerWidth();
  return { x: 1, y: 1, w: inner + 2, h: FILE_MENU.length + 2 };
}

/** Clickable row of the i-th drop-down item (spanning the menu interior). */
export function dropdownItemRect(index: number): Rect {
  const d = dropdownRect();
  return { x: d.x + 1, y: d.y + 1 + index, w: d.w - 2, h: 1 };
}

/** The modal Hello World dialog, centred on screen. */
export function dialogRect(size: ScreenSize): Rect {
  const w = Math.min(40, size.columns - 4);
  const h = 9;
  const x = Math.floor((size.columns - w) / 2);
  const y = Math.floor((size.rows - h) / 2);
  return { x, y, w, h };
}

/** The OK push-button centred inside the dialog. */
export function dialogOkRect(size: ScreenSize): Rect {
  const d = dialogRect(size);
  const w = buttonWidth('OK');
  return { x: d.x + Math.floor((d.w - w) / 2), y: d.y + 5, w, h: 1 };
}
