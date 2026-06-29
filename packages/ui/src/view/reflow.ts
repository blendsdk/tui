/**
 * The reflow pass (RD-03, AR-33 / AR-41 / PA-7) — the RD-02 ↔ RD-03 seam. It builds a **fresh**
 * `LayoutBox` tree from the live (visible) view tree each pass, keeping a per-pass
 * `Map<LayoutBox, View>`, calls RD-02 `layout(rootBox, viewport)`, and writes each resulting
 * parent-relative integer `Rect` back onto the corresponding `view.bounds`. A `visible:false` view
 * (and its subtree) is omitted, so its siblings reflow to fill the freed space (`display:none`).
 *
 * RD-02's "fresh tree, distinct instances" precondition holds by construction (a new box per view
 * per pass). Pure with respect to the view tree except the intended `bounds` writes (+ firing
 * pending `onMount` callbacks once the views have bounds).
 */
import { layout } from '../layout/index.js';
import type { LayoutBox, Size2D } from '../layout/index.js';
import { View } from './view.js';
import { Group } from './group.js';

/**
 * Reflow the view tree into the viewport: compute every visible view's parent-relative `bounds`
 * via RD-02 `layout()`, then fire pending `onMount` callbacks for newly-laid-out views (AR-36).
 *
 * @param root     The root view of the tree to lay out.
 * @param viewport The available size in cells.
 */
export function reflow(root: View, viewport: Size2D): void {
  const boxToView = new Map<LayoutBox, View>();
  const rootBox = buildBox(root, boxToView);
  if (rootBox === null) return; // root itself is hidden — nothing to lay out

  const rects = layout(rootBox, viewport);
  for (const [box, rect] of rects) {
    const view = boxToView.get(box);
    if (view !== undefined) view.bounds = rect;
  }

  firePendingMounts(root);
}

/**
 * Build a `LayoutBox` for a view (depth-first), recording the box→view mapping. Returns `null` for
 * a `visible:false` view so it (and its subtree) is omitted from the layout tree (AR-41).
 */
function buildBox(view: View, map: Map<LayoutBox, View>): LayoutBox | null {
  if (!view.state.visible) return null;

  const children: LayoutBox[] = [];
  if (view instanceof Group) {
    for (const child of view.children) {
      const childBox = buildBox(child, map);
      if (childBox !== null) children.push(childBox);
    }
  }

  const box: LayoutBox = {
    props: view.layout,
    children,
    measure: view.measure !== undefined ? view.measure.bind(view) : undefined,
  };
  map.set(box, view);
  return box;
}

/** Fire `onMount` once for every mounted, visible view now that the reflow has given it bounds. */
function firePendingMounts(view: View): void {
  if (!view.state.visible) return;
  if (view.mounted) view.runPendingMounts();
  if (view instanceof Group) {
    for (const child of view.children) firePendingMounts(child);
  }
}
