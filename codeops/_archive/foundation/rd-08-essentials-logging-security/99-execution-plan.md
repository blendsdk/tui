# Execution Plan: RD-08 Essentials Gate, Logging, Errors & Security

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-06-27 23:54
> **Progress**: 35/35 tasks (100%)
> **CodeOps Skills Version**: 2.0.0

## Overview

Build the `src/engine/safety/` subsystem in four feature phases plus a finalize phase, each
following the mandatory spec-first ordering (spec tests → red → implement → green → impl tests →
verify). Phase 1 relocates the canonical sanitizer (a behavior-preserving refactor that must keep
the RD-04 oracle green). Phase 2 builds the error model, logger, and redaction. Phase 3 builds the
essentials gate (depends on the `Logger` type) plus the additive RD-07 `detectTty()` helper that
feeds it authoritative TTY facts pre-start (PF-001). Phase 4 adds acceptance coverage for the
already-enforced paste cap and the host crash-restore ordering. Phase 5 documents and finalizes.

RD-02 and RD-07 public contracts are **not** modified (AR-2, AR-5). The `@blendsdk/tui` public
`sanitize` export stays identical after relocation (AR-3).

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
| ----- | ----- | -------- | --------- |
| 1 | Sanitizer relocation | 1 | 45 min |
| 2 | Error model, logger & redaction | 1-2 | 120 min |
| 3 | Essentials gate | 1 | 60 min |
| 4 | Acceptance: paste cap & error-restore e2e | 1 | 45 min |
| 5 | Documentation & finalize | 1 | 30 min |

**Total: 5-6 sessions, ~5 hours**

---

## Phase 1: Sanitizer relocation

### Session 1.1: Spec tests (BEFORE implementation)

**Reference**: [03-03-sanitizer-relocation.md](03-03-sanitizer-relocation.md), [07-testing-strategy.md](07-testing-strategy.md) ST-9…ST-13
**Objective**: Pin the canonical sanitizer behavior at its new location before the move.

| #     | Task | File |
| ----- | ---- | ---- |
| 1.1.1 | Write `safety-sanitize.spec.test.ts` (ST-9…ST-13) importing `sanitize` from `../src/engine/safety/sanitize.js` | `test/safety-sanitize.spec.test.ts` |
| 1.1.2 | Run spec tests — verify they FAIL (red: module does not exist yet) | — |

### Session 1.2: Implementation (the move)

**Reference**: [03-03-sanitizer-relocation.md](03-03-sanitizer-relocation.md)

| #     | Task | File |
| ----- | ---- | ---- |
| 1.2.1 | Create `safety/sanitize.ts` (move impl verbatim; refresh JSDoc to canonical) + `safety/index.ts` re-exporting `sanitize` | `src/engine/safety/sanitize.ts`, `src/engine/safety/index.ts` |
| 1.2.2 | Rewire `render/buffer.ts:20` + `render/osc.ts:16` imports to `../safety/sanitize.js`; drop `render/index.ts:35` re-export + update its JSDoc; delete `render/sanitize.ts` | `src/engine/render/*` |
| 1.2.3 | Move `sanitize` re-export in `src/engine/index.ts` from the render block to a new `safety/` block | `src/engine/index.ts` |
| 1.2.4 | Update `render-security.spec.test.ts:16` sanitize import path; relocate `render-sanitize.impl.test.ts` → `safety-sanitize.impl.test.ts` (update import) | `test/*` |
| 1.2.5 | Run spec tests — verify they PASS (green); confirm RD-04 `render-security.spec.test.ts` oracle still green | — |

### Session 1.3: Impl tests & hardening

| #     | Task | File |
| ----- | ---- | ---- |
| 1.3.1 | Expand `safety-sanitize.impl.test.ts` edge cases (empty, all-control, mixed runs, lone trailing ESC) | `test/safety-sanitize.impl.test.ts` |
| 1.3.2 | Full verification | — |

**Deliverables**:
- [x] Canonical sanitizer lives in `safety/`; render imports rewired; no shim/dead code
- [x] Public `sanitize` export unchanged; RD-04 oracle green
- [x] All verification passing

**Verify**: `npm run verify`

---

## Phase 2: Error model, logger & redaction

### Session 2.1: Spec tests (BEFORE implementation)

**Reference**: [03-02-logging-and-redaction.md](03-02-logging-and-redaction.md), [03-01-essentials-gate-and-errors.md](03-01-essentials-gate-and-errors.md) (errors), ST-14…ST-23

