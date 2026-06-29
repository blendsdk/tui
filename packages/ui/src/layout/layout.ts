/**
 * The recursive two-axis layout pass (RD-02).
 *
 * Turns a {@link LayoutBox} tree + viewport into a {@link LayoutResult} of
 * parent-relative integer rectangles. Built on the node model + intrinsic
 * sizing (`measure.ts`) and the spike's `solveTrack`: each container resolves
 * its children's main-axis cell counts (`auto` pre-resolved via `naturalSize`,
 * then `solveTrack`), places them along the main axis, sizes/aligns them on the
 * cross axis, and recurses.
 *
 * Covers main-axis sizing + `gap` + `padding` content-box inset, `justify`
 * main-axis placement, cross-axis sizing + `align`, `row`/`col` via the axis
 * abstraction, overflow (fixed/auto extend past the edge, `fr` → 0), degenerate
 * viewports (zero-size rects, no throw), and recursion.
 *
 * Each container lays out its children in its **own local coordinate frame**
 * (box origin `(0,0)`), so every child rect is **parent-relative** — relative
 * to its parent's content-box origin, padding included (AR-27). Absolute screen
 * coordinates are reconstructed by the renderer summing ancestor origins.
 */
import { apportion, solveTrack, type TrackItem } from './apportion.js';
import { naturalSize } from './measure.js';
import type { Align, Direction, Justify, LayoutBox, LayoutResult, Rect, ResolvedProps, Size2D } from './types.js';
import { crossOf, mainOf, normalizeProps, sizeFromAxis, toCells } from './types.js';

/**
 * Lay out a box tree within a viewport. Pure: mutates neither `root` nor
 * anything reachable from it; returns a fresh map with one entry per box.
 *
 * @param root The root of the layout input tree.
 * @param viewport The available area; clamped to integers ≥ 0. The root is
 *   placed at origin `(0,0)` with this size (its own `size` prop is not used —
 *   the root always fills the viewport). (AR-27)
 * @returns A {@link LayoutResult} mapping every box to its parent-relative rect.
 */
export function layout(root: LayoutBox, viewport: Size2D): LayoutResult {
  const result: LayoutResult = new Map();
  const rootRect: Rect = {
    x: 0,
    y: 0,
    width: toCells(viewport.width),
    height: toCells(viewport.height),
  };
  result.set(root, rootRect);
  layoutContainer(root, { width: rootRect.width, height: rootRect.height }, result);
  return result;
}

/**
 * Lay out one container's direct children within its own local frame (box origin
 * `(0,0)` and the given size), then recurse into each child. Records every
 * child's parent-relative rect in `result`.
 *
 * @param box The container being laid out.
 * @param size The container's own width/height (its rect's extent); its position
 *   within its parent is not needed here — children are placed relative to this
 *   box's origin, keeping every rect parent-relative (AR-27).
 */
function layoutContainer(box: LayoutBox, size: Size2D, result: LayoutResult): void {
  if (box.children.length === 0) {
    return;
  }
  const props = normalizeProps(box.props);
  const content = contentBox(size, props);
  const direction = props.direction;
  const contentMain = mainOf(content, direction);
  const contentCross = crossOf(content, direction);

  // Children are sized/measured against the container's content box.
  const childAvailable: Size2D = { width: content.width, height: content.height };
  const mainSizes = solveMainSizes(box.children, contentMain, props, childAvailable);
  const mainOffsets = mainAxisOffsets(mainSizes, props.gap, contentMain, props.justify);

  for (let i = 0; i < box.children.length; i++) {
    const child = box.children[i];
    const main = mainSizes[i];
    const { size: cross, offset: crossOffset } = crossPlacement(
      child,
      childAvailable,
      direction,
      props.align,
      contentCross,
    );

    const childRect = assembleRect(content, mainOffsets[i], crossOffset, main, cross, direction);
    result.set(child, childRect);
    layoutContainer(child, { width: childRect.width, height: childRect.height }, result);
  }
}

/**
 * The content box in the container's local frame: origin at the top-left padding
 * inset `(padding.left, padding.top)`, each extent the box size minus padding,
 * clamped to ≥ 0 (a padding larger than the box collapses content to zero).
 */
