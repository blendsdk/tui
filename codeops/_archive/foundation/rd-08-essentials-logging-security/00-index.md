# RD-08 Essentials Gate, Logging, Errors & Security — Implementation Plan

> **Feature**: The cross-cutting safety layer — a runtime **essentials gate** (refuse to start on a terminal that cannot support the essentials), **screen-safe diagnostic logging** with **secret redaction**, a typed **error model** with guaranteed terminal restore, and the canonical **input/output sanitizer** (the project's primary injection boundary).
> **Status**: Planning Complete
> **Created**: 2026-06-27
> **Implements**: RD-08
> **CodeOps Skills Version**: 2.0.0

## Overview

RD-08 is the foundation's safety layer. It does not add a new runtime mode of its own;
instead it hardens the boundary between the SDK and the outside world along four axes:

1. **Essentials gate** — before an app draws, evaluate the resolved `CapabilityProfile`
   plus the host's TTY facts. If the terminal is not an interactive TTY (and therefore
   cannot do raw-mode keyboard input), the SDK **refuses to start**: it throws a typed
   `EssentialsNotMetError` **before** `host.start()`, so no terminal modes are entered and
   the terminal is left untouched (no restore needed), and (in app context) the process
   exits non-zero. (The host's guaranteed-restore covers errors thrown **after** `start()`
   — see AC-6.) Non-essential gaps
   (mouse, color, alt-screen) never stop the SDK — they come back as a structured
   **degradation report** the app can surface, with a one-time screen-safe notice.
2. **Screen-safe logging** — a TUI library owns the screen, so it can never log to the UI
   stream. `createLogger()` writes to a file, to `stderr` (only when `stderr ≠ UI`), or to
   a bounded in-memory ring — gated by `BLENDTUI_DEBUG`, disabled by default.
3. **Secret redaction** — raw keystrokes and paste contents may be credentials, so they are
   **never** logged. A pure `redactEvent()` reduces each input event to its safe shape
   (event type + non-secret fields; a paste logs only its length).
