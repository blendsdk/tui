# Roadmap: jsvision UI

> **Feature-Set**: jsvision UI
> **Status**: In Progress
> **Created**: 2026-06-29
> **Last Updated**: 2026-06-29
> **Progress**: 2 / 9 done (RD-01 ✅, RD-02 ✅)
> **CodeOps Skills Version**: 2.0.0

The `@jsvision/ui` layer — a reimagined Turbo Vision widget framework on
`@jsvision/core`, using the **disciplined hybrid** model (retained widget tree +
fine-grained signals + `Show`/`For`). Scope and triage: the component map at
[`tui-ui/01-component-map.md`](tui-ui/01-component-map.md). This roadmap is the
successor to the completed foundation feature-set (RD-01…RD-10), which is finished
and archived at [`_archive/foundation/`](_archive/foundation/00-roadmap.md).

RD numbering restarts for this feature-set; these RDs are **not** the archived
foundation RDs of the same number.

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID | Title | RD | Plan | Stage | Status | Last Updated | Notes / Blocker |
|----|-------|----|------|-------|--------|--------------|-----------------|
| RD-01 | Reactive core — `signal`/`computed`/`effect` + `Show`/`For` | [RD-01](../requirements/RD-01-reactive-core.md) | [reactive-core](reactive-core/00-index.md) | Done | ✅ | 2026-06-29 | Phase 0 pillar (XL). UI-independent; every widget property binds to it. **Shipped** in `packages/ui/src/reactive/` — 20 ST (ST-01…ST-20) + impl tests green (55 ui tests), `yarn verify`/`check:deps`/`lint` clean, all public symbols importable from `@jsvision/ui`, every file ≤ 500 lines w/ JSDoc. exec_plan complete (4 phases / 4 commits). |
| RD-02 | Layout engine — cell-native flex `row`/`col` | [RD-02](../requirements/RD-02-layout-engine.md) | [layout-engine](layout-engine/00-index.md) | Done | ✅ | 2026-06-29 | Phase 0 pillar (XL). ADR-008 Accepted; built on the golden-tested `apportion`/`solveTrack` spike. **Complete**: all 4 phases / 18 spec oracles (ST-01…ST-18 ↔ AC-1…AC-18) + impl tests green. `layout(root, viewport) → parent-relative integer rects`: `row`/`col` via one axis abstraction, `fixed`/`fr`/`auto` sizing (`auto` pre-resolved via `naturalSize`), `justify`/`align`/`gap`/`padding`, overflow (extend past edge, `fr`→0), degenerate→zero rects, recursion in each box's local frame. Pure/no-mutation; `check:deps` clean; files ≤ 217 lines. Symbols re-exported from `@jsvision/ui`. |
| RD-03 | View/Group spine + `DrawContext` + theming | — | — | Backlog | ⬜ | 2026-06-29 | Phase 0. Retained tree, draw composition into parent buffer, named theme roles. |
| RD-04 | Event loop + focus + modality + commands | — | — | Backlog | ⬜ | 2026-06-29 | Phase 0. Async pump, 3-phase dispatch, `await execView`. |
| RD-05 | App shell — Window/Frame/ScrollBar/Desktop/MenuBar/StatusLine | — | — | Backlog | ⬜ | 2026-06-29 | Phase 0 demo target: a blank windowed desktop + menu/status. |
| RD-06 | Essential controls + validators | — | — | Backlog | ⬜ | 2026-06-29 | Phase 1. Text/Label/Button/Input/Check/Radio/ListView/Dialog. Demos: `mmenu`, `palette`, `tvforms`. |
| RD-07 | High-value controls | — | — | Backlog | ⬜ | 2026-06-29 | Phase 2. History/Tree/ComboBox/Tabs/Table/Progress/Surface. Demo: **clone `tvdemo`** (north-star). |
| RD-08 | Editor family | — | — | Backlog | ⬜ | 2026-06-29 | Phase 3 (XL gap-buffer). Editor/Memo/EditWindow/Indicator/Terminal. Demo: `tvedit`. |
| RD-09 | Files package `@jsvision/files` | — | — | Backlog | ⬜ | 2026-06-29 | Phase R. Relocated fs-bound dialogs: FileDialog/FileList/DirList/ChDir. Demo: `tvdir`. |

