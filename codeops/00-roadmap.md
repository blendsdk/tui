# Portfolio Roadmap: Ink

> **Status**: Active
> **Last Updated**: 2026-06-30
> **Features**: 0 / 1 done
> **CodeOps Skills Version**: 3.0.0

## Legend

⬜ Backlog · 🔄 In progress · ✅ Done · ⛔ Blocked · ⏸️ Deferred · 📦 Archived

## Features

| Feature | Roadmap | Stage Summary | Progress | Status | Last Updated |
|---------|---------|---------------|----------|--------|--------------|
| jsvision-ui | [→](features/jsvision-ui/00-roadmap.md) | 4 ✅ Done (RD-01…RD-04) · RD-05 🔄 Executing · 4 ⬜ Backlog | 4 / 9 done | 🔄 | 2026-06-30 |

## Archived

| Feature | Roadmap | Completed | Last Updated |
|---------|---------|-----------|--------------|
| — | — | — | — |

## Notes

- 2026-06-30: **RD-05 app-shell plan preflighted ×2** → 🔬 Plan Preflighted ([report](features/jsvision-ui/plans/app-shell/00-preflight-report.md)).
  Iter-1 (PF-01…PF-09, 1 CRITICAL) added a spec-first **Phase 0** (RD-02 `position:'absolute'` + RD-03 `DrawContext.role`) and
  re-baselined to **6 phases / 18 sessions / 48 tasks** (PA-15…PA-19). Iter-2 (PF-10…PF-14, 1 CRITICAL — an empty full-viewport
  overlay would swallow all mouse input; + ST-04/AR-66 restore-on-throw contradiction; + a Phase-2↔Phase-3 ordering gap) all
  resolved Option A (PA-20…PA-22); independent challenger confirmed the critical/major findings against live source. Ready for
  `exec_plan`. Cascaded from the **jsvision-ui** row.
- 2026-06-30: **RD-05 app-shell planned** → 📋 Plan Created ([`plans/app-shell/`](features/jsvision-ui/plans/app-shell/00-index.md)).
  6 phases / 16 sessions / ~30–42 h; PA-1…PA-14 (4 user choices + 10 dominant, ✅ GATE PASSED); 22 spec oracles
  (ST-01…ST-22). One cross-package edit (`windowInactive` core role); two additive intra-package loop seams
  (pointer capture + `onFrame`). Cascaded from the **jsvision-ui** row.
- 2026-06-30: **RD-04 event-loop complete** → ✅ Done (all 5 phases executed spec-first; 20 spec
  oracles ST-01…ST-20 + impl tests green; full gate clean — `yarn verify` 8/8, `test:e2e` event-demo
  + core, `check:deps`, `lint`; every `event/` file ≤ 227 lines). Lands `packages/ui/src/event/` +
  additive `view.ts`/`group.ts`/`view/types.ts` + `demo:events`. jsvision-ui now 4/9 done; RD-05
  (Application/`run()`/shell) next. Cascaded into the **jsvision-ui** row.
- 2026-06-30: **RD-04 event-loop plan preflighted** → 🔬 Plan Preflighted (codebase-grounded audit,
  every `file:line` claim verified; 2 MAJOR + 3 MINOR + 2 OBSERVATION resolved — single `runTick`
  per public mutator PA-11, modal Phase-2 bubble clamp PA-12, built-in Tab→focus PA-10; 33 tasks).
  Ready for exec_plan. Cascaded into the **jsvision-ui** row.
- 2026-06-30: **RD-04 event-loop plan created** → 📋 Plan Created (`plans/event-loop/`; 5 phases /
  15 sessions; PA-1…PA-9; spec-first ST-01…ST-20). New `packages/ui/src/event/` + additive
  `view`/`group` edits + `demo:events`; no cross-package primitive. Cascaded into the
  **jsvision-ui** row.
- 2026-06-29: **RD-04 event-loop preflighted** → 🔎 RD Preflighted (codebase-grounded audit; 3
  MAJOR + 4 MINOR + 1 OBS, all resolved Option A; AR-60…AR-66). Corrected the dispatch `handled`
  envelope (core `InputEvent` is readonly), the loop now **builds** the `RenderRoot` (the schedule
  seam is construct-time), and reuse of core's existing `createKeymap`. Cascaded into the
  **jsvision-ui** row.
- 2026-06-29: **RD-04 event-loop drafted** → ✏️ RD Drafted (`add_requirement`; AR-47…AR-59, 20
  AC). The host-agnostic dispatch mechanism (`EventLoop`) that makes the RD-03 spine interactive;
  concrete `Application`/shell deferred to RD-05. Cascaded into the **jsvision-ui** row.
- 2026-06-29: migrated from the flat layout via setup_codeops.
- 2026-06-29: **RD-03 view-group-spine complete** → ✅ Done (all 7 phases executed spec-first, 8
  commits; ui 142 unit + 3 e2e green, verify/check:deps/lint clean). jsvision-ui now 3/9 done;
  RD-04 (event loop) next. Cascaded into the **jsvision-ui** row.
- 2026-06-29: **RD-03 view-group-spine plan preflighted** → 🔬 Plan Preflighted (1 MAJOR + 2 MINOR
  resolved, 0 CRITICAL; report in the plan folder). Cascaded into the **jsvision-ui** row.
- 2026-06-29: update_roadmap refined the **jsvision-ui** row from disk — Stage Summary + Progress
  (2/9 done) cascaded from the feature roadmap (RD-01/02 ✅, RD-03 📋 Plan Created, RD-04…09 ⬜).
- 2026-06-29: archived the completed **monorepo-restructure** plan (30/30 tasks done; the repo is
  now a yarn 1.x + Turborepo monorepo) → `_archive/monorepo-restructure/`. It was repo-level
  infrastructure swept under `jsvision-ui` by the migration, never a tracked feature row.
