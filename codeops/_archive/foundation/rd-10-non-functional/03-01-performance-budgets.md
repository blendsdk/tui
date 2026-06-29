# Performance & Budgets: RD-10

> **Document**: 03-01-performance-budgets.md
> **Parent**: [Index](00-index.md) · ST-1…ST-4

## Overview

A deterministic-where-possible performance layer: a `npm run bench` reporter, a
**16 ms** frame-budget ceiling test (skippable under CI), a steady-state
size-independence assertion (extends RD-09 byte-proportionality), and a
detection-budget test. Resolves RD-09 **DEF-4** (AR-2, AR-3, AR-12).

## Implementation Details

### Bench reporter — `bench/frame-bench.mjs` (`npm run bench`)

Pure-Node ESM (run via `tsx` so it can import the `.ts` engine), mirroring the
`scripts/*.mjs` style. Measures, over N warmed iterations, the median/p95 of:

| Case | What it measures |
|------|------------------|
| compose+diff 200×50 | build a full frame (`ScreenBuffer` + `box`/`text`) then `serialize(next, null, opts)` |
| single-cell diff 200×50 | `serialize(one, base, opts)` after a one-cell change |
| serialize-only 200×50 | `serialize(filled, null, opts)` |

It **prints** a table (`median … p95 …`) and exits 0 — informational only, never a
gate (AR-9). Reference machine (a modern dev laptop) is noted in the output header;
numbers are indicative, not contractual.

The module **exports** the pure measurement helpers (`measureComposeDiff`,
`median`, `p95`) with **no top-level side effects**, and runs the printing CLI
only when invoked directly (a main-guard) — so the spec/impl tests can import the
helpers without triggering a bench run or `process.exit` (PF-005).

```js
// shape (pure-Node ESM; budgets are asserted by the spec, not here)
export function median(xs) { /* sort; pick middle */ }
export function measureComposeDiff(w, h, iters) { /* warm up; collect performance.now() deltas; return median */ }
function runBench() { /* print median/p95 table; exit 0 — informational (AR-9) */ }

// CLI only when run as `tsx bench/frame-bench.mjs`, never on import:
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) runBench();
```

### Frame-budget ceiling — `test/perf-budget.spec.test.ts` (ST-1)

```ts
const BUDGET_MS = 16;          // RD-10 AR-25 / AC-1, 200×50 compose+diff
const ITER = 200;
// median over warmed iterations (never a single sample)
const median = measureComposeDiff(200, 50, ITER); // imported from bench/frame-bench.mjs (PF-005)
// Escape hatches: CI (jitter) and TUI_SKIP_PERF (slow/throttled local hardware, PF-006).
if (process.env.CI || process.env.TUI_SKIP_PERF) {
  console.log(`perf (informational): median ${median.toFixed(3)}ms`);
} else {
  assert.ok(median <= BUDGET_MS, `200x50 compose+diff median ${median}ms exceeds ${BUDGET_MS}ms`);
}
```

The hard assert is skipped when `process.env.CI` (GitHub Actions) **or**
`process.env.TUI_SKIP_PERF` is set. Off-CI on capable hardware it is a real
assertion; under CI, or for a contributor on a slow/throttled/VM machine who sets
`TUI_SKIP_PERF=1`, it logs the number instead (the informational `npm run bench`
CI step covers regression tracking). The README perf note documents the opt-out.

### Size-independence — extends `test/render-bytes-damage.spec.test.ts` (RD10-ST-2)

A steady-state single-cell update must emit a byte count **independent of screen
area**. `serialize` addresses the changed cell by coordinate and never reads buffer
dimensions for the changed run (`serialize.ts:95` — `cursorTo(y+1, runStart+1)`), so
changing **the same in-bounds coordinate** in an 8×8 buffer and a 200×50 buffer
produces **byte-identical** output. The oracle is therefore exact equality — no
"small constant factor" magic number to register (PF-003):

