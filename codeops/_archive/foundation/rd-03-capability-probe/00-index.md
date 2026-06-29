# RD-03 Capability Probe & Survey Harness — Implementation Plan

> **Feature**: A diagnostic harness that attempts every capability the SDK cares about and reports what actually works on the running terminal, as both machine-readable JSON and a human-readable table, accumulating a cross-terminal evidence matrix.
> **Status**: Planning Complete
> **Created**: 2026-06-28
> **Implements**: RD-03
> **CodeOps Skills Version**: 2.0.0

## Overview

RD-03 is the project's **evidence engine**: an operator-driven spike that turns "we
think capability X is possible" into a recorded support matrix, per terminal and OS.
It reuses RD-02's detection core and adds two things detection alone cannot do —
**guided manual confirmation** for fire-and-forget features (notifications, some OSC)
where the terminal returns no response, and a **human + machine readable report**. In
probe mode the harness **probes everything and never stops** (contrast with the RD-08
runtime essentials gate, which refuses and degrades).

The harness lives under `examples/capability-probe/` and is **not** part of the
published package (the package `files` field ships only `dist`/README/LICENSE). It is
run with `npm run probe`. One genuinely reusable, shippable piece comes out of this
RD: a real tty-backed `TerminalQuery` (`src/engine/host/terminal-query.ts`) that
finally wires up the layer-2 query seam RD-02 left as a stub — making
`resolveCapabilitiesAsync` usable by real consumers, not only the probe.

This plan covers the **full** RD-03 taxonomy (AR-1), structured into five sequential
phases so each lands behind passing tests: foundation, auto-probes, manual probes,
live input/mouse readout, and report/matrix/`--auto`/e2e.

## Document Index

| #   | Document                                                        | Description                                          |
| --- | -------------------------------------------------------------- | ---------------------------------------------------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md)                | Zero-Ambiguity Gate decisions (audit trail)          |
| 00  | [Index](00-index.md)                                          | This document — overview and navigation              |
| 01  | [Requirements](01-requirements.md)                            | Feature requirements and scope                       |
| 02  | [Current State](02-current-state.md)                          | Analysis of the seams this builds on                 |
| 03-01 | [Engine: TerminalQuery](03-01-engine-terminal-query.md)     | Real tty-backed `TerminalQuery` (shippable)          |
| 03-02 | [Harness Foundation](03-02-harness-foundation.md)          | CLI args, orchestrator, lifecycle/restore, env-meta  |
| 03-03 | [Probes](03-03-probes.md)                                   | Auto-probes, manual probes, live input/mouse readout |
| 03-04 | [Report & Matrix](03-04-report-and-matrix.md)              | Report schema, recommendation, table, matrix append  |
| 07  | [Testing Strategy](07-testing-strategy.md)                    | Specification test cases and verification            |
| 99  | [Execution Plan](99-execution-plan.md)                        | Phases, sessions, and task checklist                 |

## Quick Reference

### Usage Examples

```bash
# Interactive survey (operator confirms manual probes); prints a table, appends the matrix.
npm run probe

# Non-interactive CI mode: auto-detectable facts only, manual items marked unverified.
npm run probe -- --auto > report.json

# Write a standalone JSON copy and skip the checked-in matrix.
npm run probe -- --out ./my-terminal.json --no-matrix
```

```ts
// The reusable side-effect: a real query seam for production async detection.
import { createTerminalQuery, resolveCapabilitiesAsync } from '@blendsdk/tui';

const query = createTerminalQuery({ input: process.stdin, output: process.stdout });
const { profile } = await resolveCapabilitiesAsync({ query });
```

### Key Decisions

| Decision | Outcome | AR |
| -------- | ------- | -- |
| Plan scope | Full RD-03, 5 phases | AR-1 |
| Location / run | `examples/capability-probe/`, `npm run probe`, dev-only | AR-2 |
| Query implementation | Reusable `src/engine/host/terminal-query.ts` | AR-3 |
| Testing | Layered: pure spec + fakes + PTY e2e + `--auto` e2e | AR-4 |
| Report output | Table → stdout; JSON via `--out`; `--auto` → stdout JSON | AR-5, AR-11 |
| Matrix | Append repo-root `terminal-matrix.json`, `--no-matrix` skips | AR-6 |
| CLI flags | `--auto`, `--out <path>`, `--no-matrix`, `--help` | AR-7 |
| Controls | y/n/s + Enter; `q` ends readout; Ctrl-C quits w/ restore | AR-8 |
| Auto sequencing | Dedicated upfront auto phase inside alt-screen | AR-9 |
| Recommendation | From `resolveCapabilities`, confirmations folded as overrides | AR-10 |
| Typecheck examples | `tsconfig.examples.json` + `verify` wiring | AR-12 |

## Related Files

**New (shippable):** `src/engine/host/terminal-query.ts` · re-export in `src/engine/host/index.ts` + `src/engine/index.ts`.
**New (harness, dev-only):** `examples/capability-probe/{main,args,taxonomy,env-meta,auto-probes,manual-probes,live-readout,report,matrix}.ts`.
**New (toolchain):** `tsconfig.examples.json` · `terminal-matrix.json` (repo root, accumulated).
**Modified:** `package.json` (scripts: `probe`, `typecheck:examples`, updated `verify`).
**New (tests):** see [07-testing-strategy.md](07-testing-strategy.md).
