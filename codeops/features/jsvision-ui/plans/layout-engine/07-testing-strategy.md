# Testing Strategy — Layout Engine

> **CodeOps Skills Version**: 2.0.0

Specification-first (CLAUDE.md): write `*.spec.test.ts` from RD-02 acceptance criteria →
confirm red → implement → green → add `*.impl.test.ts` for internals/edges → verify.
**Spec tests are immutable oracles**: each ST below derives from an RD-02 AC, never from
implementation behavior. If a spec test fails after implementation, the implementation is
wrong.

All tests are vitest `unit` (`*.{spec,impl}.test.ts`), importing the API by name from
`../src/layout/index.js` (or `@jsvision/ui` for the packaging spec). File layout per
[02-current-state.md](02-current-state.md) §Test file layout. Layout goldens assert **exact
integer rects** (the project's golden-test sweet spot).

## Specification test cases (ST → AC, 1:1)

| ST | File | Input → Expected | Trace |
|----|------|------------------|-------|
| ST-01 | sizing.spec | `row` width 10, children `[fixed 3, fr 1]` → widths `[3, 7]` summing exactly to 10 | AC-1 / AR-19 |
| ST-02 | sizing.spec | `row` width 80, children `[fr 1, fr 1, fr 1]` → `[27, 27, 26]` (leftover to earliest) | AC-2 / AR-20 |
| ST-03 | sizing.spec | `row` width 20, children `[fixed 5, fr 1, fr 1]` → `[5, 8, 7]` (fixed kept, fr split remainder, sum 20) | AC-3 / AR-20 |
| ST-04 | sizing.spec | `row`, child `auto` with `measure()→{width:5,height:1}` → that child laid out width 5 | AC-4 / AR-21 |
| ST-05 | sizing.spec | `auto` `row`, no `measure`, children `[fixed 3, fixed 4]`, `gap:1` → natural width 8; children at x 0 and 4 | AC-5 / AR-21 |
| ST-06 | sizing.spec | `row` children `[fixed 2, fixed 2, fixed 2]`, `gap:2` → x offsets `0, 4, 8` (gap between only, not outside) | AC-6 / AR-29 |
| ST-07 | align.spec | 10×4 container, `padding:1` → children laid out within inner 8×2 box, offset `(1,1)` | AC-7 / AR-29 |
| ST-08 | align.spec | `row` width 10, single `fixed 4` child, no `fr`: `justify:'start'`→x 0; `'end'`→x 6; `'center'`→x 3; two children + `'space-between'`→first at start, last flush end | AC-8 / AR-24 |
| ST-09 | align.spec | `row` height 4, child `fixed 6`×(natural height 1): `align:'stretch'`(default)→child height 4; `'start'`→height 1 at y 0; `'center'`→y 1; `'end'`→y 3 | AC-9 / AR-25 |
| ST-10 | tree.spec | `col` containing a `row`: inner row's children rects are relative to the row, which is relative to the column (correct 2-D nesting) | AC-10 / AR-22, AR-27 |
| ST-11 | tree.spec | a child's `Rect.x/y` is relative to its parent's content-box origin, not absolute screen coords | AC-11 / AR-27 |
| ST-12 | tree.spec | `row` width 6, children `[fixed 4, fixed 4, fr 1]`: fixed children keep size and extend past edge (x 0, x 4 → past 6); the `fr` child resolves to width 0 | AC-12 / AR-28 |
| ST-13 | tree.spec | viewport `{width:0,height:0}` (and padding ≥ size) → all rects zero-size, no throw | AC-13 / AR-19 |
| ST-14 | tree.spec | the ST-01…ST-03 cases on `direction:'col'` behave identically with width/height swapped | AC-14 / AR-22 |
| ST-15 | tree.spec | every `Rect` field across all above is an integer and no size is negative | AC-15 / AR-19 |
| ST-16 | packaging.spec | `layout(root, vp)` called twice returns equal results and `root` is not mutated | AC-16 / Should-Have |
| ST-17 | packaging.spec | `layout`, `LayoutBox`, `LayoutProps`, `Size`, `Rect` (+ `apportion`/`solveTrack`/`TrackItem`) import from `@jsvision/ui`; `yarn check:deps` passes | AC-17 / AR-19 |
| ST-18 | packaging.spec | no external-input/injection/auth surface; degenerate inputs resolve to zero-size rects (not exceptions); a single bounded traversal of a finite tree | AC-18 / Security § |

## Implementation tests (`*.impl.test.ts`) — internals & edges (not exhaustive)

- **sizing.impl**: negative `fixed.cells`/`fr.weight`/`gap` clamped to 0; `fr` with mixed weights (e.g. `[2,1]` of 30 → `[20,10]`); `auto` container nesting an `auto` container (recursive natural size); `measure` returning fractional → clamped to integer.
- **align.impl**: `space-between` with one child behaves like `start`; `center` with odd leftover floors the offset; `align` non-stretch child clamps its natural cross size to the content cross extent; uniform `padding:n` vs per-side `Padding` object equivalence; **overflow + non-`start` justify**: `[fixed 4, fixed 4]` in width 6 with `justify:'end'`/`'center'` still runs from offset 0 (`free` clamped to ≥ 0 — no negative offset past the near edge, PF-004); `space-between` distributes leftover **on top of** the base `gap` (PF-006).
- **tree.impl**: empty `children` (a leaf container) gets its rect, no child entries; deep nesting composes offsets; result `Map` has exactly one entry per box; overflow in a nested container extends past *its* content box (not the root).

> Packaging has **no separate `.impl` file**: the re-export shape and the "spike still exported
> unchanged" check are both covered by ST-17 in `layout.packaging.spec.test.ts` (it imports
> `apportion`/`solveTrack`/`TrackItem` from `@jsvision/ui` alongside the new symbols).

## Security tests (mandatory subset)

- **Availability/bounded** (ST-18): a finite tree yields a single bounded traversal — no
  fixpoint loop; degenerate/negative inputs return zero-size rects rather than throwing.
- **No external-input/injection/auth surface**: pure in-process geometry — categories N/A,
  recorded honestly (RD-02 §Security).

## Verification

- Targeted: `yarn workspace @jsvision/ui test` (and `test -- <file>` while iterating).
- Full gate before done: `yarn verify` + `yarn workspace @jsvision/ui check:deps` + `yarn lint`.