```ts
// RD10-ST-2 — namespaced to avoid colliding with the RD-09 ST-20/ST-21 in this file (PF-004).
function singleCellDiffBytes(w: number, h: number): number {
  const base = new ScreenBuffer(w, h, { fg: 'default', bg: 'default', char: 'a' });
  const next = new ScreenBuffer(w, h, { fg: 'default', bg: 'default', char: 'a' });
  next.set(3, 3, 'Z', STYLE); // (3,3) is valid in both 8×8 and 200×50
  return serialize(next, base, OPTS).length;
}
assert.equal(
  singleCellDiffBytes(8, 8),
  singleCellDiffBytes(200, 50),
  'single-cell update bytes are identical regardless of screen area',
);
```

This is deterministic (byte counts), so it always asserts (no skip). If a future
addressing change ever makes exact equality brittle, weaken `equal` to a `≤ small + 8`
relation — but exact equality is the stronger, constant-free oracle.

### Detection budget — `test/capability-budget.spec.test.ts` (ST-3)

A genuinely **non-responding** `TerminalQuery` stub — one whose `read()` **blocks
forever** (yields nothing and never returns) — is passed to
`resolveCapabilitiesAsync({ query, timeoutMs })`. This forces the timeout branch of
`collectBytes` to win the race (`query.ts:110-121`): the resolver returns the empty
byte buffer → fallback detection → a valid frozen profile, after ≈`timeoutMs`.

> **Why "blocks forever", not "yields nothing" (PF-001):** an `async function*` that
> yields nothing *returns immediately*, so the read loop settles in ~0 ms and the
> `setTimeout(timeoutMs)` branch is never exercised — the test would pass without ever
> testing the budget, and a removed/broken timeout would slip through. A blocking
> iterator is the only stub that proves the ≤`timeoutMs` bound (RD-10 AC-3).

Because a blocking stub makes elapsed ≈ `timeoutMs`, off-CI asserts **both** bounds —
a **lower** bound (it actually waited on the budget, catching a regression back to an
instant-return stub) and an **upper** bound (it is bounded by `timeoutMs` + slack).
Under CI only completion + fallback are asserted.

```ts
// Non-responding: read() blocks on the first next(), forever.
const neverResponds: TerminalQuery = {
  write() {},
  read: () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<Uint8Array>>(() => {}) }) }),
};
const timeoutMs = 80;
const t0 = performance.now();
const { profile } = await resolveCapabilitiesAsync({ query: neverResponds, timeoutMs, env: {}, platform: 'linux' });
const elapsed = performance.now() - t0;

assert.ok(profile, 'detection completed via fallback, did not hang'); // always
if (!process.env.CI) {
  assert.ok(elapsed >= timeoutMs * 0.5, 'must wait on the budget, not short-circuit'); // catches instant-stub regression
  assert.ok(elapsed <= timeoutMs + 60, 'detection is bounded by timeoutMs + slack');    // the budget itself
}
```

No handle leaks: the resolver clears its own timer (`query.ts:117`) and the blocked
`next()` promise registers no timer/socket, so the test process still exits cleanly.

### Integration Points
- Consumes `ScreenBuffer`/`serialize` (bench, ceiling), `resolveCapabilitiesAsync` (budget) via `../src/engine/index.js`.
- The ceiling, size-independence, and detection-budget specs **join the unit glob** (run under `verify`); `bench` is a separate informational command + CI step.

## Error Handling

| Error case | Strategy | AR |
|------------|----------|----|
| Perf median exceeds 16 ms off-CI | Spec fails — investigate a real regression | AR-3 |
| CI timing jitter | Hard assert skipped under `CI`; bench prints numbers | AR-2, AR-9 |
| Detection stub hangs | Test times out → a real bounded-fallback regression in RD-02 | AR-12 |

> **Traceability:** decisions reference `00-ambiguity-register.md`.

## Testing Requirements
- `perf-budget.spec.test.ts`: ST-1 (ceiling, skippable), ST-3 (detection budget).
- `perf-budget.impl.test.ts`: the bench helper's median/p95 math is correct (deterministic input → known median).
- `render-bytes-damage.spec.test.ts`: RD10-ST-2 size-independence case added (exact byte equality; PF-003/PF-004).
- `perf-budget.impl.test.ts` imports the side-effect-free `measureComposeDiff`/`median` from `bench/frame-bench.mjs` (main-guarded; PF-005).
