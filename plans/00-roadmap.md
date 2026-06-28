# Roadmap: jsvision UI

> **Feature-Set**: jsvision UI
> **Status**: In Progress
> **Created**: 2026-06-29
> **Last Updated**: 2026-06-29 00:16
> **Progress**: 0 / 9 (0%)
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
| RD-01 | Reactive core — `signal`/`computed`/`effect` + `Show`/`For` | — | — | Backlog | ⬜ | 2026-06-29 | Phase 0 pillar (XL). UI-independent; every widget property binds to it. |
| RD-02 | Layout engine — cell-native flex `row`/`col` | — | — | Backlog | ⬜ | 2026-06-29 | Phase 0 pillar (XL). ADR-008 Accepted; apportionment core spike **landed** (`packages/ui/src/layout/`) + golden-tested — de-risked. |
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
- **Recommended next:** `make_requirements` then `make_plan` for **RD-01 (reactive
  core)** or **RD-02 (layout containers)** — the two Phase-0 pillars, both
  self-contained and independent of the rest of the spine.
