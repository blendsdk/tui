# Component: Node Model & Sizing (`types.ts`, `measure.ts`)

> **Files**: `types.ts`, `measure.ts`
> **CodeOps Skills Version**: 2.0.0

The input model the layout pass operates on, and the intrinsic-sizing helpers that turn
`auto` boxes into concrete cell counts before the track solve.

## Node model (`types.ts`)

```ts
/** Cell dimensions. */
export interface Size2D { width: number; height: number; }

/** A parent-relative rectangle in integer cells. */
export interface Rect { x: number; y: number; width: number; height: number; }

/** Per-side content inset, in integer cells (AR-29). */
export interface Padding { top: number; right: number; bottom: number; left: number; }

/** How a box is sized along its parent's main axis (AR-20). */
export type Size =
  | { kind: 'fixed'; cells: number }   // exact integer cells
  | { kind: 'fr'; weight: number }     // grow-weight share of leftover space
  | { kind: 'auto' };                  // size to content (measure() or children)

/** Main-axis distribution of leftover space (AR-24). */
export type Justify = 'start' | 'center' | 'end' | 'space-between';
/** Cross-axis alignment of children (AR-25). */
export type Align = 'start' | 'center' | 'end' | 'stretch';

/** Layout properties of a box; all optional with CSS-parity defaults (PA-3). */
export interface LayoutProps {
  direction?: 'row' | 'col';   // container main axis (default 'row')
  size?: Size;                 // size within the parent's main axis (default { kind:'auto' })
  justify?: Justify;           // main-axis distribution (default 'start')
  align?: Align;               // cross-axis alignment (default 'stretch')
  gap?: number;                // integer cells between children (default 0)
  padding?: number | Padding;  // content inset (default 0)
}

/** A node in the layout input tree (AR-23). */
export interface LayoutBox {
  props: LayoutProps;
  children: readonly LayoutBox[];
  /** Natural content size for an `auto` box; omitted ⇒ derived from children (AR-21). */
  measure?: (available: Size2D) => Size2D;
}

/** The computed rect for every box, keyed by box identity (parent-relative). */
export type LayoutResult = Map<LayoutBox, Rect>;
```

> `Size2D`/`Rect`/`Padding` are defined here, not imported — `@jsvision/core` exports no
> geometry type (PA-2). Public types carry JSDoc.

> **Input precondition (RD-02 §Availability).** A `LayoutBox` tree is **acyclic** and every
> box instance is **distinct** (no node reused at two positions). Both are caller contracts,
> not runtime-guarded: the pass is a single bounded traversal with no cycle/`visited` check
> (zero hot-path cost, consistent with the pure-function design). A cycle would recurse
> unboundedly; a reused instance would collide in `LayoutResult` (keyed by box identity →
> last-write-wins). The `LayoutBox` JSDoc states this precondition; callers (RD-03's view
> spine) only ever build fresh trees.

### Resolved defaults (PA-3, CSS-flex-parity)

A single internal helper normalizes `props` so the pass never branches on `undefined`:

```ts
const DEFAULTS = { direction: 'row', size: { kind: 'auto' }, justify: 'start',
                   align: 'stretch', gap: 0 } as const;
// padding normalizes: number n → {top:n,right:n,bottom:n,left:n}; object → as-is; undefined → all 0.
```

Negative `gap`/`padding`/`fixed.cells`/`fr.weight` are clamped to ≥ 0 (consistent with the
spike's `Math.max(0, …)`); this is an internal invariant, not new API.

## Axis abstraction

The pass is written **once** over an abstract main/cross axis and applied to both `row`
(main = x/width, cross = y/height) and `col` (main = y/height, cross = x/width). This is
how `col` mirrors `row` for free (AC-14) — there is no duplicated vertical code path.

## Intrinsic sizing (`measure.ts`, AR-21, PA-5)

**`available` semantics.** `available` is the **content-box `Size2D` of the container doing
the measuring** (the parent's rect inset by its padding) at the point `naturalSize` is called.
It is the space the box may size itself against — e.g. a text `measure()` wraps to
`available.width`. The root's `available` is the viewport (clamped to integers ≥ 0). It is
threaded down the natural-size recursion: a container passes its own content-box size as the
`available` for measuring each child.

`naturalSize(box, available): Size2D` — the natural (content) size a box wants, used to
resolve `auto`:

1. **Leaf or `measure` provided** — if `box.measure` is defined, return `box.measure(available)`
   (clamped to integers ≥ 0). This is how a label/button reports its text size without the
   engine knowing about widgets.
2. **Container, no `measure`** — derive from children along the box's own `direction`:
   - main extent = Σ `naturalSize(child).main` + `gap × (childCount − 1)` + main padding;
   - cross extent = max `naturalSize(child).cross` + cross padding.
   A child's contribution uses its **own** `size`: a `fixed` child contributes its `cells`,
   an `auto` child its `naturalSize`, an `fr` child contributes `0` to the natural main
   extent (it only grows when there *is* leftover space — it has no intrinsic main size).
3. **`auto` leaf with no `measure`** — resolves to `{0,0}` (documented; a real widget always
   supplies `measure`).

`naturalSize` is pure and recursive over the tree; the final rect pass (`layout.ts`) calls
it to resolve each `auto` child's main-axis cell count *before* invoking `solveTrack`.

## Main-axis sizing (consumed by `layout.ts`)

Given a container with content-box main extent `M` and its children, compute each child's
main size:

1. Resolve each child to a `TrackItem`:
   - `fixed` → `{ kind:'fixed', size: cells }`
   - `auto` → `{ kind:'fixed', size: naturalSize(child, available).main }` (pre-resolved, PA-5)
   - `fr` → `{ kind:'flex', weight }`
2. `solveTrack(M, trackItems, gap)` → one integer main size per child, summing exactly to
   `M` when an `fr` child has free space (largest-remainder; the spike guarantee). (AR-19)
3. **Overflow (AR-28)**: `solveTrack` already returns `fixed` items at their full size and
   gives `fr` items `0` when no free space remains; when Σ fixed/auto + gaps > `M`, the
   returned fixed sizes are unchanged (they sum past `M`) and the pass lays them out
   sequentially so later children's rects extend past the edge — no shrink.

## Traceability

AR-19, AR-20, AR-21, AR-23, AR-24, AR-25, AR-28, AR-29 · PA-2, PA-3, PA-5. ACs: 1–6, 12.