## Notes

- **2026-06-29** — Roadmap created for the jsvision UI feature-set, seeded from the
  component map ([`tui-ui/01-component-map.md`](tui-ui/01-component-map.md)) and
  ADR-008. No `requirements/RD-*.md` or execution plans exist yet — all rows start in
  Backlog. The foundation feature-set (RD-01…RD-10) is complete and archived at
  `_archive/foundation/`; this is its successor.
- **Pre-work already landed (before formal RDs):** the model decision — **disciplined
  hybrid** (retained tree + signals + `Show`/`For`); **ADR-008 Accepted** (build a
  cell-native layout engine, flex first / grid Tier 2, as a module in `@jsvision/ui`);
  and the **integer apportionment spike** (`apportion`/`solveTrack` + golden test) that
  de-risks RD-02's central premise. `@jsvision/ui` is scaffolded and CI-green.
- **2026-06-29** — **RD-01 (Reactive core) drafted** → stage `RD Drafted`. Requirements
  set re-initialized for this feature-set: the stale foundation `requirements/` scaffolding
  (README, ambiguity-register, _draft) was moved into `_archive/foundation/requirements/`,
  and a fresh set authored at `requirements/` (README + `00-ambiguity-register.md` AR-01…AR-12
  + `RD-01-reactive-core.md`). Four design decisions locked with the user: callable+methods
  signal API, synchronous effects + `batch()`, owner-scope tree + `onCleanup`, key-function `For`.
- **2026-06-29** — **RD-01 preflighted** → stage `RD Preflighted`. Fresh-session audit
  (`requirements/00-preflight-report.md`, iteration 2) surfaced 9 findings (3 MAJOR, 6 MINOR, 0
  CRITICAL) — all under-specification at the edges, none a design flaw. User accepted every
  recommended resolution; applied to RD-01 + new register entries AR-13…AR-18 (error base class
  = `TuiError`, no-owner dev-warn, exception propagation, nested-`batch` outermost flush, `For`
  duplicate-key policy, fixed 1000-iteration runaway limit). Re-scan clean.
- **2026-06-29** — **RD-01 plan created** → stage `Plan Created`. `plans/reactive-core/` written
  (8 docs): ambiguity register (plan decisions PA-1…PA-5 over inherited AR-01…AR-18), index,
  requirements, current-state + target file layout, 3 component specs (reactive-graph, ownership,
  combinators), testing strategy (ST-01…ST-20 ↔ AC-1…AC-20), execution plan (4 phases / 11 sessions,
  spec-first). Three plan-level decisions locked with the user: dev warnings = `console.warn` gated
  `NODE_ENV!=='production'` (PA-1), multi-throw cascade = first rethrown + rest `console.error`
  (PA-2), granular file split (PA-3).
- **2026-06-29** — **reactive-core plan preflighted** → stage `Plan Preflighted`. Fresh-session,
  codebase-grounded audit (`plans/reactive-core/00-preflight-report.md`, iteration 1): all 9 plan
  docs across 13 dimensions; every structural claim verified against the real code (`TuiError` ctor,
  barrel/entry pattern, two-project vitest, `check:deps`, no-`console.*`-in-`src`); scheduler
  propagation walked for glitch-freedom — no correctness defect. 6 findings (0 critical/major; 4
  MINOR + 2 observations), all resolved: ST-15 leak check made behavioral (PF-001), `For` duplicate-key
  output pinned via new **PA-6** (PF-002), `Show` flip driver specified (PF-003), `EqualsOption` export
  reconciled (PF-004), 2 clarity fixes (PF-005/006).
