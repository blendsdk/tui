# @blendsdk/tui — Roadmap

> **Project**: `@blendsdk/tui` — Phase 1: terminal-aware renderer + input + host **foundation**.
> **Created**: 2026-06-27
> **Last Updated**: 2026-06-27
> **Source**: [requirements/](../requirements/README.md) (RD-01…RD-10)
> **CodeOps Skills Version**: 2.0.0

This roadmap is the cross-session source of truth at the RD/plan altitude. It tracks
every requirements document and its implementation plan across the lifecycle. Update
it as RDs move stages (the **roadmap** skill owns the full protocol).

## Stage Legend

| Stage | Meaning |
| ----- | ------- |
| 📝 Requirements Drafted | RD exists in `requirements/`; no plan yet |
| 📋 Plan Created | `plans/<feature>/` exists (make_plan done); not yet executing |
| 🔨 In Progress | exec_plan running; some tasks complete |
| ✅ Implemented | All plan tasks complete; `verify` green locally |
| 🔒 Verified | Cross-platform / acceptance gate met (incl. CI cells once a remote exists) |

## Roadmap

| RD | Title | Depends On | Stage | Plan |
| -- | ----- | ---------- | ----- | ---- |
| RD-01 | [Scaffolding & Toolchain](../requirements/RD-01-scaffolding-and-toolchain.md) | — | ✅ Implemented | [rd-01-scaffolding-and-toolchain](rd-01-scaffolding-and-toolchain/00-index.md) |
| RD-02 | [Capability Model & Auto-Config](../requirements/RD-02-capability-model.md) | RD-01 | 📋 Plan Created | [rd-02-capability-model](rd-02-capability-model/00-index.md) |
| RD-03 | [Capability Probe & Survey Harness](../requirements/RD-03-capability-probe.md) | RD-02, RD-04, RD-06, RD-07 | 📝 Requirements Drafted | — |
| RD-04 | [Rendering Engine](../requirements/RD-04-rendering-engine.md) | RD-01, RD-02 | 📝 Requirements Drafted | — |
| RD-05 | [Color & Styling](../requirements/RD-05-color-and-styling.md) | RD-02 | 📝 Requirements Drafted | — |
| RD-06 | [Input System](../requirements/RD-06-input-system.md) | RD-01 | 📝 Requirements Drafted | — |
| RD-07 | [Host & Lifecycle](../requirements/RD-07-host-and-lifecycle.md) | RD-02, RD-04, RD-06 | 📝 Requirements Drafted | — |
| RD-08 | [Essentials Gate, Logging, Errors & Security](../requirements/RD-08-essentials-logging-security.md) | RD-02, RD-07 | 📝 Requirements Drafted | — |
| RD-09 | [Testing Strategy & Acceptance Gate](../requirements/RD-09-testing-and-acceptance.md) | all | 📝 Requirements Drafted | — |
| RD-10 | [Non-Functional Requirements](../requirements/RD-10-non-functional.md) | all | 📝 Requirements Drafted | — |

## Suggested Implementation Order

Per the requirements set's phased plan:

| Phase | Documents | Description |
| ----- | --------- | ----------- |
| **A: Gate MVP** | RD-01 → RD-02 → RD-06 → RD-04 → RD-07 → RD-08 → RD-09 | Minimum to prove the go/no-go gate on Linux: detect, render, input, host, essentials, acceptance harness |
| **B: Full foundation** | RD-03 → RD-05 → OSC/notifications (RD-04) → progressive enhancements | Full probe/survey harness, color/styling, OSC features, CSI-u/Kitty enhancement, perf tuning |
| **C: Cross-platform verification** | RD-09 matrix on macOS + Windows | Required milestones verifying the matrix beyond Linux |
| **Cross-cutting** | RD-10 | Non-functional requirements enforced throughout |

## Notes

- **RD-01** is **✅ Implemented** (2026-06-27): clean slate, ESM package, toolchain, CI workflow, packaging e2e — `npm run verify` 19/19, lint clean, `npm audit` 0 vulns locally. Next suggested: RD-02, then RD-06.
- **RD-02** is **📋 Plan Created** (2026-06-27): layered capability detection core (`src/engine/capability/`), runtime-query seam (RD-06 wires it later), bounded parser. 24 tasks / 4 phases. Ready for `/exec_plan rd-02-capability-model`.
- This environment is a **local git repo with no remote**; RD-01's CI cells (AC-2) and CI publish-dry-run (AC-7) are **deferred-to-remote** (see RD-01 plan, PL-3). RD-01 advances to **🔒 Verified** only once a remote exists and the 9 CI cells pass.
