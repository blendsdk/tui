# Execution Plan: RD-03 Capability Probe & Survey Harness

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-06-28 03:45
> **Progress**: 44/44 tasks (100%)
> **CodeOps Skills Version**: 2.0.0

## Overview

Implement RD-03 in five phases, each following the spec-first ordering
(`spec tests → red → implement → green → impl tests → verify`). Phase 1 ships the
reusable engine `TerminalQuery` + the harness skeleton; phases 2–4 add the auto, manual,
and live-readout probes; phase 5 assembles the report/matrix/`--auto` and the e2e tests.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
| ----- | ----- | -------- | --------- |
| 1 | Foundation & engine TerminalQuery | 3 | 2.5–3.5 h |
| 2 | Auto-probes | 3 | 1.5–2 h |
| 3 | Manual probes | 3 | 2–3 h |
| 4 | Live input/mouse readout | 3 | 1.5–2 h |
| 5 | Report, recommendation, matrix, --auto, e2e | 3 | 2.5–3.5 h |

**Total: ~15 sessions, ~10–14 hours**

---

## Phase 1: Foundation & engine TerminalQuery

### Session 1.1: Specification Tests
**Reference**: [03-01](03-01-engine-terminal-query.md), [03-02](03-02-harness-foundation.md), [07](07-testing-strategy.md)

| # | Task | File |
|---|------|------|
| 1.1.1 | Spec tests for `createTerminalQuery` (ST-19/20/21) — must not read impl | `test/terminal-query.spec.test.ts` |
| 1.1.2 | Spec tests for `parseArgs` (ST-1…ST-7) | `test/probe-args.spec.test.ts` |
| 1.1.3 | Spec test for `gatherEnvMeta` env allowlist (ST-28) | `test/probe-envmeta.spec.test.ts` |
| 1.1.4 | Spec test for non-TTY interactive boundary (ST-22) | `test/probe-nontty.spec.test.ts` |
| 1.1.5 | Run spec tests — verify **RED** | — |

### Session 1.2: Implementation
**Reference**: [03-01](03-01-engine-terminal-query.md), [03-02](03-02-harness-foundation.md)

| # | Task | File |
|---|------|------|
| 1.2.1 | `tsconfig.examples.json` (extends base, `include:["examples"]`, `noEmit`); add `probe` + `typecheck:examples` scripts; fold `typecheck:examples` into `verify` (AR-12) | `tsconfig.examples.json`, `package.json` |
| 1.2.2 | Implement `createTerminalQuery`; re-export from host + package entry (AR-3) | `src/engine/host/terminal-query.ts`, `src/engine/host/index.ts`, `src/engine/index.ts` |
| 1.2.3 | Implement `parseArgs` + `USAGE` (AR-7) | `examples/capability-probe/args.ts` |
| 1.2.4 | Implement `gatherEnvMeta` with strict env allowlist (AR-17) | `examples/capability-probe/env-meta.ts` |
| 1.2.5 | Define `Report`/`ProbeResult`/`ProbeMethod` types (no logic yet) | `examples/capability-probe/report.ts` |
| 1.2.6 | `main.ts` skeleton: parse → `--help`/error → non-TTY guard → `createHost` start/stop with `try/finally` restore; probe phases stubbed (AR-2/5/8) | `examples/capability-probe/main.ts` |
| 1.2.7 | Run spec tests — verify **GREEN** | — |

### Session 1.3: Impl Tests & Hardening

| # | Task | File |
|---|------|------|
| 1.3.1 | Impl tests: listener detach, `close()` idempotency, queued bytes, error-event end | `test/terminal-query.impl.test.ts` |
| 1.3.2 | Impl tests: usage text, combined/dupe flags | `test/probe-args.impl.test.ts` |
| 1.3.3 | Full verify (`npm run verify` incl. `typecheck:examples`) | — |

**Deliverables**: reusable `TerminalQuery` shipped + tested; harness skeleton runs (`--help`, non-TTY exit, enters/leaves alt-screen); toolchain wired. **Verify**: `npm run verify`.

---

## Phase 2: Auto-probes

