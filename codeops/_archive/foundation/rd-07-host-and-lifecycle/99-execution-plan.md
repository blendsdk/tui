# Execution Plan: RD-07 Host & Lifecycle

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-06-27 21:20
> **Progress**: 30/30 checklist items — ✅ all phases complete; `npm run verify` 273/273, e2e green
> **CodeOps Skills Version**: 2.0.0

## Overview

Implement the native `tty` host under `src/engine/host/` (8 files, AR-5), wiring RD-02 caps +
RD-06 decoder + RD-04 renderer into a running loop with guaranteed terminal restore on every exit
path. Specification-first ordering throughout: spec tests → red → implement → green → impl tests →
verify. All OS effects sit behind an injectable `RuntimeAdapter` so behavior is tested in-process,
backed by one thin subprocess e2e for the real signal→exit wiring (AR-13).

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
| ----- | ----- | -------- | --------- |
| 1 | Foundation: types, streams, platform adapter | 1 | 60 min |
| 2 | Modes: enter/leave sequence builders | 1 | 50 min |
| 3 | Orchestrator: createHost lifecycle + input pump + render | 1–2 | 90 min |
| 4 | Signals & lifecycle: resize, suspend/resume, signals, restore, EPIPE | 1–2 | 100 min |
| 5 | Public API, e2e, docs & roadmap | 1 | 60 min |

**Total: ~5–7 sessions, ~6–7 hours**

---

## Phase 1: Foundation — types, streams, platform adapter

### Session 1.1: Types + streams + real runtime adapter

**Reference**: [03-01](03-01-public-api-and-orchestrator.md), [03-02](03-02-modes-signals-platform.md), [03-03](03-03-streams-and-restore.md)
**Objective**: Land the type surface and the two leaf modules that have no engine-logic dependencies, so later phases compile against real types.

> Phase 1 modules are infrastructure consumed by every later spec. `types.ts` is pure declarations
> (no behavior → no spec test); `streams.ts`/`platform.ts` behavior is proven by the lifecycle spec
> tests in Phase 4 (ST-6) and `host.impl.test.ts`. No AC-derived behavior is implemented here ahead
> of its spec, so the spec-first rule is preserved (the AC-bearing phases are 2–4).

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 1.1.1 | Define `ResizeEvent`, `HostOptions` (incl. `focus?`, PF-006), `Host`, `RuntimeAdapter` (incl. `suspendSelf`/`onUncaughtException`/`onUnhandledRejection`/`writeSync`/`writeError`, PF-001/002/004), `HostSignal` (payload-free set, PF-002), `TimerHandle` | `src/engine/host/types.ts` |
| 1.1.2 | Implement `bindStreams()` → `{input,output,isTTY,dispose}`; /dev/tty bind on piped stdout (POSIX), fallback on failure | `src/engine/host/streams.ts` |
| 1.1.3 | Implement `realRuntime(output)` + pure `hostSignalSource(platform,signal)` (PF-005/PF-010) — per-platform source map, setRawMode, suspendSelf, timers/immediate, exit, writeSync/writeError, onProcessExit/onUncaught/onUnhandledRejection, warn, injectable Windows VT check | `src/engine/host/platform.ts` |

**Deliverables**:
- [x] `types.ts`, `streams.ts`, `platform.ts` compile under `tsc --noEmit`
- [x] JSDoc on every exported symbol with AR back-references
- [x] `npm run typecheck` clean (no tests yet for this phase)

**Verify**: `npm run typecheck && npm run lint`

---

## Phase 2: Modes — enter/leave sequence builders

### Session 2.1: Spec → implement → impl (modes.ts)

