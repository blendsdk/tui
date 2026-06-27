# @blendsdk/tui — Roadmap

> **Project**: `@blendsdk/tui` — Phase 1: terminal-aware renderer + input + host **foundation**.
> **Created**: 2026-06-27
> **Last Updated**: 2026-06-28 (RD-05 implemented — color & styling landed)
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
| 🔬 Plan Preflighted | preflight passed against the codebase; plan cleared for execution |
| 🔨 In Progress | exec_plan running; some tasks complete |
| ✅ Implemented | All plan tasks complete; `verify` green locally |
| 🔒 Verified | Cross-platform / acceptance gate met (incl. CI cells once a remote exists) |

## Roadmap

| RD | Title | Depends On | Stage | Plan |
| -- | ----- | ---------- | ----- | ---- |
| RD-01 | [Scaffolding & Toolchain](../requirements/RD-01-scaffolding-and-toolchain.md) | — | ✅ Implemented | [rd-01-scaffolding-and-toolchain](rd-01-scaffolding-and-toolchain/00-index.md) |
| RD-02 | [Capability Model & Auto-Config](../requirements/RD-02-capability-model.md) | RD-01 | ✅ Implemented | [rd-02-capability-model](rd-02-capability-model/00-index.md) |
| RD-03 | [Capability Probe & Survey Harness](../requirements/RD-03-capability-probe.md) | RD-02, RD-04, RD-06, RD-07 | 📝 Requirements Drafted | — |
| RD-04 | [Rendering Engine](../requirements/RD-04-rendering-engine.md) | RD-01, RD-02 | ✅ Implemented | [rd-04-rendering-engine](rd-04-rendering-engine/00-index.md) |
| RD-05 | [Color & Styling](../requirements/RD-05-color-and-styling.md) | RD-02 | ✅ Implemented | [rd-05-color-and-styling](rd-05-color-and-styling/00-index.md) |
| RD-06 | [Input System](../requirements/RD-06-input-system.md) | RD-01 | ✅ Implemented | [rd-06-input-system](rd-06-input-system/00-index.md) |
| RD-07 | [Host & Lifecycle](../requirements/RD-07-host-and-lifecycle.md) | RD-02, RD-04, RD-06 | ✅ Implemented | [rd-07-host-and-lifecycle](rd-07-host-and-lifecycle/00-index.md) |
| RD-08 | [Essentials Gate, Logging, Errors & Security](../requirements/RD-08-essentials-logging-security.md) | RD-02, RD-07 | ✅ Implemented | [rd-08-essentials-logging-security](rd-08-essentials-logging-security/00-index.md) |
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
- **RD-02** is **✅ Implemented** (2026-06-27): layered capability detection core (`src/engine/capability/`), runtime-query seam (RD-06 wires it later), bounded parser. 26 tasks / 4 phases; `npm run verify` 84/84, lint/check:deps clean, `npm audit` 0 vulns. AC-1…AC-8 covered. Next suggested: RD-06, then RD-04.
- **RD-06** is **✅ Implemented** (2026-06-27): pure byte→event input decoder under `src/engine/input/` + shared `capability/responses.ts`. 26 tasks / 4 phases; `npm run verify` 144/144, lint/check:deps clean, `npm audit` 0 vulns. AC-1…AC-8 covered by passing ST-1…ST-14; RD-02 query suites still green after the PL-2 refactor. One runtime decision recorded (**RT-1**: `decode()`/`flush()` return the next `DecoderState` so a cross-chunk paste threads while staying pure). **DEF-1** (CSI-u/Kitty parsing) deferred to Phase B. Next suggested: RD-04, then RD-07.
- **RD-04** is **✅ Implemented** (2026-06-27): rendering/output engine under `src/engine/render/` (`types`, `width`, `buffer`, `ansi`, `glyphs`, `serialize`, `sanitize`, `cursor`, `osc`, `index`). 24 tasks / 4 phases; `npm run verify` 224/224, lint/check:deps clean, `npm audit` 0 vulns. AC-1…AC-8 covered by passing ST-1…ST-14; RD-02/RD-06 suites still green. The crux **dependency inversion** held: a `StyleEncoder` seam with a minimal truecolor/mono default (PL-1/PL-14, RD-05 fills it) and a real provisional shared `sanitize()` (PL-2/PL-16, RD-08 owns it later) routing every text path. Pure `serialize(current, previous)` damage diff (PL-5), per-cell object buffer (PL-3). Two runtime decisions recorded (**RT-1**: `set()` takes an optional `widthMode` threaded from `text()`; **RT-2**: `text()` sanitizes its string arg). **DEF-1** (cursor shape) and **DEF-2** (typed-array backing) deferred to Phase B. Next suggested: RD-07 (host/lifecycle), then RD-08.
- **RD-07** is **✅ Implemented** (2026-06-27): native `tty` host under `src/engine/host/` (8 files: `types`, `streams`, `platform`, `modes`, `host`, `restore`, `signals`, `index`). 5 phases / 30 checklist items; `npm run verify` **273/273**, lint/check:deps clean, `npm audit` 0 vulns; the explicit `host-signals.e2e.test.ts` proves a **real** SIGINT → real exit 130 + real restore (no node-pty, AR-13). Public surface is a `createHost(options): Host` factory (AR-1) with typed callbacks (AR-2) and a `render(buffer)` that owns prev+serialize+write (AR-3), re-exported from `@blendsdk/tui`. All OS effects sit behind the injectable `RuntimeAdapter`; AC-1…AC-8 covered by passing ST-1…ST-16. Two runtime decisions recorded beyond the preflight: **RT-2** (`onProcessExit` returns an unsubscribe so `restore.teardown()` can remove the panic backstop) and **RT-3** (suspend does a *soft* leave so a SIGINT after resume still restores). **DEF-2** (keyboard protocol / modes step 9) deferred until RD-06 Phase B lands CSI-u decoding (RD-06 DEF-1). **Windows** paths are implemented but acceptance is **deferred-to-Windows-runner** (AR-4) like RD-01's deferred-to-remote CI — RD-07 reaches **🔒 Verified** only once a Windows runner passes. Next suggested: RD-08 (essentials gate, logging, errors & security).
- **RD-08** is **✅ Implemented** (2026-06-27): safety subsystem under `src/engine/safety/` (`sanitize`, `errors`, `redact`, `logger`, `essentials`, `index`) + the additive RD-07 `detectTty()` pre-start probe. 35 tasks / 5 phases; `npm run verify` **321/321**, the explicit `safety-error-restore.e2e.test.ts` 1/1, lint/check:deps clean, `npm audit` 0 vulns. AC-1…AC-8 covered by passing ST-1…ST-28. The canonical `sanitize()` relocated verbatim from `render/` (AR-3/AR-13; public export unchanged, RD-04 oracle stayed green). Gate refuses non-TTY (`EssentialsNotMetError`) and degrades mouse/color/alt-screen; color is **not** gated (PF-007). Screen-safe `createLogger()` is disabled by default (zero bytes, AC-5) and refuses any UI-stream sink (`LoggerConfigError`, AC-7); `redactEvent()` keeps key chars/paste text out of logs (AC-4). One runtime decision recorded: **RT-1** (the file-sink guard drops the documented `realpathSync` step — it throws on a not-yet-created log file; `openSync('a')`+`fstat` already resolves symlinks). No RD-02/RD-07 public-type changes (AR-2/AR-5). Next suggested: RD-05 (color & styling) or RD-03 (capability probe/survey harness).
- **RD-05** is **✅ Implemented** (2026-06-28): color & styling subsystem under `src/engine/color/` (`color`, `palette`, `downsample`, `encode`, `theme`, `index`). 4 phases / 26 tasks; `npm run verify` **351/351**, lint/check:deps clean, `npm audit` 0 vulns. AC-1…AC-7 covered by passing ST-1…ST-17. Depth-aware `encode`/`encodeStyle` downsample truecolor→256→16→mono via redmean weighted distance with lowest-index tie-break (corners exact); `encodeStyle` is now the `serialize()` default (AR-3 — one RD-04 impl test updated; truecolor/mono oracles stayed green) and merges attrs+fg+bg into one SGR (AR-4). `encode()` throws `InvalidColorError extends TuiError` on malformed input while the render-path seam degrades crash-safe (AR-7/AR-8). DOS-16 `PALETTE` + typed `defaultTheme` migrated from the prototype (AR-9); `nearest256`/`nearest16`/`styleKey` exposed. One deferral: **DEF-1** (attribute fallback gated on capability — needs an RD-02 caps field). `Color`/`Attr` types stayed in `render/types.ts` (AR-2). Next suggested: RD-03 (capability probe/survey harness), then RD-09 (testing & acceptance gate).
- This environment is a **local git repo with no remote**; RD-01's CI cells (AC-2) and CI publish-dry-run (AC-7) are **deferred-to-remote** (see RD-01 plan, PL-3). RD-01 advances to **🔒 Verified** only once a remote exists and the 9 CI cells pass.