### Session 2.1: Specification Tests
| # | Task | File |
|---|------|------|
| 2.1.1 | Spec tests: auto-probe classification via scripted fake `TerminalQuery` (ST-16/17/18) | `test/probe-auto.spec.test.ts` |
| 2.1.2 | Run spec tests — verify **RED** | — |

### Session 2.2: Implementation
**Reference**: [03-03](03-03-probes.md)
| # | Task | File |
|---|------|------|
| 2.2.1 | `PROBES` taxonomy registry covering the full RD taxonomy (AR-14) | `examples/capability-probe/taxonomy.ts` |
| 2.2.2 | `runAutoProbes` (reuse `runQueries` + cursor-pos width probe); wire upfront auto phase into `main` (AR-9) | `examples/capability-probe/auto-probes.ts`, `main.ts` |
| 2.2.3 | Run spec tests — verify **GREEN** | — |

### Session 2.3: Impl Tests & Hardening
| # | Task | File |
|---|------|------|
| 2.3.1 | Impl tests: cursor-pos width probe, COLORTERM depth, oversized-response bounding | `test/probe-auto.impl.test.ts` |
| 2.3.2 | Full verify | — |

**Verify**: `npm run verify`.

---

## Phase 3: Manual probes

### Session 3.1: Specification Tests
| # | Task | File |
|---|------|------|
| 3.1.1 | Spec tests: never-stop accumulation (ST-12) + `classifyConfirmation` (ST-12b) via scripted key source | `test/probe-manual.spec.test.ts` |
| 3.1.2 | Run spec tests — verify **RED** | — |

### Session 3.2: Implementation
**Reference**: [03-03](03-03-probes.md)
| # | Task | File |
|---|------|------|
| 3.2.1 | `renderProbePattern` (swatches/attrs/glyphs/unicode + OSC fire-and-forget constants), `classifyConfirmation`, `runManualProbes`; wire into `main` (AR-8/16/17) | `examples/capability-probe/manual-probes.ts`, `main.ts` |
| 3.2.2 | Run spec tests — verify **GREEN** | — |

### Session 3.3: Impl Tests & Hardening
| # | Task | File |
|---|------|------|
| 3.3.1 | Impl tests: each test-pattern renderer output; OSC patterns are constants | `test/probe-manual.impl.test.ts` |
| 3.3.2 | Full verify | — |

**Verify**: `npm run verify`.

---

## Phase 4: Live input/mouse readout

### Session 4.1: Specification Tests
| # | Task | File |
|---|------|------|
| 4.1.1 | Spec tests: `formatEventLine` key/mouse(1-based)/paste(length-only) oracle (ST-25/26/27) | `test/probe-readout.spec.test.ts` |
| 4.1.2 | Run spec tests — verify **RED** | — |

### Session 4.2: Implementation
**Reference**: [03-03](03-03-probes.md)
| # | Task | File |
|---|------|------|
| 4.2.1 | `formatEventLine` (via `redactEvent`) + `runLiveReadout` (q to quit); wire into `main` (AR-8/17) | `examples/capability-probe/live-readout.ts`, `main.ts` |
| 4.2.2 | Run spec tests — verify **GREEN** | — |

### Session 4.3: Impl Tests & Hardening
| # | Task | File |
|---|------|------|
| 4.3.1 | Impl tests (modifiers/wheel/focus formatting; quit on `q`) + full verify | `test/probe-readout.impl.test.ts` |

**Verify**: `npm run verify`.

---

## Phase 5: Report, recommendation, matrix, --auto, e2e

### Session 5.1: Specification Tests
**Reference**: [03-04](03-04-report-and-matrix.md), [07](07-testing-strategy.md)
| # | Task | File |
|---|------|------|
| 5.1.1 | Spec tests: `buildReport` schema (ST-8), `--auto` nulls (ST-9), `deriveRecommendation` (ST-10), color depth (ST-11) | `test/probe-report.spec.test.ts` |
| 5.1.2 | Spec tests: `appendToMatrix` empty→1 / N→N+1 / valid-array (ST-13/14/15) | `test/probe-matrix.spec.test.ts` |
| 5.1.3 | E2E spec tests: PTY Ctrl-C restore (ST-23) + `--auto` exit-0/schema (ST-24) | `test/probe.e2e.test.ts` |
| 5.1.4 | Run spec tests — verify **RED** | — |

