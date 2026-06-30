/**
 * Window arrangement + switching (RD-05 AR-67/AR-87, PA-4).
 *
 * Pure helpers over a desktop's window list (children order = z-order): `cascade`/`tile` set each
 * window's `layout.rect`; `nextWindow`/`prevWindow`/`windowByNumber` pick a switch target the Desktop
 * then raises. All un-zoom a window before repositioning it (AR-87) and clamp cells to the minimum
 * (cells may overflow a tiny desktop per RD-02 overflow AR-28).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import type { Window } from '../window/index.js';
import { MIN_WIDTH, MIN_HEIGHT } from './gestures.js';

/** Cascade stagger per window: +1 row, +2 columns from the desktop top-left (PA-4). */
const CASCADE_DROW = 1;
const CASCADE_DCOL = 2;

/** Set a window's rect and schedule its reflow, un-zooming it first (AR-87). */
function place(w: Window, x: number, y: number, width: number, height: number): void {
  w.resetZoom();
  w.layout.rect = { x, y, width, height };
  w.invalidateLayout();
}

/**
 * Cascade the windows: stagger each from the top-left at a default size (2/3 of the desktop, ≥min).
 * `n===0` is a no-op (PA-4).
 *
 * @param windows The desktop's windows in z-order.
 * @param deskW   Desktop width in cells.
 * @param deskH   Desktop height in cells.
 */
export function cascade(windows: readonly Window[], deskW: number, deskH: number): void {
  const width = Math.max(MIN_WIDTH, Math.floor((deskW * 2) / 3));
  const height = Math.max(MIN_HEIGHT, Math.floor((deskH * 2) / 3));
  windows.forEach((w, i) => place(w, i * CASCADE_DCOL, i * CASCADE_DROW, width, height));
}

/**
 * Tile the windows into a near-square grid: `cols=ceil(sqrt(n))`, `rows=ceil(n/cols)`, each cell
 * `floor(deskW/cols) × floor(deskH/rows)` clamped to the minimum. `n===0` no-op; `n===1` fills (AR-87).
 *
 * @param windows The desktop's windows in z-order.
 * @param deskW   Desktop width in cells.
 * @param deskH   Desktop height in cells.
 */
export function tile(windows: readonly Window[], deskW: number, deskH: number): void {
  const n = windows.length;
  if (n === 0) return;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = Math.max(MIN_WIDTH, Math.floor(deskW / cols));
  const cellH = Math.max(MIN_HEIGHT, Math.floor(deskH / rows));
  windows.forEach((w, i) => place(w, (i % cols) * cellW, Math.floor(i / cols) * cellH, cellW, cellH));
}

/** The next window after `active` in z-order, wrapping; `null` if there are no windows. */
export function nextWindow(windows: readonly Window[], active: Window | null): Window | null {
  return cycle(windows, active, +1);
}

/** The previous window before `active` in z-order, wrapping; `null` if there are no windows. */
export function prevWindow(windows: readonly Window[], active: Window | null): Window | null {
  return cycle(windows, active, -1);
}

/** The window whose `number === n`, or `null` (out-of-range = no match → clamped no-op, AR-67). */
export function windowByNumber(windows: readonly Window[], n: number): Window | null {
  return windows.find((w) => w.number === n) ?? null;
}

/** Step `delta` from `active` in z-order with wrap; falls back to the first window. */
function cycle(windows: readonly Window[], active: Window | null, delta: number): Window | null {
  const n = windows.length;
  if (n === 0) return null;
  const current = active === null ? -1 : windows.indexOf(active);
  const base = current === -1 ? 0 : current;
  return windows[(base + delta + n) % n] ?? null;
}
