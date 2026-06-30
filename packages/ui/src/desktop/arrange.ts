/**
 * Window arrangement + switching (RD-05 AR-67 · RD-10 AR-89/AR-90, supersedes RD-05 AR-87/PA-4).
 *
 * Pure helpers over a desktop's window list (children order = z-order, `i=0` = back): `cascade`/`tile`
 * set each window's `layout.rect` exactly as Turbo Vision's `TDeskTop` does (`tdesktop.cpp`);
 * `nextWindow`/`prevWindow`/`windowByNumber` pick a switch target the Desktop then raises. Both
 * arrangers un-zoom a window before repositioning it (AR-87) and refuse (no-op) when the desktop is too
 * small to honor the layout (TV `tileError`, AR-91 / PA-6).
 *
 * The desktop rect is `(0,0)`–`(deskW,deskH)` with an exclusive bottom-right, matching TV's `TRect`.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import type { Window } from '../window/index.js';
import { MIN_WIDTH, MIN_HEIGHT } from './gestures.js';

/** Set a window's rect and schedule its reflow, un-zooming it first (AR-87). */
function place(w: Window, x: number, y: number, width: number, height: number): void {
  w.resetZoom();
  w.layout.rect = { x, y, width, height };
  w.invalidateLayout();
}

/**
 * Cascade the windows exactly as TV's `doCascade` (`tdesktop.cpp:67-78`, AR-89): window `i` (back→front)
 * lands at `(i, i)` with its bottom-right pinned to the desktop corner, so the back window fills and
 * each window in front is offset one cell down-right and one cell smaller. `n===0` is a no-op; the
 * arrangement is refused (no-op, TV `tileError`) when the smallest window would fall below the minimum.
 *
 * @param windows The desktop's windows in z-order (`i=0` = back).
 * @param deskW   Desktop width in cells.
 * @param deskH   Desktop height in cells.
 */
export function cascade(windows: readonly Window[], deskW: number, deskH: number): void {
  const n = windows.length;
  if (n === 0) return;
  // tileError (PA-6): the front window has offset n−1; refuse if its remaining size is below the minimum.
  if (MIN_WIDTH > deskW - (n - 1) || MIN_HEIGHT > deskH - (n - 1)) return;
  windows.forEach((w, i) => place(w, i, i, deskW - i, deskH - i));
}

/**
 * TV integer square root (`tdesktop.cpp:139` `iSqr`) — the largest `r` with `r*r ≤ i`, by integer
 * Newton iteration.
 */
function iSqr(i: number): number {
  let r1 = 2;
  let r2 = Math.floor(i / r1);
  while (Math.abs(r1 - r2) > 1) {
    r1 = Math.floor((r1 + r2) / 2);
    r2 = Math.floor(i / r1);
  }
  return r1 < r2 ? r1 : r2;
}

/**
 * Split `n` into the most-equal pair of divisors (`tdesktop.cpp:153` `mostEqualDivisors`), favoring the
 * Y axis (`favorY=true`, i.e. `tileColumnsFirst=false`): `rows ≥ cols`, e.g. `n=2 ⇒ 1×2` (stacked).
 *
 * @param n The window count.
 * @returns `{ cols, rows }` with `cols·rows ≥ n` and the pair as equal as possible.
 */
function mostEqualDivisors(n: number): { cols: number; rows: number } {
  let i = iSqr(n);
  if (n % i !== 0 && n % (i + 1) === 0) i++;
  if (i < Math.floor(n / i)) i = Math.floor(n / i);
  return { cols: Math.floor(n / i), rows: i }; // favorY ⇒ x = n/i, y = i
}

/** Proportional divider position (`tdesktop.cpp:171` `dividerLoc`) — the `pos`-th of `num` even splits of `[lo,hi)`. */
function dividerLoc(lo: number, hi: number, num: number, pos: number): number {
  return Math.trunc(((hi - lo) * pos) / num) + lo;
}

/** A window's tile rect for slot `pos`, exactly as TV's `calcTileRect` (`tdesktop.cpp:177-211`). */
function calcTileRect(
  pos: number,
  deskW: number,
  deskH: number,
  cols: number,
  rows: number,
  leftOver: number,
): { x: number; y: number; width: number; height: number } {
  // The first `cols−leftOver` columns hold `rows` cells; the trailing `leftOver` columns hold `rows+1`.
  const d = (cols - leftOver) * rows;
  let cx: number;
  let cy: number;
  if (pos < d) {
    cx = Math.floor(pos / rows);
    cy = pos % rows;
  } else {
    cx = Math.floor((pos - d) / (rows + 1)) + (cols - leftOver);
    cy = (pos - d) % (rows + 1);
  }
  const aX = dividerLoc(0, deskW, cols, cx);
  const bX = dividerLoc(0, deskW, cols, cx + 1);
  const rowsHere = pos < d ? rows : rows + 1;
  const aY = dividerLoc(0, deskH, rowsHere, cy);
  const bY = dividerLoc(0, deskH, rowsHere, cy + 1);
  return { x: aX, y: aY, width: bX - aX, height: bY - aY };
}

/**
 * Tile the windows into a no-remainder grid exactly as TV's `doTile`/`calcTileRect`
 * (`tdesktop.cpp:162-214`, AR-90): `mostEqualDivisors(n)` columns×rows, the trailing `leftOver`
 * columns taking one extra row each, the cells dividing the desktop with no leftover strip. `n===2`
 * stacks (1 col × 2 rows). `n===0` no-op; `n===1` fills; the arrangement is refused (no-op) when a cell
 * would collapse to zero width/height (TV `tileError`).
 *
 * @param windows The desktop's windows in z-order (`i=0` = back ⇒ tile slot `i`).
 * @param deskW   Desktop width in cells.
 * @param deskH   Desktop height in cells.
 */
export function tile(windows: readonly Window[], deskW: number, deskH: number): void {
  const n = windows.length;
  if (n === 0) return;
  const { cols, rows } = mostEqualDivisors(n);
  // tileError (PA-6): refuse when the desktop is too small for one cell per column/row.
  if (Math.floor(deskW / cols) === 0 || Math.floor(deskH / rows) === 0) return;
  const leftOver = n % cols;
  windows.forEach((w, i) => {
    const r = calcTileRect(i, deskW, deskH, cols, rows, leftOver);
    place(w, r.x, r.y, r.width, r.height);
  });
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
