# Requirements & Scope — Layout Engine

> **Source**: [RD-02](../../requirements/RD-02-layout-engine.md)
> **Architecture**: [ADR-008](../../../../../docs/decisions/ADR-008-layout-engine.md) (Accepted)
> **CodeOps Skills Version**: 2.0.0

This document restates the RD-02 scope as the implementation contract. The RD is the
authoritative source; nothing here may contradict it. Acceptance criteria below map 1:1
to RD-02 AC-1…AC-18 and are realized as specification tests in
[07-testing-strategy.md](07-testing-strategy.md).

## Feature

A cell-native flex layout engine for `@jsvision/ui`: a pure function
`layout(root: LayoutBox, viewport: Size2D) → Map<LayoutBox, Rect>` that computes the
parent-relative integer rectangle of every box. UI-independent (operates on a plain
`LayoutBox` tree; no widget types, no painting). Lives at `packages/ui/src/layout/`,
re-exported through `@jsvision/ui`.

## IN scope

**Public API (RD-02 §Public API surface):**

- `layout(root, viewport)` → `Map<LayoutBox, Rect>` — pure, no input mutation; parent-relative integer rects. (AR-19, AR-27)
- `LayoutBox = { props: LayoutProps; children: readonly LayoutBox[]; measure?: (available: Size2D) => Size2D }`. (AR-23, AR-21)
- `LayoutProps = { direction?, size?, justify?, align?, gap?, padding? }` with CSS-parity defaults. (AR-20,24,25,29 · PA-3)
- `Size = { kind:'fixed', cells } | { kind:'fr', weight } | { kind:'auto' }`. (AR-20)
- `Justify = 'start'|'center'|'end'|'space-between'`; `Align = 'start'|'center'|'end'|'stretch'`. (AR-24, AR-25)
- `Size2D`, `Rect`, `Padding` — geometry types defined locally (core exports none). (PA-2)
- The existing `apportion`, `solveTrack`, `TrackItem` remain exported (unchanged). 

**Behavioral guarantees:**

- Integer apportionment: `fr` children sum **exactly** to available space (largest-remainder); built on `solveTrack`. (AR-19)
- `auto` sizing: pre-resolved to a fixed cell count — `measure()` for a leaf, derived-from-children for a container — before the track solve. (AR-21, PA-5)
- Cross-axis: `align` default `stretch` (fill cross extent); `start`/`center`/`end` use the child's natural cross size. (AR-25)
- Main-axis: `justify` places leftover space when no `fr` absorbs it. (AR-24)
- `gap` between children only; `padding` insets the container content box. (AR-29)
- Overflow: fixed/auto exceeding the container extend past the edge; `fr` clamps to 0; no shrink. (AR-28)
- Parent-relative rects; integer & non-negative sizes; degenerate viewport → zero-size rects. (AR-27, AR-19)
- Pure & deterministic: no input mutation; repeated calls return equal results. (RD-02 Should-Have)

## OUT of scope (RD-02 §Won't Have)

- 2-D **grid** (Tier 2, behind the same interface). (AR-22)
- `stack` / z-overlap containers. (AR-22)
- `min`/`max` size constraints. (AR-26)
- CSS-fidelity flex (`shrink`/`basis`, `wrap`, `aspect-ratio`, baseline, `space-around`/`space-evenly`). (AR-20, AR-24)
- The `ViewNode` type, painting, dirty-marking, scroll/clip — owned by RD-03/renderer.
- Re-layout scheduling / signal wiring — the view layer runs `layout` inside an effect.

## Dependencies / constraints

- **Runtime**: Node built-ins only (+ the declared workspace dep `@jsvision/core` if a shared geometry type is ever reused — currently none; types are local). No third-party/native deps — `yarn check:deps` must pass. (AR-19)
- **Toolchain**: TypeScript ESM-only, NodeNext (`.js` specifiers on `.ts` sources), `strict`, `noUnusedLocals`/`noUnusedParameters`. Build `tsc`; test vitest `unit` (`*.{spec,impl}.test.ts`).
- **Builds on**: the landed spike `apportion`/`solveTrack` (`packages/ui/src/layout/apportion.ts`) — reused unchanged (PA-5). `@jsvision/ui` is CI-green.

## Success criteria (Definition of Done)

1. All 18 specification tests (ST-01…ST-18, mapping RD-02 AC-1…AC-18) pass.
2. Implementation (edge/error) tests pass; happy-path + boundary + degenerate coverage per concern.
3. `yarn verify` green (typecheck + build + unit tests across packages).
4. `yarn workspace @jsvision/ui check:deps` passes (no third-party/native deps).
5. `layout`, `LayoutBox`, `LayoutProps`, `Size`, `Rect` (+ existing `apportion`/`solveTrack`/`TrackItem`) importable from `@jsvision/ui`.
6. Every `src/layout/` file ≤ 500 lines; public symbols carry JSDoc.
7. No dead code; ESLint + Prettier clean (`yarn lint`).
