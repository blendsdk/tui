/**
 * Drag-move / drag-resize gesture math (RD-05 AR-67/AR-74, PA-4/PA-5/PA-10).
 *
 * The Desktop holds the active {@link Gesture} and, while the loop captures the pointer to it,
 * feeds each captured move/drag to {@link applyMove}/{@link applyResize}. These mutate the target
 * window's `layout.rect` (clamped) and `invalidateLayout()` so RD-02 absolute placement re-honors
 * the rect on the next reflow. Window geometry is the `layout.rect`, never `bounds` (PF-01/PA-15).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import type { Rect } from '../layout/index.js';
import type { Point } from '../view/index.js';
import type { Window } from '../window/index.js';

/** Minimum window width/height the WM enforces on resize (PA-4). */
export const MIN_WIDTH = 10;
export const MIN_HEIGHT = 3;

/** Active drag/resize gesture state (PA-10 · RD-10 AR-91). */
export type Gesture =
  | { kind: 'move'; target: Window; grabDX: number; grabDY: number } // grab offset within the window
  | { kind: 'resize'; target: Window; originX: number; originY: number } // SE — fixed window top-left
  | { kind: 'resize-left'; target: Window; anchorRight: number; originY: number }; // SW — fixed right edge + top

/** Clamp `n` to `[lo, hi]` (`lo` wins if the range is degenerate). */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** The window's current WM rect (its layout rect, or a degenerate fallback). */
function rectOf(w: Window): Rect {
  return w.layout.rect ?? { x: 0, y: 0, width: MIN_WIDTH, height: MIN_HEIGHT };
}

/**
 * Apply a captured move: reposition the target to `pointer - grab`, clamped so the title row stays
 * on the desktop (`y ∈ [0, deskH-1]`) and ≥1 frame column stays inside (`x ∈ [1-w, deskW-1]`) (PA-4).
 *
 * @param g       The active move gesture.
 * @param local   The desktop-local pointer position.
 * @param deskW   Desktop width in cells.
 * @param deskH   Desktop height in cells.
 */
export function applyMove(g: Extract<Gesture, { kind: 'move' }>, local: Point, deskW: number, deskH: number): void {
  const rect = rectOf(g.target);
  const x = clamp(local.x - g.grabDX, 1 - rect.width, deskW - 1);
  const y = clamp(local.y - g.grabDY, 0, deskH - 1);
  g.target.layout.rect = { x, y, width: rect.width, height: rect.height };
  g.target.invalidateLayout();
}

/**
 * Apply a captured resize: set the size to `pointer - origin + 1`, floored at the minimum (PA-4).
 * Content reflows live within the new interior.
 *
 * @param g     The active resize gesture.
 * @param local The desktop-local pointer position.
 */
export function applyResize(g: Extract<Gesture, { kind: 'resize' }>, local: Point): void {
  const rect = rectOf(g.target);
  const width = Math.max(MIN_WIDTH, local.x - g.originX + 1);
  const height = Math.max(MIN_HEIGHT, local.y - g.originY + 1);
  g.target.layout.rect = { x: rect.x, y: rect.y, width, height };
  g.target.invalidateLayout();
}

/**
 * Apply a captured left-grow resize (TV `dmDragGrowLeft`, `tframe.cpp:117-122`/`193`, AR-91): the right
 * edge stays anchored at `anchorRight`, while the left edge follows the pointer and the bottom edge
 * grows like {@link applyResize}. The top edge is fixed at `originY`. The left edge is clamped only by
 * the minimum width (`x ≤ anchorRight − MIN_WIDTH + 1`, so `width ≥ MIN_WIDTH`); like {@link applyResize}
 * the dragged edge is otherwise unclamped — the window may grow past the desktop edge (RD-02 overflow
 * AR-28). (The spec's lower clamp was deferred to impl; mirroring `applyResize` keeps the two corners
 * symmetric — PA-11.)
 *
 * @param g     The active left-resize gesture.
 * @param local The desktop-local pointer position.
 */
export function applyResizeLeft(g: Extract<Gesture, { kind: 'resize-left' }>, local: Point): void {
  const x = Math.min(local.x, g.anchorRight - MIN_WIDTH + 1);
  const width = g.anchorRight - x + 1;
  const height = Math.max(MIN_HEIGHT, local.y - g.originY + 1);
  g.target.layout.rect = { x, y: g.originY, width, height };
  g.target.invalidateLayout();
}
