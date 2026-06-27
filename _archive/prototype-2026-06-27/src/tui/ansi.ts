/**
 * Raw ANSI / xterm control sequences used to drive the terminal directly.
 *
 * We bypass Ink's component renderer for output because, at full-screen size,
 * its erase-then-rewrite update flickers. Painting our own opaque frame in
 * place (absolute cursor moves, no erase) is flicker-free. These constants and
 * helpers are the vocabulary for doing that.
 */

import { hexToRgb } from './color.js';

const CSI = '\x1b[';

/** Reset all colour/style attributes. */
export const RESET = `${CSI}0m`;

/** Switch to the alternate screen buffer (no scrollback, like vim/htop). */
export const ENTER_ALT_SCREEN = `${CSI}?1049h`;
/** Return to the normal screen buffer, restoring the user's scrollback. */
export const LEAVE_ALT_SCREEN = `${CSI}?1049l`;

/** Hide / show the text cursor. */
export const HIDE_CURSOR = `${CSI}?25l`;
export const SHOW_CURSOR = `${CSI}?25h`;

/**
 * Disable / enable line wrap. With wrap disabled, writing the bottom-right cell
 * does not trigger a scroll — essential for a full-screen frame.
 */
export const DISABLE_WRAP = `${CSI}?7l`;
export const ENABLE_WRAP = `${CSI}?7h`;

/** Clear the entire screen and move the cursor home. */
export const CLEAR_SCREEN = `${CSI}2J${CSI}H`;

/**
 * Enable mouse reporting: button events (1000) with SGR extended coordinates
 * (1006) so columns past 223 are reported correctly.
 */
export const ENABLE_MOUSE = `${CSI}?1000h${CSI}?1006h`;
/** Disable the mouse reporting modes enabled by {@link ENABLE_MOUSE}. */
export const DISABLE_MOUSE = `${CSI}?1000l${CSI}?1006l`;

/** Move the cursor to a 1-based (row, col). */
export function cursorTo(row: number, col: number): string {
  return `${CSI}${row};${col}H`;
}

/** 24-bit foreground colour SGR sequence for a `#rrggbb` colour. */
export function fg(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${CSI}38;2;${r};${g};${b}m`;
}

/** 24-bit background colour SGR sequence for a `#rrggbb` colour. */
export function bg(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${CSI}48;2;${r};${g};${b}m`;
}
