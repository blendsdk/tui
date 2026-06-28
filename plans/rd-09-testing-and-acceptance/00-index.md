# RD-09 Testing Strategy & Acceptance Gate — Implementation Plan

> **Feature**: Realize the four-tier test strategy and encode the project go/no-go gate for the `@blendsdk/tui` foundation.
> **Status**: Planning Complete
> **Created**: 2026-06-28
> **Implements**: RD-09
> **CodeOps Skills Version**: 2.0.0

## Overview

RD-09 proves the foundation and encodes the **project go/no-go gate**: if keyboard,
mouse, and scroll cannot work reliably on mainstream terminals, the project halts.
Terminal I/O is "bytes in → bytes out", so most of the engine is pure functions and
unusually testable. The foundation already ships **407 Tier-1 unit tests** plus four
explicit e2e files; this plan does **not** rewrite them (AR-8). Instead it adds the
missing tiers and the gate itself.

What this plan builds (all platform-independent, on Linux now):

- A **recorded input corpus** (hex-in-JSON fixtures) driving a data-driven Tier-1
  regression runner — chunk-split sequences, SGR mouse, wheel, paste, DA responses (AR-6).
- **Tier-2 golden-screen tests** that render → serialize → feed the bytes to
  `@xterm/headless` → assert the resulting grid across all four colour depths (AR-7, AR-12).
- **Tier-3 PTY-style integration** that extends the project's existing no-node-pty
  child-process harness to alt-screen, mouse, and restore-on-every-exit assertions (AR-2).
- A **fuzz harness** feeding seeded adversarial byte streams to the decoder (AR-5, AR-11).
- A **byte-proportionality benchmark** (output bytes ∝ changed cells) — the deterministic
  half of the performance gate (AR-3).
- The **acceptance gate**: `docs/acceptance-gate.md` (criteria→evidence map) plus a
  runnable `npm run gate` aggregator (AR-4, AR-9, AR-13).

Cross-platform CI cells, macOS/Windows acceptance, the Tier-4 manual matrix, real-PTY
resize, and wall-clock perf budgets are **deferred** (DEF-1…DEF-4, AR-14), consistent
with the project's existing deferred-to-remote / deferred-to-platform conventions.

## Document Index

| #   | Document                                            | Description                                          |
| --- | --------------------------------------------------- | ---------------------------------------------------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md)      | Zero-Ambiguity Gate decisions (audit trail)          |
| 00  | [Index](00-index.md)                                | This document — overview and navigation              |
| 01  | [Requirements](01-requirements.md)                  | Feature requirements and scope                       |
| 02  | [Current State](02-current-state.md)                | Existing tests, tiers, and gaps                       |
| 03-01 | [Input Corpus](03-01-input-corpus.md)             | Tier-1 hex-in-JSON corpus + data-driven runner       |
| 03-02 | [Golden Screen](03-02-golden-screen.md)           | Tier-2 `@xterm/headless` grid assertions             |
| 03-03 | [PTY-Style Integration](03-03-pty-integration.md) | Tier-3 no-node-pty child-process e2e                 |
| 03-04 | [Fuzz & Performance](03-04-fuzz-and-perf.md)      | Seeded decoder fuzz + byte-proportionality bench     |
| 03-05 | [Acceptance Gate](03-05-acceptance-gate.md)       | `docs/acceptance-gate.md` + `npm run gate` runner    |
| 07  | [Testing Strategy](07-testing-strategy.md)          | Specification test cases (ST-*) and verification     |
| 99  | [Execution Plan](99-execution-plan.md)              | Phases, sessions, and task checklist                 |

## Quick Reference

### Usage Examples

```bash
# Inner loop (now includes corpus, golden, fuzz, bytes∝damage):
npm run verify

# The full go/no-go gate (verify + e2e files + probe --auto, reports each criterion):
npm run gate
```

### Key Decisions

| Decision                         | Outcome                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| Tier-3 tooling                   | Expand no-node-pty child-process harness; node-pty rejected (AR-2, AR-12) |
| Perf in RD-09                    | Bytes ∝ damage now; wall-clock timing → RD-10 (AR-3, DEF-4)              |
| Gate artifact                    | `docs/acceptance-gate.md` + `npm run gate` (AR-4)                        |
| Corpus format                    | Hex-in-JSON under `test/fixtures/input-corpus/` (AR-6)                   |
| Golden profiles                  | All four depths (AR-7)                                                   |
| New dev dep                      | `@xterm/headless` only (AR-12)                                          |
| Existing 407 Tier-1 tests        | Kept as-is, mapped to criteria — not rewritten (AR-8)                    |

## Related Files

**New (created by this plan):**
- `test/fixtures/input-corpus/*.json`, `test/input-corpus.spec.test.ts`, `test/input-corpus.impl.test.ts`, `test/input-corpus-helpers.ts`
- `test/golden-screen.spec.test.ts`, `test/golden-screen.impl.test.ts`, `test/golden-screen-helpers.ts`
- `test/host-tier3.e2e.test.ts`
- `test/input-fuzz.spec.test.ts`, `test/input-fuzz.impl.test.ts`
- `test/render-bytes-damage.spec.test.ts`
- `scripts/gate.mjs`, `docs/acceptance-gate.md`
- `test/gate.spec.test.ts`

**Modified:**
- `package.json` (dev dep `@xterm/headless`; scripts `gate`)
- `README.md`, `CLAUDE.md`, `plans/00-roadmap.md`
