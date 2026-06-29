# Layout Engine — Implementation Plan (Index)

> **Implements**: RD-02
> **Feature**: `@jsvision/ui` layout engine — a pure `layout(LayoutBox tree, viewport)
> → parent-relative integer rects` pass: cell-native flex `row`/`col` with
> `fixed`/`fr`/`auto` sizing, `justify`/`align`, `gap`/`padding`, built on the landed
> `apportion`/`solveTrack` spike.
> **Status**: Planned (ready for exec_plan)
> **Created**: 2026-06-29
> **CodeOps Skills Version**: 2.0.0

---

## Overview

The layout engine is the second UI-independent pillar of `@jsvision/ui` (alongside the
reactive core). It turns a tree of layout boxes into the integer rectangle each box
occupies, so widgets stop addressing absolute `(x, y)` coordinates. Per **ADR-008** it is
cell-native pure TypeScript using **largest-remainder apportionment** (integer-correct by
construction — no float-rounding gaps), built on the golden-tested 1-D core
`solveTrack`/`apportion` already in `packages/ui/src/layout/`.

Scope is a deliberate **flex subset** (RD-02 / ADR-008): `row`/`col`, `fixed`/`fr`/`auto`
sizing (`auto` via a view-independent `measure()` seam), `justify`/`align`, `gap`/`padding`,
overflow-extends-past-edge (no shrink), parent-relative rects. 2-D grid (Tier 2),
`stack`/overlay, and min/max constraints are deferred. The function is **pure** — making
layout reactive is the view layer's job (RD-03).

Greenfield additions under the existing `packages/ui/src/layout/`, re-exported through the
single `@jsvision/ui` entry point; no third-party/native runtime deps.

## Document map

| Doc | Purpose |
|-----|---------|
| [00-ambiguity-register.md](00-ambiguity-register.md) | Zero-Ambiguity Gate — plan decisions PA-1…PA-5 + inherited RD AR-19…AR-29 |
| [01-requirements.md](01-requirements.md) | Scope, in/out, success criteria (sourced from RD-02) |
| [02-current-state.md](02-current-state.md) | Spike analysis, patterns to mirror, target file layout |
| [03-01-node-model-and-sizing.md](03-01-node-model-and-sizing.md) | Types (`Size2D`/`Rect`/`Size`/`LayoutProps`/`LayoutBox`), defaults, main-axis sizing (`auto` pre-resolution + `solveTrack`), intrinsic/`measure` sizing |
| [03-02-layout-pass.md](03-02-layout-pass.md) | The recursive two-axis pass: cross-axis align, justify, padding, overflow, parent-relative composition, `col` mirroring, the `LayoutResult` map |
| [07-testing-strategy.md](07-testing-strategy.md) | Specification test cases ST-01…ST-18 traced to RD-02 AC-1…AC-18 |
| [99-execution-plan.md](99-execution-plan.md) | Phases, sessions, task checklist (spec-first ordering) |

## Key decisions (at a glance)

| Decision | Choice | Ref |
|----------|--------|-----|
| Engine | cell-native pure-TS flex, on `apportion`/`solveTrack` | AR-19 (ADR-008) |
| Sizing | `fixed` / `fr` / `auto` tokens; `auto` via `measure()` or children | AR-20, AR-21 |
| Primitives | `row` + `col` only (2-D via nesting) | AR-22 |
| Input | standalone `LayoutBox` tree (view-independent) | AR-23 |
| Justify / Align | start/center/end/space-between · start/center/end/stretch (default stretch) | AR-24, AR-25 |
| Coords / Overflow | parent-relative rects · extend-past-edge, no shrink | AR-27, AR-28 |
| Geometry types | defined locally in `src/layout/types.ts` (core exports none) | PA-2 |
| API defaults | CSS-flex-parity (`row`/`auto`/`start`/`stretch`/0/0) | PA-3 |
| `auto` integration | pre-resolve to fixed, then reuse `solveTrack` | PA-5 |
| File layout | granular split (mirror reactive-core) | PA-1 |

## To begin implementation

Use the **exec_plan** skill on `layout-engine`. Commits reference **/gitcm** / **/gitcmp**;
the verify command is `yarn verify` (per the project CLAUDE.md). Scoped per-package
iteration: `yarn workspace @jsvision/ui test`. Commit scope: `layout`.