| #     | Task | File |
| ----- | ---- | ---- |
| 2.1.1 | Write `safety-redact.spec.test.ts` (ST-14…ST-18) | `test/safety-redact.spec.test.ts` |
| 2.1.2 | Write `safety-logger.spec.test.ts` (ST-19…ST-23, incl. ST-22 `LoggerConfigError`) | `test/safety-logger.spec.test.ts` |
| 2.1.3 | Run spec tests — verify they FAIL (red) | — |

### Session 2.2: Implementation

**Reference**: [03-01](03-01-essentials-gate-and-errors.md) (errors), [03-02](03-02-logging-and-redaction.md)

| #     | Task | File |
| ----- | ---- | ---- |
| 2.2.1 | Implement `errors.ts` — `TuiError`, `EssentialsNotMetError(missing)`, `LoggerConfigError` | `src/engine/safety/errors.ts` |
| 2.2.2 | Implement `redact.ts` — `redactEvent()` (codepoint discriminator) + `dumpCaps()` | `src/engine/safety/redact.ts` |
| 2.2.3 | Implement `logger.ts` — `createLogger()`, levels, file/stderr/ring sinks, env gating, UI-stream `LoggerConfigError` guard | `src/engine/safety/logger.ts` |
| 2.2.4 | Re-export the new surface from `safety/index.ts` and `src/engine/index.ts` | `src/engine/safety/index.ts`, `src/engine/index.ts` |
| 2.2.5 | Run spec tests — verify they PASS (green); fix implementation (never the spec) on any failure | — |

### Session 2.3: Impl tests & hardening

| #     | Task | File |
| ----- | ---- | ---- |
| 2.3.1 | Write `safety-errors.impl.test.ts`, `safety-redact.impl.test.ts`, `safety-logger.impl.test.ts` (instanceof chain; wheel/focus; file append + `close()`; `auto` sink selection) | `test/safety-*.impl.test.ts` |
| 2.3.2 | Full verification | — |

**Deliverables**:
- [x] Typed errors, screen-safe logger, and redaction implemented + exported
- [x] No-secret-logging asserted (printable key char never logged; paste → length only)
- [x] Disabled logger writes zero bytes (AC-5); UI-stream sink refused (AC-7)
- [x] All verification passing

**Verify**: `npm run verify`

---

## Phase 3: Essentials gate

### Session 3.1: Spec tests (BEFORE implementation)

**Reference**: [03-01-essentials-gate-and-errors.md](03-01-essentials-gate-and-errors.md), ST-1…ST-8

| #     | Task | File |
| ----- | ---- | ---- |
| 3.1.1 | Write `safety-essentials.spec.test.ts` (ST-1…ST-8) | `test/safety-essentials.spec.test.ts` |
| 3.1.2 | Write `host-detect-tty.spec.test.ts` (ST-27, ST-28) | `test/host-detect-tty.spec.test.ts` |
| 3.1.3 | Run spec tests — verify they FAIL (red) | — |

### Session 3.2: Implementation

| #     | Task | File |
| ----- | ---- | ---- |
| 3.2.1 | Add `detectTty(options?)` to `host/streams.ts` (factor from `bindStreams`; ephemeral open+dispose); re-export from `host/index.ts` + top-level `index.ts` | `src/engine/host/streams.ts`, `src/engine/host/index.ts`, `src/engine/index.ts` |
| 3.2.2 | Implement `essentials.ts` — `evaluateEssentials`, `essentialsMet`, `assertEssentials` (+ `EssentialsReport`, `Degradation`, `HostFacts`) over TTY facts | `src/engine/safety/essentials.ts` |
| 3.2.3 | Re-export from `safety/index.ts` and `src/engine/index.ts` | `src/engine/safety/index.ts`, `src/engine/index.ts` |
| 3.2.4 | Run spec tests — verify they PASS (green) | — |

### Session 3.3: Impl tests & hardening

| #     | Task | File |
| ----- | ---- | ---- |
| 3.3.1 | Write `safety-essentials.impl.test.ts` (multiple degradations; `missing` ordering; structural `HostFacts`) | `test/safety-essentials.impl.test.ts` |
| 3.3.2 | Full verification | — |

**Deliverables**:
- [x] `detectTty()` resolves authoritative TTY facts pre-start (PF-001), re-exported publicly
- [x] Gate refuses non-interactive terminals (AC-1) and degrades non-essentials (AC-2)
- [x] One-time degradation notice written via the logger (screen-safe)
- [x] All verification passing

**Verify**: `npm run verify`

---

## Phase 4: Acceptance — paste cap & error-restore e2e