### Session 5.2: Implementation
| # | Task | File |
|---|------|------|
| 5.2.1 | `deriveRecommendation`, `buildReport`, `renderTable`, `renderJson` (AR-10/5/17) | `examples/capability-probe/report.ts` |
| 5.2.2 | `appendToMatrix` + `MatrixFs` (absent/malformed recovery) (AR-6) | `examples/capability-probe/matrix.ts` |
| 5.2.3 | Wire `--auto` (manual→null, JSON to stdout), interactive table emit, `--out`, matrix append into `main` (AR-5/7/11) | `examples/capability-probe/main.ts` |
| 5.2.4 | Run spec tests — verify **GREEN** | — |

### Session 5.3: Impl Tests & Hardening
| # | Task | File |
|---|------|------|
| 5.3.1 | Impl tests: table alignment/markers, JSON shape, malformed-matrix recovery | `test/probe-report.impl.test.ts`, `test/probe-matrix.impl.test.ts` |
| 5.3.2 | Document the harness in README (usage + `createTerminalQuery`) | `README.md` |
| 5.3.3 | Full verify + `npm run lint` + `npm run check:deps` + `npm audit` | — |

**Verify**: `npm run verify` (+ lint/check:deps/audit).

---

## 🚨 Master Progress Checklist (All Phases) — MANDATORY

> Update immediately after each task: mark `[x]` with a timestamp, bump the Progress header. Never batch.

### Phase 1: Foundation & engine TerminalQuery
- [x] 1.1.1 Spec tests `createTerminalQuery` (ST-19/20/21) ✅ (completed: 2026-06-28 01:00)
- [x] 1.1.2 Spec tests `parseArgs` (ST-1…ST-7) ✅ (completed: 2026-06-28 01:00)
- [x] 1.1.3 Spec test `gatherEnvMeta` allowlist (ST-28) ✅ (completed: 2026-06-28 01:00)
- [x] 1.1.4 Spec test non-TTY boundary (ST-22) ✅ (completed: 2026-06-28 01:00)
- [x] 1.1.5 Run spec tests — RED ✅ (all 4 fail: ERR_MODULE_NOT_FOUND, completed: 2026-06-28 01:05)
- [x] 1.2.1 `tsconfig.examples.json` + scripts + `verify` wiring ✅ (completed: 2026-06-28 01:15)
- [x] 1.2.2 Implement `createTerminalQuery` + re-exports ✅ (completed: 2026-06-28 01:15)
- [x] 1.2.3 Implement `parseArgs` + `USAGE` ✅ (completed: 2026-06-28 01:15)
- [x] 1.2.4 Implement `gatherEnvMeta` ✅ (completed: 2026-06-28 01:15)
- [x] 1.2.5 Define report types ✅ (completed: 2026-06-28 01:15)
- [x] 1.2.6 `main.ts` skeleton (lifecycle/restore/guards) ✅ (completed: 2026-06-28 01:15)
- [x] 1.2.7 Run spec tests — GREEN ✅ (12/12, completed: 2026-06-28 01:20)
- [x] 1.3.1 Impl tests terminal-query ✅ (completed: 2026-06-28 01:25)
- [x] 1.3.2 Impl tests args ✅ (completed: 2026-06-28 01:25)
- [x] 1.3.3 Full verify ✅ (371/371, lint clean, completed: 2026-06-28 01:30)

### Phase 2: Auto-probes
- [x] 2.1.1 Spec tests auto-probes (ST-16/17/18) ✅ (completed: 2026-06-28 01:40)
- [x] 2.1.2 Run spec tests — RED ✅ (module not found, completed: 2026-06-28 01:40)
- [x] 2.2.1 `PROBES` taxonomy registry ✅ (completed: 2026-06-28 01:50)
- [x] 2.2.2 `runAutoProbes` + wire upfront phase ✅ (completed: 2026-06-28 01:55)
- [x] 2.2.3 Run spec tests — GREEN ✅ (3/3, completed: 2026-06-28 01:55)
- [x] 2.3.1 Impl tests auto-probes ✅ (completed: 2026-06-28 02:00)
- [x] 2.3.2 Full verify ✅ (378/378, lint clean, completed: 2026-06-28 02:00)