function contentBox(size: Size2D, props: ResolvedProps): Rect {
  const { padding } = props;
  return {
    x: padding.left,
    y: padding.top,
    width: toCells(size.width - padding.left - padding.right),
    height: toCells(size.height - padding.top - padding.bottom),
  };
}

/**
 * Resolve each child's main-axis cell count: `fixed` → its cells, `auto` →
 * pre-resolved natural main extent, `fr` → flex share — then distribute via the
 * integer-exact `solveTrack` (PA-5).
 */
function solveMainSizes(
  children: readonly LayoutBox[],
  contentMain: number,
  props: ResolvedProps,
  available: Size2D,
): number[] {
  const direction = props.direction;
  const items: TrackItem[] = children.map((child) => {
    const { size } = normalizeProps(child.props);
    if (size.kind === 'fixed') {
      return { kind: 'fixed', size: size.cells };
    }
    if (size.kind === 'fr') {
      return { kind: 'flex', weight: size.weight };
    }
    // auto → pre-resolve to a fixed natural main extent (PA-5).
    return { kind: 'fixed', size: mainOf(naturalSize(child, available), direction) };
  });
  return solveTrack(contentMain, items, props.gap);
}

/**
 * Compute each child's main-axis offset from the run of main sizes, honoring
 * `justify` (AR-24). `free = max(0, contentMain − used)` is the leftover space
 * when no `fr` child absorbed it; the `max(0, …)` clamp is load-bearing for
 * overflow (AR-28): when children overflow, `free` is 0 and every `justify`
 * runs from offset 0, so children extend past the far edge — never a negative
 * offset past the near edge.
 *
 * - `start` → run at 0; `end` → run at `free`; `center` → run at `floor(free/2)`;
 * - `space-between` → distribute `free` into the inter-child gaps (integer-exact
 *   via `apportion`) on top of the base `gap`; a single child behaves like `start`.
 */
function mainAxisOffsets(mainSizes: readonly number[], gap: number, contentMain: number, justify: Justify): number[] {
  const n = mainSizes.length;
  const offsets = new Array<number>(n).fill(0);
  const baseGapTotal = n > 1 ? gap * (n - 1) : 0;
  const used = mainSizes.reduce((sum, s) => sum + s, 0) + baseGapTotal;
  const free = Math.max(0, contentMain - used);

  if (justify === 'space-between' && n > 1) {
    const extra = apportion(free, new Array<number>(n - 1).fill(1));
    let offset = 0;
    for (let i = 0; i < n; i++) {
      offsets[i] = offset;
      offset += mainSizes[i] + gap + (i < n - 1 ? extra[i] : 0);
    }
    return offsets;
  }

  let offset = justify === 'end' ? free : justify === 'center' ? Math.floor(free / 2) : 0;
  for (let i = 0; i < n; i++) {
    offsets[i] = offset;
    offset += mainSizes[i] + gap;
  }
  return offsets;
}

/**
 * Resolve a child's cross-axis size and offset for the container's `align`
 * (AR-25). `stretch` (default) fills the content cross extent at offset 0; the
 * others take the child's natural cross size (clamped to the content cross
 * extent) positioned at the near edge / centered / far edge.
 */
function crossPlacement(
  child: LayoutBox,
  available: Size2D,
  direction: Direction,
  align: Align,
  contentCross: number,
): { size: number; offset: number } {
  if (align === 'stretch') {
    return { size: contentCross, offset: 0 };
  }
  const natural = crossOf(naturalSize(child, available), direction);
  const size = Math.min(natural, contentCross);
  if (align === 'center') {
    return { size, offset: Math.floor((contentCross - size) / 2) };
  }
  if (align === 'end') {
    return { size, offset: contentCross - size };
  }
  return { size, offset: 0 }; // 'start'
}

/**
 * Build a child's parent-relative rect from its main/cross offsets and sizes,
 * mapped back to `(x,y,width,height)` for the container's direction. Offsets are
 * relative to the content-box origin, so the rect already includes padding (AR-27).
 */
function assembleRect(
  content: Rect,
  mainOffset: number,
  crossOffset: number,
  mainSize: number,
  crossSize: number,
  direction: 'row' | 'col',
): Rect {
  const origin = sizeFromAxis(mainOffset, crossOffset, direction);
  const size = sizeFromAxis(mainSize, crossSize, direction);
  return {
    x: content.x + origin.width,
    y: content.y + origin.height,
    width: size.width,
    height: size.height,
  };
}