> No new runtime code (AR-11, AR-1): these spec tests exercise the existing RD-06 decoder
> enforcement and the existing RD-07 host crash path. Per the spec-first protocol, document any
> case that passes pre-implementation with justification (the behavior already exists; RD-08 owns
> its acceptance framing).

### Session 4.1: Acceptance spec tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md) ST-24…ST-26

| #     | Task | File |
| ----- | ---- | ---- |
| 4.1.1 | Write `safety-paste-cap.spec.test.ts` (ST-24, ST-25) driving the RD-06 `decode` with a cap+1 paste | `test/safety-paste-cap.spec.test.ts` |
| 4.1.2 | Write `safety-error-restore.e2e.test.ts` (ST-26): build a host with the fake `RuntimeAdapter`, fire an uncaught `EssentialsNotMetError`, assert restore precedes `exit(1)` | `test/safety-error-restore.e2e.test.ts` |
| 4.1.3 | Run the new tests; record any pre-existing pass with a one-line justification (no `safety/` code backs them — enforcement is in RD-06/RD-07) | — |

### Session 4.2: Verification

| #     | Task | File |
| ----- | ---- | ---- |
| 4.2.1 | Full verification + explicit e2e run (`npx tsx --test test/safety-error-restore.e2e.test.ts`) | — |

**Deliverables**:
- [x] Paste-cap boundary (cap+1 → `truncated:true`) and DoS-bounded behavior verified (AC-7, AC-8)
- [x] Error-through-loop restores terminal before exit (AC-6)
- [x] All verification passing

**Verify**: `npm run verify` + explicit e2e

---

## Phase 5: Documentation & finalize

### Session 5.1: Docs & final gate

| #     | Task | File |
| ----- | ---- | ---- |
| 5.1.1 | Document the `safety` subsystem in the README (gate, logger, redaction, sanitizer, error model; env flags) | `README.md` |
| 5.1.2 | Final full verification — `npm run verify`, `npm run lint`, `npm run check:deps`, `npm audit` | — |
| 5.1.3 | Mark roadmap RD-08 → ✅ Implemented (via the roadmap skill on completion) | `plans/00-roadmap.md` |

**Deliverables**:
- [x] README documents the safety layer and its env flags
- [x] All gates green (verify/lint/check:deps/audit)
- [x] Roadmap updated

**Verify**: `npm run verify`

---

## 🚨 Master Progress Checklist (All Phases) — MANDATORY

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> 1. **After completing each task:** mark it `[x]` with a timestamp — e.g. `- [x] 1.1.1 … ✅ (completed: YYYY-MM-DD HH:MM)`
> 2. **After completing each phase:** confirm every task in that phase is marked `[x]`
> 3. **Update the Progress header** (`> **Progress**: X/Y tasks (Z%)`) after every update
> 4. **This checklist MUST exist** — reconstruct from the phase details if missing
> 5. **Never batch updates** — update immediately after each task

### Phase 1: Sanitizer relocation
- [x] 1.1.1 Write `safety-sanitize.spec.test.ts` (ST-9…ST-13) ✅ (completed: 2026-06-27 22:30)
- [x] 1.1.2 Run spec tests — verify FAIL (red) ✅ (completed: 2026-06-27 22:30)
- [x] 1.2.1 Create `safety/sanitize.ts` (verbatim move) + `safety/index.ts` ✅ (completed: 2026-06-27 22:35)
- [x] 1.2.2 Rewire render imports; drop render re-export; delete `render/sanitize.ts` ✅ (completed: 2026-06-27 22:35)
- [x] 1.2.3 Move `sanitize` re-export in `src/engine/index.ts` to the `safety/` block ✅ (completed: 2026-06-27 22:36)
- [x] 1.2.4 Update `render-security.spec.test.ts` import; relocate `render-sanitize.impl.test.ts` ✅ (completed: 2026-06-27 22:37)
- [x] 1.2.5 Run spec tests — verify PASS (green); RD-04 oracle green ✅ (completed: 2026-06-27 22:38)
- [x] 1.3.1 Expand `safety-sanitize.impl.test.ts` edge cases ✅ (completed: 2026-06-27 22:40)
- [x] 1.3.2 Full verification ✅ (completed: 2026-06-27 22:40)

