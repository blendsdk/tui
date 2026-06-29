# RD-02: Layout Engine

> **Document**: RD-02-layout-engine.md
> **Status**: Draft
> **Created**: 2026-06-29
> **Project**: jsvision UI (`@jsvision/ui`)
> **Depends On**: — (architecture settled in [ADR-008](../docs/decisions/ADR-008-layout-engine.md); builds on the landed `apportion`/`solveTrack` spike)
> **CodeOps Skills Version**: 2.0.0

---

## Feature Overview

The layout engine is the second UI-independent pillar of `@jsvision/ui`. Turbo Vision
gave applications nothing but absolute `(x, y)` coordinates; nesting, resizing, and
dynamic content make that untenable. This RD specifies a **cell-native flex layout
engine**: a pure function that takes a tree of layout boxes and a viewport size and
returns the integer rectangle each box occupies.

Per **ADR-008** (Accepted) the engine is built in pure TypeScript rather than adopting
Yoga/Taffy, because terminal cells are integers and every box must land on an integer
column/row. The engine distributes leftover cells with **largest-remainder (Hamilton)
apportionment** so a row/column fills its container *exactly* — no 1-cell gaps or
overlaps at flex boundaries (the float-rounding failure mode of float-based engines).
The 1-D distribution core already exists and is golden-tested: `solveTrack(total, items,
gap)` over `TrackItem = { kind:'fixed', size } | { kind:'flex', weight }`
(`packages/ui/src/layout/apportion.ts`). RD-02 builds the **box/node model and the
two-axis recursive layout pass** on top of it.

Scope is a **deliberate flex subset** (ADR-008): `row`/`col` containers with
`fixed`/`fr`/`auto` sizing, `justify`/`align`, `gap`/`padding`. 2-D **grid** is Tier 2
(behind the same interface); `stack`/overlay and min/max constraints are deferred. It is
fully **UI-independent** — generic over a plain `LayoutBox` tree; the binding of layout
to real widgets lives in the view/group spine (RD-03).

Complexity: **L** (the recursive two-axis pass + intrinsic `auto` sizing + integer
apportionment interplay is the hard part; the distribution core is already de-risked).

---

## Functional Requirements

### Must Have