**Reference**: [03-02](03-02-modes-signals-platform.md) sequence table, [07](07-testing-strategy.md) ST-1/ST-1b/ST-2

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 2.1.1 | Write spec tests ST-1, ST-1b, ST-2 (exact enter/leave strings; gating; strict inverse) — MUST NOT read impl | `test/host-modes.spec.test.ts` |
| 2.1.2 | Run spec tests — verify they FAIL (red) | — |
| 2.1.3 | Implement `enterMode(caps, opts?)` / `leaveMode(caps, opts?)` per the 03-02 table (no `?1003h`; `?1002h` gated on drag; focus via `opts.focus`, PF-003/PF-006) | `src/engine/host/modes.ts` |
| 2.1.4 | Run spec tests — verify they PASS (green); fix impl (not tests) on failure | — |
| 2.1.5 | Add impl tests: each gate independently (mono, no-mouse, drag-off→no `?1002h`, no-paste, `focus:false`→no `?1004h`, keyboard variants) | `test/host.impl.test.ts` (modes section) |

**Deliverables**:
- [x] ST-1, ST-1b, ST-2 green
- [x] `npm run verify` green (238/238)

**Verify**: `npm run verify`

---

## Phase 3: Orchestrator — createHost lifecycle, input pump, render

### Session 3.1: Spec → implement → impl (host.ts core)

**Reference**: [03-01](03-01-public-api-and-orchestrator.md), [07](07-testing-strategy.md) ST-7/13/14/15/16

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 3.1.1 | Write spec tests ST-7 (start→render→stop via fake adapter+capture), ST-13 (idempotency), ST-14 (key dispatch), ST-15 (query routed away), ST-16 (ESC flush timer) | `test/host.spec.test.ts` |
| 3.1.2 | Run spec tests — verify they FAIL (red) | — |
| 3.1.3 | Implement `createHost()` skeleton: resolve runtime+streams, `start()`/`stop()` (idempotent), enter/leave write, raw-mode toggle | `src/engine/host/host.ts` |
| 3.1.4 | Implement the input pump: `data`→`decode`→dispatch to `onInput`, route `queries` away, ESC-timer flush (AR-14) | `src/engine/host/host.ts` |
| 3.1.5 | Implement `render(buffer)`: `serialize(next,prev,{caps})` → single write → store prev/lastBuffer (AR-3) | `src/engine/host/host.ts` |
| 3.1.6 | Run spec tests — verify they PASS (green) | — |
| 3.1.7 | Add impl tests: ESC timer cancel-on-new-bytes; double-start/stop; listener cleanup across cycles; render empty-diff writes nothing | `test/host.impl.test.ts` |

**Deliverables**:
- [x] ST-7, ST-13, ST-14, ST-15, ST-16 green
- [x] `npm run verify` green (248/248)

**Verify**: `npm run verify`

---

## Phase 4: Signals & lifecycle — resize, suspend/resume, signals, restore, EPIPE

### Session 4.1: Restore + signals install (spec → implement)

**Reference**: [03-02](03-02-modes-signals-platform.md) signals, [03-03](03-03-streams-and-restore.md) restore, [07](07-testing-strategy.md) ST-3/4/5/6/6b/8/9/10/11

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 4.1.1 | Write spec tests ST-6, ST-6b, ST-4 (resize coalesce once), ST-5 (suspend/resume) | `test/host-lifecycle.spec.test.ts` |
| 4.1.2 | Write spec tests ST-3 (signal exits 130/143/129), ST-11 (panic restore), ST-9 (no raw-input log), ST-10 (no raw-mode on non-TTY), ST-8 (EPIPE) | `test/host-security.spec.test.ts` |
| 4.1.3 | Run both spec files — verify they FAIL (red) | — |
| 4.1.4 | Implement `createRestore()` — idempotent `run(sync?)`, sync `process.on('exit')` backstop via `writeSync` (PF-004), leave-mode + raw-off | `src/engine/host/restore.ts` |
| 4.1.5 | Implement `installSignals()` — resize coalesce (setImmediate), interrupt/terminate/hangup→restore+exit, suspend (→`suspendSelf`, PF-001)/continue, teardown | `src/engine/host/signals.ts` |
| 4.1.6 | Wire signals+restore+EPIPE into `createHost` (resolve adapter after bindStreams, PF-010; share one restore; `onBeforeExit`/`exitOnSignal`; shared `handleFatal` for uncaught/unhandled/non-EPIPE→restore+`writeError`+exit1, PF-002/PF-008) | `src/engine/host/host.ts` |
| 4.1.7 | Run both spec files — verify they PASS (green); fix impl on failure | — |