### Phase 2: Error model, logger & redaction
- [x] 2.1.1 Write `safety-redact.spec.test.ts` (ST-14…ST-18) ✅ (completed: 2026-06-27 22:50)
- [x] 2.1.2 Write `safety-logger.spec.test.ts` (ST-19…ST-23) ✅ (completed: 2026-06-27 22:50)
- [x] 2.1.3 Run spec tests — verify FAIL (red) ✅ (completed: 2026-06-27 22:50)
- [x] 2.2.1 Implement `errors.ts` (`TuiError`/`EssentialsNotMetError`/`LoggerConfigError`) ✅ (completed: 2026-06-27 22:58)
- [x] 2.2.2 Implement `redact.ts` (`redactEvent`/`dumpCaps`) ✅ (completed: 2026-06-27 22:58)
- [x] 2.2.3 Implement `logger.ts` (`createLogger`, sinks, gating, UI-stream guard) ✅ (completed: 2026-06-27 22:58)
- [x] 2.2.4 Re-export from `safety/index.ts` + `src/engine/index.ts` ✅ (completed: 2026-06-27 22:59)
- [x] 2.2.5 Run spec tests — verify PASS (green) ✅ (completed: 2026-06-27 23:00)
- [x] 2.3.1 Write `safety-errors/redact/logger.impl.test.ts` ✅ (completed: 2026-06-27 23:08)
- [x] 2.3.2 Full verification ✅ (completed: 2026-06-27 23:10)

### Phase 3: Essentials gate
- [x] 3.1.1 Write `safety-essentials.spec.test.ts` (ST-1…ST-8) ✅ (completed: 2026-06-27 23:18)
- [x] 3.1.2 Write `host-detect-tty.spec.test.ts` (ST-27, ST-28) ✅ (completed: 2026-06-27 23:18)
- [x] 3.1.3 Run spec tests — verify FAIL (red) ✅ (completed: 2026-06-27 23:18)
- [x] 3.2.1 Add `detectTty()` to `host/streams.ts` (+ re-exports) ✅ (completed: 2026-06-27 23:24)
- [x] 3.2.2 Implement `essentials.ts` (`evaluateEssentials`/`essentialsMet`/`assertEssentials`) ✅ (completed: 2026-06-27 23:26)
- [x] 3.2.3 Re-export from `safety/index.ts` + `src/engine/index.ts` ✅ (completed: 2026-06-27 23:27)
- [x] 3.2.4 Run spec tests — verify PASS (green) ✅ (completed: 2026-06-27 23:28)
- [x] 3.3.1 Write `safety-essentials.impl.test.ts` ✅ (completed: 2026-06-27 23:30)
- [x] 3.3.2 Full verification ✅ (completed: 2026-06-27 23:31)

### Phase 4: Acceptance — paste cap & error-restore e2e
- [x] 4.1.1 Write `safety-paste-cap.spec.test.ts` (ST-24, ST-25) ✅ (completed: 2026-06-27 23:40)
- [x] 4.1.2 Write `safety-error-restore.e2e.test.ts` (ST-26) ✅ (completed: 2026-06-27 23:40)
- [x] 4.1.3 Run; document any pre-existing pass with justification ✅ (completed: 2026-06-27 23:41) — all 3 PASS pre-implementation; documented per AR-11/AR-1: enforcement already lives in the RD-06 decoder (paste cap) and the RD-07 `handleFatal` restore-before-exit path, so RD-08 adds no new runtime code (Phase 4 note). Not a spec-first violation.
- [x] 4.2.1 Full verification + explicit e2e run ✅ (completed: 2026-06-27 23:42)

### Phase 5: Documentation & finalize
- [x] 5.1.1 README: document the safety subsystem + env flags ✅ (completed: 2026-06-27 23:50)
- [x] 5.1.2 Final full verify + lint + check:deps + audit ✅ (completed: 2026-06-27 23:52) — verify 321/321, e2e 1/1, lint clean, check:deps OK, audit 0 vulns
- [x] 5.1.3 Roadmap RD-08 → ✅ Implemented ✅ (completed: 2026-06-27 23:54)

---

## Dependencies

```
Phase 1 (sanitizer relocation — independent refactor)
    ↓
Phase 2 (errors + logger + redaction — Logger type needed by the gate)
    ↓
Phase 3 (essentials gate — depends on Logger)
    ↓
Phase 4 (acceptance: paste-cap + error-restore e2e — needs typed errors from Phase 2)
    ↓
Phase 5 (docs & finalize)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`npm run verify`)
3. ✅ No warnings/errors (lint + `check:deps` + `npm audit` clean)
4. ✅ No dead code — `render/sanitize.ts` deleted, no leftover imports, no unused exports
5. ✅ Security hardened — sanitizer rule table covered; no-secret-logging asserted; essentials gate per-missing; paste-cap boundary + DoS verified; UI-stream sink refused
6. ✅ Documentation updated (README + roadmap)
7. ✅ RD-02/RD-04/RD-06/RD-07 suites still green (no public-contract regressions)
8. ✅ Post-completion project re-analysis (handled by the exec_plan skill)