### Phase 3: Manual probes
- [x] 3.1.1 Spec tests manual (ST-12/12b) ✅ (completed: 2026-06-28 02:10)
- [x] 3.1.2 Run spec tests — RED ✅ (completed: 2026-06-28 02:10)
- [x] 3.2.1 Patterns + `classifyConfirmation` + `runManualProbes` + wire ✅ (completed: 2026-06-28 02:25)
- [x] 3.2.2 Run spec tests — GREEN ✅ (2/2, completed: 2026-06-28 02:25)
- [x] 3.3.1 Impl tests manual ✅ (completed: 2026-06-28 02:30)
- [x] 3.3.2 Full verify ✅ (386/386, lint clean, completed: 2026-06-28 02:30)

### Phase 4: Live input/mouse readout
- [x] 4.1.1 Spec tests readout (ST-25/26/27) ✅ (completed: 2026-06-28 02:45)
- [x] 4.1.2 Run spec tests — RED ✅ (completed: 2026-06-28 02:45)
- [x] 4.2.1 `formatEventLine` + `runLiveReadout` + wire ✅ (completed: 2026-06-28 02:55)
- [x] 4.2.2 Run spec tests — GREEN ✅ (3/3, completed: 2026-06-28 02:55)
- [x] 4.3.1 Impl tests readout + full verify ✅ (393/393, lint clean, completed: 2026-06-28 03:00)

### Phase 5: Report, recommendation, matrix, --auto, e2e
- [x] 5.1.1 Spec tests report (ST-8…ST-11) ✅ (completed: 2026-06-28 03:15)
- [x] 5.1.2 Spec tests matrix (ST-13/14/15) ✅ (completed: 2026-06-28 03:15)
- [x] 5.1.3 E2E spec tests (ST-23/24) ✅ (completed: 2026-06-28 03:15)
- [x] 5.1.4 Run spec tests — RED ✅ (completed: 2026-06-28 03:15)
- [x] 5.2.1 Report builder/recommendation/table/json ✅ (completed: 2026-06-28 03:25)
- [x] 5.2.2 `appendToMatrix` + `MatrixFs` ✅ (completed: 2026-06-28 03:25)
- [x] 5.2.3 Wire `--auto`/table/`--out`/matrix into `main` ✅ (completed: 2026-06-28 03:30)
- [x] 5.2.4 Run spec tests — GREEN ✅ (7/7 + e2e 2/2, completed: 2026-06-28 03:30)
- [x] 5.3.1 Impl tests report + matrix ✅ (completed: 2026-06-28 03:40)
- [x] 5.3.2 README documentation ✅ (completed: 2026-06-28 03:42)
- [x] 5.3.3 Full verify + lint + check:deps + audit ✅ (407 unit + 2 e2e, lint clean, 0 vulns, completed: 2026-06-28 03:45)

---

## Dependencies

```
Phase 1 (engine TerminalQuery + skeleton)
    ↓
Phase 2 (auto-probes — needs TerminalQuery + taxonomy)
    ↓
Phase 3 (manual probes — needs skeleton render loop)
    ↓
Phase 4 (live readout — needs input wiring)
    ↓
Phase 5 (report/matrix/--auto/e2e — needs all results populated)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ `npm run verify` passing (typecheck incl. `typecheck:examples`, tests, build)
3. ✅ No warnings/errors; lint, `check:deps`, `npm audit` clean
4. ✅ No dead code — no unused params/functions/modules
5. ✅ Security hardened — env allowlist, paste length-only, length-bounded responses, OSC constants only (AR-17)
6. ✅ All RD-03 acceptance criteria (AC-1…AC-8) covered by passing spec tests / e2e
7. ✅ README documents the harness + `createTerminalQuery`
8. ✅ Post-completion roadmap sync + project re-analysis (exec_plan skill)
