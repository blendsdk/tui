# @blendsdk/tui — Acceptance Gate (RD-09)

> **Project go/no-go gate.** If keyboard (3), mouse (4), or scroll (5) cannot work reliably on
> the mainstream terminal matrix, the project **HALTS** (per RD-09 AR-7).
>
> This document is the human-readable criteria→evidence map; `scripts/gate.mjs` (run via
> `npm run gate`) is the runnable aggregator that mirrors it. `test/gate.spec.test.ts` asserts the
> two never drift. Criterion numbering is canonical RD-09 (1–11).

## How to run

```bash
npm run gate
```

Runs the automatable tiers — `npm run verify` (corpus, golden, fuzz, bytes∝damage, all unit
specs + build), the Tier-3 and signal e2e files, and the probe in `--auto` — and prints a
PASS/FAIL/DEFERRED line per criterion, exiting non-zero if any non-deferred criterion fails.

> Side effect: the probe step appends to the checked-in `terminal-matrix.json` (RD-03 behavior).
> CI must not assert a clean working tree _after_ `gate` (or run the probe with `--no-matrix`).

## Criteria → evidence

| #   | Criterion                              | Status                 | Evidence                                                                                                                                                                                |
| --- | -------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Correct colours                        | PASS (auto)            | golden-screen.spec.test.ts                                                                                                                                                              |
| 2   | Flicker-free + correct partial updates | PASS (auto)            | golden-screen.spec.test.ts + render-bytes-damage.spec.test.ts                                                                                                                           |
| 3   | Keyboard                               | PASS (auto) + MANUAL   | input-corpus.spec.test.ts (keyboard.json) + probe live readout                                                                                                                          |
| 4   | Mouse (incl. beyond column 223)        | PASS (auto) + MANUAL   | input-corpus.spec.test.ts (mouse.json) + probe live readout                                                                                                                             |
| 5   | Scroll                                 | PASS (auto) + MANUAL   | input-corpus.spec.test.ts (wheel.json) + probe live readout                                                                                                                             |
| 6   | Resize                                 | DEFERRED (DEF-3)       | MANUAL confirmed via `npm run demo:resize` — ✓ Linux, ✓ macOS (over SSH), ☐ Windows (pending). Automated real-PTY delivery still deferred (DEF-3)                                       |
| 7   | Paste                                  | PASS (auto)            | input-corpus.spec.test.ts (paste.json) + safety-paste-cap.spec.test.ts                                                                                                                  |
| 8   | Clean teardown                         | PASS (auto)            | host-tier3.e2e.test.ts + host-signals.e2e.test.ts + safety-error-restore.e2e.test.ts                                                                                                    |
| 9   | Cross-platform                         | DEFERRED (DEF-1/DEF-2) | CI matrix green (no remote) + macOS/Windows acceptance (no platforms)                                                                                                                   |
| 10  | Security                               | PASS (auto)            | safety-sanitize.spec.test.ts + safety-redact.spec.test.ts + safety-essentials.spec.test.ts + safety-paste-cap.spec.test.ts + capability-security.spec.test.ts + input-fuzz.spec.test.ts |
| 11  | Boundary/negative                      | PASS (auto)            | probe-nontty.spec.test.ts + input-fuzz.spec.test.ts                                                                                                                                     |

## Deferred criteria (local-no-remote boundary)

These are recorded DEFERRED and do **not** fail the gate locally (RD-09 AR-14); they are completed
once a git remote + macOS/Windows runners exist.

| DEF   | Scope                                                                                       | Blocks criterion                                       |
| ----- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| DEF-1 | 3-OS CI cells green (no remote yet)                                                         | 9 Cross-platform                                       |
| DEF-2 | macOS/Windows acceptance + Tier-4 manual matrix (no platforms)                              | 9 Cross-platform                                       |
| DEF-3 | real-PTY SIGWINCH resize delivery (automated). Manual: ✓ Linux, ✓ macOS over SSH, ☐ Windows | 6 Resize                                               |
| DEF-4 | wall-clock frame-time budgets (owned by RD-10)                                              | — (perf; bytes∝damage covers the structural half of 2) |

## Accumulating evidence

The probe's `--auto` mode appends a row to `terminal-matrix.json` on each run (RD-03), building the
cross-terminal evidence base referenced by the manual half of criteria 3–6 (AR-15). No new code in
RD-09 — it is mapped here as existing evidence.
