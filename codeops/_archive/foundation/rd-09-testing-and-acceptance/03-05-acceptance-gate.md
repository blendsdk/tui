# Acceptance Gate: RD-09

> **Document**: 03-05-acceptance-gate.md
> **Parent**: [Index](00-index.md)

## Overview

The centrepiece of RD-09: the **project go/no-go gate** (FR-7). Two artifacts (AR-4):

1. **`docs/acceptance-gate.md`** (AR-9) — a checked-in living document mapping each of the
   11 RD-09 gate criteria → the test(s)/probe evidence that satisfy it, with an explicit
   status per criterion: **PASS** (automated locally), **MANUAL** (needs the probe on a
   real terminal), or **DEFERRED** (DEF-1…DEF-4).
2. **`scripts/gate.mjs`** (AR-13), run via **`npm run gate`** — a pure-Node ESM aggregator
   that runs the automatable tiers and prints PASS/FAIL/DEFERRED per criterion, exiting
   non-zero if any non-deferred criterion fails.

## Architecture

### Proposed Changes
- New `scripts/gate.mjs`, mirroring the style of `scripts/check-no-native-deps.mjs`
  (pure-Node ESM, no shell-isms, OS-portable, documented exit codes).
- New `package.json` script: `"gate": "node scripts/gate.mjs"`.
- New `docs/acceptance-gate.md` (and the `docs/` directory).

### What `npm run gate` runs
A sequence of child steps (via `node:child_process`), each mapped to criteria:

| Step | Command | Criteria covered (canonical RD-09 numbering) |
|------|---------|------------------|
| Verify | `npm run verify` (incl. corpus, golden, fuzz, bytes∝damage) | 1 colours, 2 flicker/partial, 3 keyboard, 4 mouse, 5 scroll, 7 paste, 10 security, 11 boundary |
| Tier-3 e2e | `npx tsx --test test/host-tier3.e2e.test.ts` | 8 (clean teardown) |
| Signal e2e | `npx tsx --test test/host-signals.e2e.test.ts` | 8 (SIGINT→130→restore) |
| Probe auto | `npm run probe -- --auto` | 11 (probe runs headless / non-TTY); records evidence |
| Report | print PASS/FAIL/DEFERRED table per criterion 1–11 | — |

> **Single numbering scheme (canonical RD-09 1–11)** is used by the doc table, this step map,
> and `scripts/gate.mjs` alike, so `gate.spec.test.ts` (ST-24) can assert no drift meaningfully.

Deferred criteria — **6 Resize** (DEF-3, real-PTY) and **9 Cross-platform** (DEF-1 CI cells
green / DEF-2 macOS+Windows acceptance + Tier-4 manual matrix) — are printed as **DEFERRED**
with their DEF-n reference and do **not** fail the gate locally (AR-14).

## Implementation Details

### `scripts/gate.mjs` shape

```js
#!/usr/bin/env node
/** RD-09 acceptance-gate aggregator (FR-7, AR-4/AR-13). Pure-Node ESM, OS-portable. */
import { spawnSync } from 'node:child_process';

// Canonical RD-09 criterion numbering (1–11) throughout — matches the doc table.
const STEPS = [
  { id: 'verify',   cmd: 'npm',  args: ['run', 'verify'],                              criteria: [1,2,3,4,5,7,10,11] },
  { id: 'tier3',    cmd: 'npx',  args: ['tsx', '--test', 'test/host-tier3.e2e.test.ts'], criteria: [8] },
  { id: 'signals',  cmd: 'npx',  args: ['tsx', '--test', 'test/host-signals.e2e.test.ts'], criteria: [8] },
  { id: 'probe',    cmd: 'npm',  args: ['run', 'probe', '--', '--auto'],               criteria: [11] },
];
// Deferred criteria never fail the gate locally (AR-14); printed DEFERRED with their DEF-n.
const DEFERRED = {
  6: 'DEF-3 real-PTY SIGWINCH resize (needs a real PTY)',
  9: 'DEF-1/DEF-2 cross-platform CI cells green + macOS/Windows acceptance (no remote/platforms)',
};
// run each step, collect pass/fail, then print a per-criterion table, exit 1 if any required criterion failed.
```

> The exact criteria→step mapping and the DEFERRED set are finalized against
> `docs/acceptance-gate.md` so the doc and the script never drift (a `gate.spec.test.ts`
> asserts they agree — see Testing Requirements).

### `docs/acceptance-gate.md` structure

```markdown
# @blendsdk/tui — Acceptance Gate (RD-09)

> Go/no-go: if criteria 3, 4, or 5 cannot be met on the mainstream matrix, the project HALTS.

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Correct colours | PASS (auto) | golden-screen.spec (4 depths) |
| 2 | Flicker-free + partial updates | PASS (auto) | golden-screen.spec + render-bytes-damage.spec |
| 3 | Keyboard | PASS (auto) + MANUAL | input-corpus keyboard.json + probe live readout |
| 4 | Mouse (incl. >col 223) | PASS (auto) + MANUAL | input-corpus mouse.json + probe |
| 5 | Scroll | PASS (auto) + MANUAL | input-corpus wheel.json + probe |
| 6 | Resize | DEFERRED (DEF-3) | needs real PTY / manual |
| 7 | Paste | PASS (auto) | input-corpus paste.json + safety-paste-cap.spec |
| 8 | Clean teardown | PASS (auto) | host-tier3.e2e + host-signals.e2e + safety-error-restore.e2e |
| 9 | Cross-platform | DEFERRED (DEF-1/DEF-2) | CI matrix (no remote) / macOS+Windows runners |
|10 | Security | PASS (auto) | sanitize/redact/essentials/paste-cap/responses specs + input-fuzz.spec |
|11 | Boundary/negative | PASS (auto) | probe-nontty + capability fallback + input-fuzz.spec |
```

(Criterion numbering above follows the RD-09 gate list; the doc's table is the
authoritative mapping, the script mirrors it.)

### Integration Points
- `gate.mjs` orchestrates existing npm scripts + e2e files; adds no engine code.
- `docs/acceptance-gate.md` references RD-03 `terminal-matrix.json` as accumulating manual evidence (AR-15).

## Error Handling

| Error Case                                   | Handling Strategy                                          | AR Ref |
| -------------------------------------------- | -------------------------------------------------------- | ------ |
| A required step fails                          | `gate.mjs` marks its criteria FAIL and exits non-zero     | AR-4   |
| A deferred criterion                           | Printed DEFERRED with DEF-n reference; never fails locally | AR-14  |
| Doc/script mapping drift                       | `gate.spec.test.ts` asserts the script's criteria set matches the doc's table | AR-4 |
| `npm run probe -- --auto` writes to matrix      | Allowed (RD-03 behavior); gate run does not assert matrix contents. **Side effect:** it mutates the tracked `terminal-matrix.json`, so CI must not assert a clean working tree *after* `gate` (or run the probe step with `--no-matrix` to keep the gate side-effect-free) | AR-15  |

> **Traceability:** decisions reference `00-ambiguity-register.md`.

## Testing Requirements
- `gate.spec.test.ts`: parse `docs/acceptance-gate.md`'s criteria table and assert (a) all 11 criteria present, (b) every non-DEFERRED criterion names at least one existing test file, (c) the script's criteria↔step map covers the same non-deferred criteria. (Pure file reads; joins the unit glob.)
- Manual smoke: `npm run gate` exits 0 locally with all required criteria PASS and deferred ones DEFERRED.