**Deliverables**:
- [x] ST-3, ST-4, ST-5, ST-6, ST-6b, ST-8, ST-9, ST-10, ST-11 green
- [x] `npm run verify` green (273/273)

**Verify**: `npm run verify`

### Session 4.2: Hardening impl tests

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 4.2.1 | Impl tests: double-restore guard; non-EPIPE error → `handleFatal` (no throw, PF-008); `exitOnSignal:false` skips exit; resize reads size once; /dev/tty fallback; no listener leaks | `test/host.impl.test.ts` |
| 4.2.2 | Platform impl tests: `hostSignalSource` POSIX/win32 map (suspend/continue→null on win32); win32 resize/hangup attach to provided output (PF-010); VT-warn-once via injectable predicate (PF-005) | `test/host-platform.impl.test.ts` |
| 4.2.3 | Full verification + check:deps + audit | — |

**Deliverables**:
- [x] `npm run verify` green; `npm run check:deps` clean; `npm audit` 0 vulns

**Verify**: `npm run verify && npm run check:deps`

---

## Phase 5: Public API, e2e, docs & roadmap

### Session 5.1: Barrel, e2e, documentation

**Reference**: [03-01](03-01-public-api-and-orchestrator.md) integration, [07](07-testing-strategy.md) ST-12

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 5.1.1 | Create `host/index.ts` barrel; re-export `createHost` + `Host`/`HostOptions`/`ResizeEvent`/`RuntimeAdapter` from `src/engine/index.ts` | `src/engine/host/index.ts`, `src/engine/index.ts` |
| 5.1.2 | Write ST-12 subprocess e2e: spawn a real host (tsx), send real SIGINT, assert exitCode 130 + leave-mode in captured stdout | `test/host-signals.e2e.test.ts` |
| 5.1.3 | Run the e2e explicitly: `npx tsx --test test/host-signals.e2e.test.ts` | — |
| 5.1.4 | README "Host & lifecycle (RD-07)" section + usage example | `README.md` |
| 5.1.5 | Final `npm run verify` + lint + check:deps + audit; confirm RD-02/04/06 suites green | — |

**Deliverables**:
- [x] Public API exported; `import { createHost } from '@blendsdk/tui'` works
- [x] ST-12 e2e passes
- [x] README updated; `npm run verify` green (273/273); lint/check:deps clean; audit 0 vulns

**Verify**: `npm run verify && npm run lint && npm run check:deps` + explicit e2e

> Roadmap sync (RD-07 → ✅ Implemented), CLAUDE.md re-analysis, and commits are owned by the
> exec_plan skill's post-completion hooks — not tasks here.

---

## 🚨 Master Progress Checklist (All Phases) — MANDATORY

> **⚠️ EXECUTION RULE:** After completing each task mark it `[x]` with a timestamp; after each phase
> confirm all its tasks are `[x]`; update the Progress header after every change; never batch updates.

### Phase 1: Foundation
- [x] 1.1.1 Define host types (`types.ts`) — 2026-06-27 20:19
- [x] 1.1.2 Implement `bindStreams` (`streams.ts`) — 2026-06-27 20:19
- [x] 1.1.3 Implement `realRuntime` adapter (`platform.ts`) — 2026-06-27 20:19