- [ ] **`layout(root, viewport)`** — a pure function taking a `LayoutBox` tree and a viewport `{ width, height }` (cells) and returning, for every box, its **parent-relative** integer `Rect`. No mutation of the input. (AR-19, AR-27)
- [ ] **`LayoutBox` input model** — a standalone tree `{ props, children, measure? }`, independent of any widget type; RD-03's `View` later produces it. Layout operates only on this shape. (AR-22, AR-23)
- [ ] **`row` / `col` containers** — `props.direction` selects the main axis (`row` = horizontal, `col` = vertical). 2-D is achieved by nesting. (AR-22)
- [ ] **Size tokens (main axis)** — each box declares how its parent sizes it along the parent's main axis: `fixed` (exact integer cells), `fr` (grow-weight share of leftover space), or `auto` (size to content). (AR-20)
- [ ] **Integer apportionment** — `fr` children split the leftover main-axis space via largest-remainder so the children's sizes sum **exactly** to the available space (no gap/overlap); leftover cells go to the largest fractional remainders. Built on the existing `solveTrack`/`apportion` core. (AR-19)
- [ ] **`auto` / intrinsic sizing via `measure()`** — an `auto`-sized box gets its natural main-axis extent from an optional `measure(available) → { width, height }` callback (e.g. a label measuring its text). A box **without** `measure` derives its natural size from its children (main = sum of child main sizes + gaps + padding; cross = max child cross + padding). This keeps the engine view-independent while enabling content sizing. (AR-21)
- [ ] **Cross-axis alignment (`align`)** — `start` / `center` / `end` / `stretch`; **default `stretch`** (children fill the container's cross axis). Non-stretch children take their natural (measured) cross size and are positioned within the cross extent. (AR-25)
- [ ] **Main-axis distribution (`justify`)** — `start` / `center` / `end` / `space-between`; governs placement of leftover main-axis space when no `fr` child absorbs it. **Default `start`.** (AR-24)
- [ ] **`gap`** — an integer cell count inserted **between** adjacent children (never before the first or after the last), already supported by `solveTrack`. Default `0`. (AR-29)
- [ ] **`padding`** — a per-side (or uniform) integer inset that reduces the container's content box; children are laid out within the padded area. Default `0`. (AR-29)
- [ ] **Overflow (no shrink)** — if `fixed`/`auto` children's total exceeds the available main-axis space (and no `fr` absorbs it), boxes keep their requested sizes and the resulting rects **extend past the container edge**; `fr` children clamp to `0`. There is no shrink in v1; the renderer/clip (and later the scroll widget) handles visibility. (AR-28)
- [ ] **Parent-relative rects** — each box's `Rect` is expressed relative to its parent's content box origin; the root is laid out within the given viewport at origin `(0,0)`. (AR-27)
- [ ] **Integer & non-negative output** — every `Rect` field is an integer ≥ 0 in size; a zero/negative viewport (or padded area) yields zero-size rects without error. (AR-19)
- [ ] **Packaging** — pure TypeScript, no third-party/native runtime dependencies (only Node built-ins and, where geometry types are shared, the declared workspace dep `@jsvision/core`); ESM/NodeNext; lives in `packages/ui/src/layout/` (extending the existing module) and is re-exported through the single `@jsvision/ui` entry point; `yarn check:deps` passes. (AR-19)

### Should Have

- [ ] **Uniform-padding shorthand** — `padding` accepts a single number (all sides) as well as a per-side object.
- [ ] **Stable, side-effect-free pass** — calling `layout` twice on the same input yields identical results (referential-transparency aid for golden tests and re-layout).

### Won't Have (Out of Scope)

- **2-D `grid`** (fixed/`fr`/`auto` tracks in two axes) — ADR-008 Tier 2; added later behind the same interface. (AR-22)
- **`stack` / z-overlap containers** — deferred until a real need (modals can position absolutely meanwhile). (AR-22)
- **`min`/`max` size constraints** — deferred; constrained apportionment is real effort and outside the ADR-008 v1 subset. Documented limitation. (AR-26)
- **CSS-fidelity flex features** — `flex-shrink`/`basis` triple, `wrap`, `aspect-ratio`, baseline alignment, `space-around`/`space-evenly` — not in v1. (AR-20, AR-24)
- **The `ViewNode` type, painting, dirty-marking, scroll/clip** — owned by RD-03/the renderer; RD-02 only computes rects. (AR-23)
- **Re-layout scheduling / signal wiring** — making layout reactive (re-running on a signal change) is the view layer's job (an `effect` over signal-backed props); RD-02 is a pure function.

---

## Technical Requirements

### Public API surface

```ts
import type { /* geometry types if shared */ } from '@jsvision/core';

/** Cell dimensions. */
interface Size2D { width: number; height: number; }
/** A parent-relative rectangle in integer cells. */
interface Rect { x: number; y: number; width: number; height: number; }

/** How a box is sized along its parent's main axis (AR-20). */
type Size =
  | { kind: 'fixed'; cells: number }   // exact integer cells
  | { kind: 'fr'; weight: number }     // grow-weight share of leftover space
  | { kind: 'auto' };                  // size to content (via measure() / children)

/** Main-axis distribution of leftover space (AR-24). */
type Justify = 'start' | 'center' | 'end' | 'space-between';
/** Cross-axis alignment of children (AR-25). */
type Align = 'start' | 'center' | 'end' | 'stretch';

/** Per-side content inset, in integer cells (AR-29). */
interface Padding { top: number; right: number; bottom: number; left: number; }

/** Layout properties of a box. All optional; conventional defaults noted. */
interface LayoutProps {
  direction?: 'row' | 'col';     // container main axis (default 'row')
  size?: Size;                   // size within the parent's main axis (default { kind:'auto' })
  justify?: Justify;             // main-axis distribution (default 'start')
  align?: Align;                 // cross-axis alignment (default 'stretch')
  gap?: number;                  // integer cells between children (default 0)
  padding?: number | Padding;    // content inset (default 0)
}

/** A node in the layout input tree (AR-23). */
interface LayoutBox {
  props: LayoutProps;
  children: readonly LayoutBox[];
  /**
   * Natural content size given the available space — used for an `auto`-sized box
   * (e.g. a label measuring its text). Omitted ⇒ the engine derives the natural size
   * from `children` (a pure container); an `auto` leaf with no `measure` resolves to 0.
   */
  measure?: (available: Size2D) => Size2D;
}

/** The computed rect for every box, keyed by box identity (parent-relative). */
type LayoutResult = Map<LayoutBox, Rect>;

/** Lay out a box tree within a viewport; pure, no input mutation (AR-19, AR-27). */
function layout(root: LayoutBox, viewport: Size2D): LayoutResult;
```

### Behavior notes

- **Two-axis pass** — for a container, the engine resolves the **main axis** by
  classifying each child's `size`: `fixed` takes its cells; `auto` takes its natural
  extent (`measure()` or derived-from-children); `fr` children split whatever main-axis
  space remains via `solveTrack`/largest-remainder. The **cross axis** is governed by
  `align`: `stretch` fills the container's cross extent, otherwise the child takes its
  natural cross size and is positioned `start`/`center`/`end`.
- **Intrinsic sizing** — a container's own `auto` natural size is computed from its
  children: main = Σ child main sizes + total gap + main padding; cross = max child cross
  size + cross padding. This composes recursively, so `auto` works for nested containers
  without a `measure` on every node.
- **`justify` only applies when there is leftover main-axis space** (i.e. no `fr` child
  consumed it). `space-between` distributes the leftover into the inter-child gaps
  (apportioned in integer cells); `start`/`center`/`end` offset the whole run.
- **Conventional defaults** — `direction:'row'`, `size:'auto'`, `justify:'start'`,
  `align:'stretch'`, `gap:0`, `padding:0` (CSS-flex-parity defaults; flagged for the
  RD-02 preflight to confirm).
- **Coordinate space** — `layout` returns parent-relative rects; the view/renderer
  translates a child rect by its ancestors' origins (and clips) when painting into the
  core `ScreenBuffer`. (AR-27)
- **Determinism** — `layout` is a pure function of `(root, viewport)` and any values
  `measure` returns; it mutates nothing and is safe to call repeatedly (re-layout is just
  another call).

---

## Integration Points

### With RD-03 (View/Group spine — backlog)

- **Box production** — a `View`/`Group` produces (or implements) a `LayoutBox`: its
  `props` come from the widget's layout attributes, its `children` from child views, and
  its `measure` (for `auto`/content-sized widgets like a label or button) reports the
  widget's natural size. RD-02 computes rects; RD-03 paints each view into its rect.
- **Re-layout** — when a signal-backed layout prop changes (RD-01), the view layer
  re-runs `layout` inside an `effect` and repaints. RD-02 stays a pure function; the
  reactive wiring lives in RD-03.

### With RD-01 (Reactive core — done)

- No direct dependency. Layout inputs *may* be signal-backed, but the subscription and
  re-layout-on-change wiring belongs to the view layer, not the layout function. (RD-01 §Integration)

### With `@jsvision/core` (done)

- Consumes cell/geometry conventions (integer columns/rows). If a `Rect`/size geometry
  type is already exported by core, RD-02 reuses it rather than redefining; otherwise the
  small geometry types above live in `src/layout/`. (Confirm during planning.)

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Engine architecture | build cell-native pure-TS · buy Yoga/Taffy | cell-native pure-TS, flex-first, `src/layout/` | integer correctness by construction; zero-dep identity | AR-19 (ADR-008) |
| Sizing model | `fr`/fixed/auto tokens · CSS grow/shrink/basis · both | fixed/`fr`/`auto` tokens | matches the spike's `TrackItem`; terminal-idiomatic; ADR-008 dropped full flexbox | AR-20 |
| Content sizing | `measure()` seam · defer (fixed+fr only) | `auto` via `measure()` + derived-from-children | content sizing without coupling to widgets | AR-21 |
| v1 primitives | row+col · +stack · +grid | `row` + `col` only | smallest correct surface; grid Tier 2, stack deferred | AR-22 |
| Layout input | standalone `LayoutBox` tree · props on `ViewNode` | standalone `LayoutBox` tree | view-independent, independently testable (ADR-008 pure-function seam) | AR-23 |
| Justify | start/center/end/space-between · full 6 · start/center/end | start/center/end/space-between | covers TUI needs; around/evenly rarely needed | AR-24 |
| Align + default | …/stretch default stretch · default start · stretch-only | start/center/end/stretch, default **stretch** | matches CSS/Textual; what panels want | AR-25 |
| Min/max | defer · include clamps | deferred | ADR-008 v1 subset; constrained apportionment is real effort | AR-26 |
| Coordinate space | parent-relative · absolute | parent-relative rects | composes with clip/scroll/nesting | AR-27 |
| Overflow | extend past edge (renderer clips) · clamp into bounds | extend past edge; no shrink | predictable; no surprise squishing | AR-28 |
| Gap & padding | both · gap only | both `gap` and `padding` | forms/panels need padding | AR-29 |

> **Traceability:** every decision references its Ambiguity Register entry (`00-ambiguity-register.md`); AR-19 inherits ADR-008.

---

## Security Considerations

> A pure, in-process geometry function: no network, no persistence, no external I/O, no
> untrusted-input parsing. Most categories are N/A and are recorded as such honestly.

- **Data sensitivity**: none — operates on developer-provided sizes/box trees; no PII,
  credentials, or persistence.
- **Input validation**: accepts developer-provided numbers and a box tree, not untrusted
  external input. There is no parser, `eval`, template, SQL, shell, HTML, or filesystem
  surface — no injection class applies. Degenerate inputs (zero/negative viewport,
  negative sizes, empty children) resolve to zero-size rects rather than throwing.
- **Authentication & authorization**: N/A (in-process library, no access boundary).
- **Injection risks**: N/A (see above).
- **Availability**: `layout` is a single bounded pass over a finite tree (no fixpoint
  iteration, no unbounded loop); a pathologically deep tree is bounded by the input's own
  size. A cyclic `LayoutBox` graph is a caller error (the input is a tree by contract);
  planning should decide whether to guard against accidental cycles or document the
  precondition.
- **Encryption / rate limiting / infrastructure**: N/A.

---

## Acceptance Criteria

1. [ ] **Fixed row fills exactly** — a `row` of `fixed` children plus one `fr` child within a known width yields integer rects whose widths sum **exactly** to the content width (no gap/overlap). (AR-19)
2. [ ] **`fr` apportionment** — a `row` of three equal-`fr` children across 80 cells yields widths summing to 80 with the leftover going to the earliest children (e.g. `27,27,26`), matching the `solveTrack` golden. (AR-19, AR-20)
3. [ ] **Fixed + `fr` mix** — `fixed` children take their exact cells and the `fr` children split only the remaining space, still summing exactly to the container. (AR-20)
4. [ ] **`auto` leaf via `measure`** — an `auto`-sized leaf whose `measure()` reports `{width:5,height:1}` is laid out at width 5 on a horizontal main axis. (AR-21)
5. [ ] **`auto` container from children** — an `auto` `row` with no `measure` and two `fixed` children (3 and 4 cells) + `gap:1` reports a natural width of 8 and lays the children out accordingly. (AR-21)
6. [ ] **`gap` between children only** — `gap:2` inserts 2 cells between each adjacent pair and **not** before the first or after the last child. (AR-29)
7. [ ] **`padding` insets content** — `padding:1` on a 10×4 container lays children out within the inner 8×2 content box, offset by `(1,1)`. (AR-29)
8. [ ] **`justify` placement** — with leftover main-axis space and no `fr`: `start` packs at offset 0, `end` packs flush to the far edge, `center` centers the run, and `space-between` puts the leftover between children (first flush start, last flush end). (AR-24)
9. [ ] **`align` cross axis** — default `stretch` makes a child fill the container's cross extent; `start`/`center`/`end` give the child its natural cross size positioned at the near edge / centered / far edge. (AR-25)
10. [ ] **Nested composition** — a `col` containing a `row` produces correct 2-D rects (the inner row's children rects are relative to the row, which is relative to the column). (AR-22, AR-27)
11. [ ] **Parent-relative rects** — a child's `Rect.x/y` is relative to its parent's content-box origin (not absolute screen coordinates). (AR-27)
12. [ ] **Overflow extends, no shrink** — `fixed`/`auto` children whose total exceeds the container keep their sizes and produce rects extending past the container edge; any `fr` child in the same container resolves to width 0. (AR-28)
13. [ ] **Degenerate viewport** — a viewport of `{width:0,height:0}` (or a padding larger than the box) yields zero-size rects for all boxes without throwing. (AR-19)
14. [ ] **`col` mirrors `row`** — the same cases on the vertical main axis (`direction:'col'`) behave identically with width/height swapped. (AR-22)
15. [ ] **Integer & non-negative** — every `Rect` field in every result is an integer and no size is negative, for all of the above. (AR-19)
16. [ ] **Purity** — calling `layout(root, viewport)` twice returns equal results and does not mutate `root`. (Should-Have)
17. [ ] **Packaging** — the layout engine imports nothing beyond the package, its declared workspace deps, and Node built-ins (`yarn check:deps` passes); `layout`, `LayoutBox`, `LayoutProps`, `Size`, `Rect` (and the existing `apportion`/`solveTrack`/`TrackItem`) are importable from `@jsvision/ui`. (AR-19)
18. [ ] **Security verified** — no external-input/injection/auth surface exists; degenerate inputs resolve to zero-size rects (not exceptions); the pass is a single bounded traversal of a finite tree. (Security §)

---

> **Next step:** run the make_plan skill on RD-02 to produce the implementation plan,
> then preflight, then exec_plan — the same path RD-01 followed.
