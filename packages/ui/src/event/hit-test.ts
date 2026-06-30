/**
 * Mouse hit-testing + focus-on-click (RD-04, AR-50/AR-63). A `MouseEvent`/`WheelEvent` is routed to
 * the **top-most front-to-back** view whose ancestor-clipped absolute bounds contain the (normalized
 * 0-based) point; on a mouse-down, focus climbs to the nearest focusable view at the hit. Geometry
 * reuses RD-03's pure `intersect`/`contains` (no new geometry, AR-37).
 *
 * `hitTestRoute` is decoupled from the loop via a {@link HitContext} of seams: the scope root (the
 * top modal subtree, or the mounted root when no modal), the focus predicate + focus action (the
 * focus manager's pure mutations — the hit-test runs inside the dispatch tick), and the
 * error-isolating `deliver`.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import type { Rect } from '../layout/index.js';
import { View, Group, intersect, contains } from '../view/index.js';
import type { Point, DispatchEvent } from '../view/index.js';

/** The seams `hitTestRoute` needs from the loop. */
export interface HitContext {
  /** The hit-test scope: the top modal subtree, or the mounted root when no modal (03-04). */
  readonly scopeRoot: View | null;
  /**
   * The pointer-capture target (RD-05 PA-5): when non-null, every mouse/wheel event routes here
   * (target-local coords), bypassing the hit-test and focus-on-click. `null` ⇒ normal hit-testing.
   */
  readonly captureTarget: View | null;
  /** Leaf focusable predicate — used to climb to the nearest focusable at a click (AR-56). */
  isFocusable(view: View): boolean;
  /** Focus a (known-focusable) view — the focus manager's pure mutation (PA-5). */
  focusView(view: View): void;
  /** Deliver an envelope to a view's `onEvent`, isolating a throwing handler (AR-66). */
  deliver(view: View, ev: DispatchEvent): void;
}

/** A resolved hit: the view plus its absolute top-left (to compute view-local coords). */
interface Hit {
  view: View;
  absX: number;
  absY: number;
}

/**
 * Walk the subtree rooted at `view` (children last-first = front-to-back paint Z-order) returning
 * the deepest top-most view whose absolute, ancestor-clipped bounds contain the point. A
 * `!visible`/`disabled` subtree is skipped entirely (AR-65). Returns `null` for no hit.
 *
 * @param view  The current view.
 * @param absX  The view's absolute x origin.
 * @param absY  The view's absolute y origin.
 * @param clip  The absolute clip rect (ancestor clip ∩ so far).
 * @param x     The 0-based target x.
 * @param y     The 0-based target y.
 */
function topMost(view: View, absX: number, absY: number, clip: Rect, x: number, y: number): Hit | null {
  if (!view.state.visible || view.state.disabled) return null; // skip subtree (AR-65)

  const viewRect: Rect = { x: absX, y: absY, width: view.bounds.width, height: view.bounds.height };
  const clipped = intersect(clip, viewRect);

  if (view instanceof Group) {
    // Reverse child order = front-to-back, so the on-top sibling wins an overlap (AR-50).
    for (let i = view.children.length - 1; i >= 0; i -= 1) {
      const child = view.children[i];
      if (child === undefined) continue;
      const hit = topMost(child, absX + child.bounds.x, absY + child.bounds.y, clipped, x, y);
      if (hit !== null) return hit;
    }
  }

  const point: Point = { x, y };
  if (contains(clipped, point)) return { view, absX, absY };
  return null;
}

/**
 * The view's absolute top-left origin: the sum of parent-relative `bounds.x/y` from the view up
 * through every ancestor to the root (whose `bounds` is absolute). Used to translate a captured
 * pointer into the capture target's view-local coords (RD-05 PA-5).
 */
function absoluteOrigin(view: View): Point {
  let x = 0;
  let y = 0;
  let node: View | null = view;
  while (node !== null) {
    x += node.bounds.x;
    y += node.bounds.y;
    node = node.parent;
  }
  return { x, y };
}

/** Climb from the hit view to the nearest focusable view and focus it; if none, leave focus (AC-8). */
function focusOnClick(hit: View, ctx: HitContext): void {
  let node: View | null = hit;
  while (node !== null) {
    if (ctx.isFocusable(node)) {
      ctx.focusView(node);
      return;
    }
    node = node.parent;
  }
}

/**
 * Route a mouse/wheel envelope: normalize 1-based→0-based (AR-63), hit-test top-most within the
 * scope, focus-on-(mouse)-click, and deliver with view-local `ev.local`. A point hitting nothing
 * (empty space / outside a modal) is a no-op (PA-6); never throws.
 *
 * @param ev  The mouse/wheel dispatch envelope.
 * @param ctx The loop-provided seams.
 */
export function hitTestRoute(ev: DispatchEvent, ctx: HitContext): void {
  const inner = ev.event;
  if (inner.type !== 'mouse' && inner.type !== 'wheel') return;

  const x = inner.x - 1; // 1-based → 0-based (AR-63)
  const y = inner.y - 1;

  // Pointer capture (PA-5): while a target is captured, every mouse/wheel event routes to it with
  // target-local coords — the hit-test and focus-on-click are bypassed so a drag/resize keeps
  // tracking the cursor even off the affordance / onto another view.
  if (ctx.captureTarget !== null) {
    const origin = absoluteOrigin(ctx.captureTarget);
    const local: Point = { x: x - origin.x, y: y - origin.y };
    ctx.deliver(ctx.captureTarget, { ...ev, local });
    return;
  }

  const scopeRoot = ctx.scopeRoot;
  if (scopeRoot === null) return;
  const rootRect: Rect = {
    x: scopeRoot.bounds.x,
    y: scopeRoot.bounds.y,
    width: scopeRoot.bounds.width,
    height: scopeRoot.bounds.height,
  };
  const hit = topMost(scopeRoot, scopeRoot.bounds.x, scopeRoot.bounds.y, rootRect, x, y);
  if (hit === null) return; // empty space / outside modal → ignored no-op (PA-6)

  if (inner.type === 'mouse' && inner.kind === 'down') focusOnClick(hit.view, ctx);

  // PF-007: `{ ...ev, local }` is a NEW envelope (DispatchEvent.local is readonly). Mouse/wheel skip
  // the 3-phase bubble, so nothing re-reads `handled` after delivery; if bubbling is ever added,
  // carry `handled` back.
  const local: Point = { x: x - hit.absX, y: y - hit.absY };
  ctx.deliver(hit.view, { ...ev, local });
}
