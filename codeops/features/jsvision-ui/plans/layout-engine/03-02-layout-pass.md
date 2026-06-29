# Component: The Layout Pass (`layout.ts`)

> **Files**: `layout.ts`
> **CodeOps Skills Version**: 2.0.0

The recursive two-axis pass that turns a `LayoutBox` tree + viewport into a
`Map<LayoutBox, Rect>` of parent-relative integer rectangles. Builds on the node model and
intrinsic sizing (03-01) and the spike's `solveTrack`.

## Entry point

```ts
export function layout(root: LayoutBox, viewport: Size2D): LayoutResult;
```

- Pure: mutates neither `root` nor anything reachable from it; returns a fresh `Map`. (RD-02 Should-Have)
- The root is laid out into a rect at origin `(0,0)` with the viewport's size (clamped to
  integers ≥ 0). Its children are placed within its content box. (AR-27)
- Degenerate viewport (`{0,0}`, negative, or padding ≥ size) ⇒ every rect is zero-size,
  no throw. (AR-19)

## Algorithm (per container, over the abstract main/cross axis)

For a container box with an assigned rect `R` (parent-relative):

1. **Content box** — inset `R` by `padding`: content origin `(R.x+left, R.y+top)`, content
   size `(R.width−left−right, R.height−top−bottom)`, each clamped to ≥ 0. (AR-29)
2. **Main sizes** — compute each child's main-axis cell count via the main-axis sizing rule
   (03-01): `auto` pre-resolved through `naturalSize`, passing the **step-1 content box** as the
   child's `available` (03-01 §`available` semantics), then `solveTrack(contentMain, items, gap)`. (AR-20, AR-21, PA-5)
3. **Main offsets (`justify`)** — sum the children's main sizes + gaps = `used`; `free =
   max(0, contentMain − used)`. **The clamp to ≥ 0 is load-bearing for overflow (AR-28):** when
   children overflow (`used > contentMain`, no `fr`), `free` is 0, so every `justify` runs the
   children from offset 0 and they extend past the **far** edge — never a negative offset past
   the near edge, for any `justify`.
   - if any child is `fr`, `free` is already 0 (the `fr` children absorbed it) → place
     sequentially from offset 0 with `gap` between;
   - else distribute `free` by `justify` (AR-24): `start` → run at 0; `end` → run at `free`;
     `center` → run at `floor(free/2)`; `space-between` → spread the leftover into the
     inter-child gaps via `apportion(free, ones)` **on top of the base `gap`** (integer-exact;
     one child → behaves like `start`).
4. **Cross size + offset (`align`)** — content cross extent = `contentCross`:
   - `stretch` (default) → child cross size = `contentCross`, cross offset 0; (AR-25)
   - `start`/`center`/`end` → child cross size = `naturalSize(child).cross` (clamped to
     `contentCross`), cross offset `0` / `floor((contentCross−c)/2)` / `contentCross−c`.
5. **Assemble each child's parent-relative `Rect`** from (main offset, cross offset, main
   size, cross size), mapped back to `(x,y,width,height)` per the container's `direction`
   (`row`: main→x/width, cross→y/height; `col`: main→y/height, cross→x/width). The child's
   rect is relative to the **content box** origin — i.e. it already includes the padding
   offset, so it is parent-relative as required. (AR-27)
6. **Recurse** — for each child, record its `Rect` in the result map and recurse into it
   with that rect as its container rect. Leaves (no children) just get their rect.

> **Overflow (AR-28)**: when fixed/auto children exceed `contentMain`, step 2 leaves their
> sizes intact and step 3 places them sequentially from offset 0; later children's main
> offsets therefore exceed `contentMain` and their rects extend past the content edge. `fr`
> children resolved to 0 collapse. The pass never shrinks a child or clips a rect — the
> renderer/scroll does. Rects may have origins/extents beyond the parent; sizes stay ≥ 0.

## Invariants (asserted by impl tests)

- Every `Rect` field is an integer; widths/heights ≥ 0. (AC-15)
- For a container with at least one `fr` child and no overflow, Σ child main sizes + gaps
  == content main extent **exactly** (no gap/overlap). (AC-1, AR-19)
- `gap` appears only *between* children, never before the first / after the last. (AC-6)
- The result `Map` has exactly one entry per box in the tree (root included).
- `layout` is referentially transparent: two calls on the same input return equal maps and
  the input is unchanged. (AC-16)

## File-size watch

If `layout.ts` approaches 500 lines once justify + align + overflow + the axis mapping are
in, split the pure helpers (justify offset, align offset, axis map/unmap) into
`layout-axis.ts` and keep `layout.ts` as the recursive driver (PA-1 granular spirit).

## Traceability

AR-19, AR-22, AR-24, AR-25, AR-27, AR-28, AR-29 · PA-1, PA-5. ACs: 7–16.