4. **Error model + canonical sanitizer** — a small typed-error hierarchy (`TuiError` base),
   and the canonical `sanitize()` (relocated from RD-04's provisional home) that strips
   ESC/BEL/ST/C0/C1 from every untrusted text-output path, neutralizing ANSI/OSC injection.

All of this lives in a single new `src/engine/safety/` subsystem, re-exported from the SDK's
public entry point. The RD-07 host and RD-02 capability model are **read, not modified**:
the gate consumes `host.isTTY` + resolved caps, and the error model reuses the host's existing
guaranteed-restore crash path. The paste-size cap is already defined and enforced in the RD-06
decoder; RD-08 owns its acceptance tests, not new enforcement.

## Document Index

| #     | Document                                                                 | Description                                              |
| ----- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| AR    | [Ambiguity Register](00-ambiguity-register.md)                           | Zero-Ambiguity Gate decisions (audit trail)             |
| 00    | [Index](00-index.md)                                                     | This document — overview and navigation                 |
| 01    | [Requirements](01-requirements.md)                                       | Feature requirements and scope                          |
| 02    | [Current State](02-current-state.md)                                     | Integration surfaces RD-08 consumes / relocates         |
| 03-01 | [Essentials Gate & Error Model](03-01-essentials-gate-and-errors.md)     | `essentials.ts` + `errors.ts` — gate, degradation, typed errors |
| 03-02 | [Logging & Redaction](03-02-logging-and-redaction.md)                    | `logger.ts` + `redact.ts` — sinks, levels, redaction, caps dump |
| 03-03 | [Sanitizer Relocation](03-03-sanitizer-relocation.md)                    | Move canonical `sanitize()` into `safety/`; rewire imports |
| 07    | [Testing Strategy](07-testing-strategy.md)                               | Specification test cases (ST-*) + verification          |
| 99    | [Execution Plan](99-execution-plan.md)                                   | Phases, sessions, and task checklist                    |

## Quick Reference

### Usage Examples

```ts
import {
  resolveCapabilities, createHost, detectTty,
  assertEssentials, evaluateEssentials, createLogger,
  EssentialsNotMetError, sanitize,
} from '@blendsdk/tui';

const { profile: caps } = resolveCapabilities();
const log = createLogger();                 // from env; disabled unless BLENDTUI_DEBUG=1

// Resolve authoritative TTY facts BEFORE taking over the terminal. detectTty() shares the
// host's stream/`/dev/tty` detection (no duplication) without entering any mode.
const facts = { isTTY: detectTty() };

// Gate: throws EssentialsNotMetError on a non-interactive terminal; logs degradations once.
// Runs before start(), so a refusal leaves the terminal untouched.
assertEssentials(caps, facts, { logger: log });

const host = createHost({ caps });
await host.start();
// app's own loop calls host.render(buffer); a throw there reaches the host's
// guaranteed-restore crash path (terminal restored before the process exits).

// Pure inspection without throwing:
const report = evaluateEssentials(caps, facts);
// report.met === true even with no mouse; report.degradations === [{cap:'mouse', mode:'keyboard-only', ...}]

sanitize('a\x1b]0;x\x07b'); // -> 'a]0;xb'  (ESC/BEL/ST stripped; injection neutralized)
```

### Key Decisions

| Decision | Outcome | AR |
| -------- | ------- | -- |
| Run-loop error model | Standalone gate + typed errors; reuse host's existing crash-restore | AR-1 |
| Gate inputs | TTY facts from `detectTty()` (shares host stream detection; covers raw-mode); `colorDepth` not gated (mono always counts); cursor/clear implied; no RD-02/RD-07 *type* edits (additive `detectTty` helper only) | AR-2 |
| Sanitizer home | Relocated canonical `sanitize()` to `safety/`; render imports it; public re-export unchanged | AR-3, AR-13 |
| Module layout | One `src/engine/safety/` directory (6 files) | AR-4, AR-12 |
| Logging | Standalone `createLogger()` + pure `redactEvent()`; host untouched; both Should-Haves included | AR-5, AR-6, AR-14 |
| Error types | `TuiError` base + `EssentialsNotMetError` + `LoggerConfigError` | AR-7 |
| Degradation | Structured report from `evaluateEssentials`; notices logged once (never UI stream) | AR-8 |
| Key redaction | Named keys by name; printable keys → `{printable:true}` + modifiers (discriminate via `codepoint`) | AR-9 |
| Log config | `BLENDTUI_DEBUG` gates; `BLENDTUI_LOG`→file else stderr-if-safe; level `debug`; ring 1024; UI-stream sink → `LoggerConfigError` | AR-10 |
| Paste cap | Tests + docs only; enforcement stays in the RD-06 decoder | AR-11 |

## Related Files

**New (`src/engine/safety/`):** `essentials.ts`, `errors.ts`, `logger.ts`, `redact.ts`, `sanitize.ts` (relocated), `index.ts`.
**Modified:** `src/engine/index.ts` (re-export `safety/` surface; move `sanitize` re-export), `src/engine/render/osc.ts` + `render/buffer.ts` (import `sanitize` from `../safety/`), `src/engine/render/index.ts` (drop `sanitize` re-export), `src/engine/render/sanitize.ts` (deleted after move). **RD-07 (additive only, PF-001):** `src/engine/host/streams.ts` (export `detectTty()` — factored from `bindStreams`), `src/engine/host/index.ts` (re-export it).
**New tests (`test/`):** `safety-essentials.spec.test.ts`, `safety-logger.spec.test.ts`, `safety-redact.spec.test.ts`, `safety-sanitize.spec.test.ts`, `safety-paste-cap.spec.test.ts`, `safety-error-restore.e2e.test.ts`, `host-detect-tty.spec.test.ts`, plus `*.impl.test.ts` companions; relocate `render-sanitize.impl.test.ts` → `safety-sanitize.impl.test.ts` and update `render-security.spec.test.ts`'s sanitize import path.