### Phase 2: Modes
- [x] 2.1.1 Spec tests ST-1/1b/2 (`host-modes.spec.test.ts`) — 2026-06-27 20:30
- [x] 2.1.2 Verify red — 2026-06-27 20:30
- [x] 2.1.3 Implement `enterMode`/`leaveMode` (`modes.ts`) — 2026-06-27 20:30 (step 9 deferred, DEF-2/RT-1)
- [x] 2.1.4 Verify green — 2026-06-27 20:30
- [x] 2.1.5 Impl tests (mode gating) — 2026-06-27 20:30

### Phase 3: Orchestrator
- [x] 3.1.1 Spec tests ST-7/13/14/15/16 (`host.spec.test.ts`) — 2026-06-27 20:45
- [x] 3.1.2 Verify red — 2026-06-27 20:45
- [x] 3.1.3 Implement `createHost` start/stop skeleton (`host.ts`) — 2026-06-27 20:45
- [x] 3.1.4 Implement input pump + ESC timer (`host.ts`) — 2026-06-27 20:45
- [x] 3.1.5 Implement `render` (`host.ts`) — 2026-06-27 20:45
- [x] 3.1.6 Verify green — 2026-06-27 20:45
- [x] 3.1.7 Impl tests (ESC cancel, idempotency, cleanup, empty diff) — 2026-06-27 20:45

### Phase 4: Signals & lifecycle
- [x] 4.1.1 Spec tests ST-6/6b/4/5 (`host-lifecycle.spec.test.ts`) — 2026-06-27 21:05
- [x] 4.1.2 Spec tests ST-3/11/9/10/8 (`host-security.spec.test.ts`) — 2026-06-27 21:05
- [x] 4.1.3 Verify red — 2026-06-27 21:05
- [x] 4.1.4 Implement `createRestore` (`restore.ts`) — 2026-06-27 21:05
- [x] 4.1.5 Implement `installSignals` (`signals.ts`) — 2026-06-27 21:05
- [x] 4.1.6 Wire signals+restore+EPIPE into `createHost` (`host.ts`) — 2026-06-27 21:05
- [x] 4.1.7 Verify green — 2026-06-27 21:05
- [x] 4.2.1 Hardening impl tests (`host.impl.test.ts`) — 2026-06-27 21:05
- [x] 4.2.2 Platform impl tests (`host-platform.impl.test.ts`) — 2026-06-27 21:05
- [x] 4.2.3 Full verify + check:deps + audit — 2026-06-27 21:05

### Phase 5: Public API, e2e, docs
- [x] 5.1.1 Barrel + `index.ts` re-exports — 2026-06-27 21:20
- [x] 5.1.2 ST-12 subprocess e2e (`host-signals.e2e.test.ts`) — 2026-06-27 21:20
- [x] 5.1.3 Run e2e explicitly — 2026-06-27 21:20
- [x] 5.1.4 README Host section — 2026-06-27 21:20
- [x] 5.1.5 Final verify + lint + check:deps + audit — 2026-06-27 21:20

---

## Dependencies

```
Phase 1 (types, streams, platform)
    ↓
Phase 2 (modes) ───────────────┐
    ↓                          │
Phase 3 (orchestrator core) ───┤  (needs types + modes + streams + platform)
    ↓                          │
Phase 4 (signals + restore) ───┘  (needs orchestrator + modes + restore)
    ↓
Phase 5 (public API + e2e + docs)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases complete; all 25 tasks `[x]`
2. ✅ `npm run verify` green (typecheck + test + build)
3. ✅ `npm run lint` + `npm run check:deps` clean; `npm audit` 0 vulns
4. ✅ ST-1…ST-16 (incl. ST-12 e2e) pass; AC-1…AC-8 covered
5. ✅ No dead code; no unused params/functions/modules
6. ✅ Security hardened: no raw-input logging; no raw-mode on non-TTY; restore on every exit path; host writes only engine-produced bytes
7. ✅ RD-02/RD-04/RD-06 suites still green
8. ✅ README updated; post-completion re-analysis + roadmap sync (exec_plan hooks)
9. ✅ Windows paths implemented; acceptance deferred-to-Windows-runner (AR-4) noted in roadmap
