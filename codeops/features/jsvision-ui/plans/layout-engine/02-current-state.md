# Current State Analysis — Layout Engine

> **CodeOps Skills Version**: 2.0.0

## Summary

`packages/ui/src/layout/` **exists** — it holds the ADR-008 de-risking spike:
`apportion.ts` (the integer 1-D distribution core) + a barrel `index.ts`, golden-tested by
`packages/ui/test/apportion.spec.test.ts` / `apportion.impl.test.ts`. RD-02 is an
**additive** build-out on that spike: it keeps `apportion`/`solveTrack` unchanged and adds
the node model, intrinsic sizing, and the recursive two-axis pass. No migration or rewrite.

## What already exists (verified against the code)

| Symbol | File:line | Shape | RD-02 reuse |
|--------|-----------|-------|-------------|
| `apportion(total, weights)` | `apportion.ts:31` | Distributes `total` integer cells across weights via largest-remainder; sums exactly; `total ≤ 0` → zeros | The exactness primitive under `fr` distribution |
| `solveTrack(total, items, gap)` | `apportion.ts:74` | 1-D solve: `fixed` items keep size, `flex` split the leftover via `apportion`; gaps subtracted from free space | The main-axis solver; `auto` is pre-resolved to `fixed` then fed here (PA-5) |
| `TrackItem` | `apportion.ts:17` | `{kind:'fixed',size} \| {kind:'flex',weight}` | Mapped from `Size`: `fixed`/resolved-`auto` → `fixed`, `fr` → `flex` |
| barrel | `layout/index.ts:8` | `export { apportion, solveTrack }` + `export type { TrackItem }` | Extend with the new public symbols |

`solveTrack` handles `fixed` + `flex` (= `fr`); it has **no `auto`** and computes a single
axis only. RD-02 adds `auto` (intrinsic), the cross axis, `justify`/`align`/`padding`, the
recursion, and parent-relative rects.

## Patterns to mirror (verified against the code)

| Pattern | Evidence | Apply to layout |
|---------|----------|-----------------|
| Subsystem barrel re-export → single entry | `packages/ui/src/index.ts:23` (`export * from './reactive/index.js'`); `layout/index.ts` | Extend `layout/index.ts` **and** `src/index.ts:19-20` — unlike reactive's `export *`, layout is re-exported by **explicit named exports** (`src/index.ts:19` `export { apportion, solveTrack }`, `:20` `export type { TrackItem }`), so new symbols do **not** flow automatically; both lines must list the new `layout`/`LayoutBox`/… exports (AC-17). |
| `.js` specifier on `.ts` source (NodeNext) | `reactive/*.ts`, `layout/index.ts` | All intra-module imports use `.js` |
| Granular split, foundation-first, ≤ 500 lines + JSDoc | `src/reactive/` (12 files, types → … → barrel) | Same shape under `src/layout/` (PA-1) |
| Spec test = immutable oracle from the requirement/ADR | `test/apportion.spec.test.ts:1-10` (derives from ADR-008, not impl) | ST cases derive from RD-02 ACs |
| Golden integer-exactness assertions | `test/apportion.spec.test.ts` (`apportion(80,[1,1,1])===[27,27,26]`) | Rect goldens assert exact integer fill |
| Two-project vitest: `unit` = `*.{spec,impl}.test.ts` | `packages/ui/vitest.config.ts` | All layout tests are `unit`; no e2e |

## Constraints confirmed from manifests

- `tsconfig.base.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, NodeNext, ES2022.
- `@jsvision/core` exports **no** `Rect`/`Size`/geometry type (verified: `grep` over `engine/index.ts` and `engine/**` finds none) → `Size2D`/`Rect`/`Padding` are defined locally in `src/layout/types.ts` (PA-2).
- `packages/ui/package.json`: `check:deps` fails only on native deps — pure-TS additions are fine.

## Target file layout (PA-1, granular split)

```
packages/ui/src/layout/
├── index.ts        # barrel: existing apportion/solveTrack/TrackItem + new layout, LayoutBox,
│                   #   LayoutProps, Size, Justify, Align, Padding, Size2D, Rect (→ src/index.ts)
├── apportion.ts    # EXISTING — integer distribution + solveTrack (unchanged)
├── types.ts        # NEW — Size2D, Rect, Padding, Size, Justify, Align, LayoutProps, LayoutBox + the
│                   #   conventional defaults (PA-3)
├── measure.ts      # NEW — intrinsic/natural sizing: resolve a box's natural Size2D via measure()
│                   #   (leaf) or derived-from-children (container) (AR-21, PA-5)
└── layout.ts       # NEW — the recursive two-axis pass: main-axis solve (auto→fixed→solveTrack),
                    #   cross-axis align, justify, padding, overflow, parent-relative rects (AR-24…28)
```

> **Layering**: `apportion` (leaf) → `types` → `measure` → `layout` → `index`. `measure` and
> `layout` are mutually recursive in concept (a container's intrinsic size needs its children's
> sizes); the recursion lives in `layout.ts`, with `measure.ts` exposing pure natural-size
> helpers it calls. Keep each file ≤ 500 lines (split `layout.ts` if it approaches the limit).

## Test file layout (PA-1)

```
packages/ui/test/
├── apportion.spec.test.ts / .impl.test.ts   # EXISTING (spike goldens) — untouched
├── layout.sizing.spec.test.ts  / .impl.test.ts   # AC-1,2,3,4,5,6 (main-axis + auto + gap + intrinsic)
├── layout.align.spec.test.ts   / .impl.test.ts   # AC-7,8,9 (justify, align, padding)
├── layout.tree.spec.test.ts    / .impl.test.ts   # AC-10,11,12,13,14,15 (nesting, overflow, col, degenerate)
└── layout.packaging.spec.test.ts                 # AC-16,17,18 (purity, packaging, security)
```

## Risks / watch-items

- **Intrinsic `auto` sizing of containers** is the subtle part: a container's natural size
  derives from its children, which themselves may be `auto` — a recursive natural-size pass
  distinct from the final rect pass. Isolated in `measure.ts`; covered by its own spec block.
- **Cross-axis `stretch` vs natural** interacts with `auto` children and `align`; covered by
  `layout.align` specs.
- **Overflow / `fr`-clamps-to-0** when fixed/auto exceed the container — an explicit edge
  (AC-12), not left to impl.