- **2026-06-29** — **RD-01 executed & shipped** → stage `Done` ✅. `exec_plan reactive-core` ran all
  4 phases spec-first (RED→GREEN→impl) across 4 commits: P1 graph foundation (signal/effect/scheduler/
  owner), P2 lazy memoized computeds + glitch-free diamond, P3 Show/For combinators, P4 packaging +
  gate. Lands `packages/ui/src/reactive/` (12 files, ≤ 500 lines each, full JSDoc, zero native deps).
  All 20 specification tests ST-01…ST-20 green + impl tests (55 ui tests total); `yarn verify` /
  `check:deps` / `lint` clean; every public symbol + type importable from `@jsvision/ui`. Two
  scheduler subtleties resolved during exec (recorded in the impl): resolve **all** of a CHECK node's
  sources before running it (glitch-free diamond), and don't mark observers on a computed's first
  compute; the runaway guard relies on a self-writing effect's mid-run re-mark surviving.
- **2026-06-29** — **RD-02 (Layout engine) drafted** → stage `RD Drafted` ✏️. `add_requirement`
  authored `requirements/RD-02-layout-engine.md` on top of ADR-008 + the landed apportionment
  spike. Scope: a pure `layout(LayoutBox tree, viewport) → parent-relative integer rects` pass —
  `row`/`col` flex containers, `fixed`/`fr`/`auto` sizing (`auto` via a `measure()` seam),
  `justify` (start/center/end/space-between), `align` (start/center/end/stretch, default stretch),
  `gap`/`padding`, overflow extends-past-edge (no shrink). 11 decisions locked AR-19…AR-29; grid
  (Tier 2), stack/overlay, and min/max constraints deferred. 18 acceptance criteria.
- **2026-06-29** — **layout-engine plan preflighted** → stage `Plan Preflighted` 🔬. Codebase-grounded
  audit (`plans/layout-engine/00-preflight-report.md`): 1 MAJOR + 4 MINOR + 1 OBSERVATION, all
  resolved by applying recommended fixes — corrected the false "exports already flow to
  `src/index.ts`" claim (layout uses explicit named re-exports, not `export *`), documented the
  acyclic/distinct-instance input precondition RD-02 deferred to planning, specified the `measure`
  `available` value, and clamped justify `free` to ≥ 0 so overflow extends past the far edge for
  any `justify`. Ready for `exec_plan`.
- **2026-06-29** — **RD-02 plan created** → stage `Plan Created` 📋. `plans/layout-engine/` written
  (7 docs): ambiguity register (PA-1…PA-5 over inherited AR-19…AR-29), index, requirements,
  current-state + target layout, 2 component specs (node-model-and-sizing, layout-pass), testing
  strategy (ST-01…ST-18 ↔ AC-1…AC-18), execution plan (4 phases / 11 sessions, spec-first). Builds
  on the `apportion`/`solveTrack` spike unchanged; geometry types defined locally (core exports
  none); CSS-parity defaults confirmed.
- **2026-06-29** — **RD-02 (Layout engine) complete** → stage `Done` ✅. Executed
  `plans/layout-engine/` across all 4 phases (spec-first, RED→GREEN per phase). Added
  `packages/ui/src/layout/{types,measure,layout}.ts` on the unchanged `apportion`/`solveTrack`
  spike: `layout(root, viewport) → Map<LayoutBox, Rect>` of parent-relative integer rects —
  `row`/`col` via a single axis abstraction, `fixed`/`fr`/`auto` sizing (`auto` pre-resolved via
  `naturalSize`), `justify`/`align`/`gap`/`padding`, overflow (extend past edge, `fr`→0),
  degenerate→zero rects, recursion in each box's local frame. 18 spec oracles (ST-01…ST-18 ↔
  AC-1…AC-18) + impl tests green; `yarn verify`/`check:deps`/`lint` clean; all files ≤ 217 lines;
  symbols re-exported from `@jsvision/ui`. Commits `f9a8cae`→ (Phases 1–4).
- **Recommended next:** draft **RD-03 (view/group spine)** — the keystone that binds RD-01's
  `effect`→widget-dirty seam (AR-09) and feeds widget `LayoutBox`es to RD-02's pass.
