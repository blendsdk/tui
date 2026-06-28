/**
 * Performance & detection budgets (RD-10 FR-1/FR-3, plan doc 03-01; ST-1, ST-3).
 *
 * Specification oracle — derived from RD-10's acceptance criteria, never from the
 * bench output:
 *  - ST-1: composing + diff-serializing a 200×50 frame has a median frame time
 *    ≤ 16 ms (RD-10 AR-25 / AC-1). Wall-clock timing is environment-sensitive, so
 *    the hard assertion runs only off-CI and is additionally opt-out-able on a
 *    slow/throttled local machine via `TUI_SKIP_PERF` (AR-2/AR-9, PF-006); under
 *    CI the number is logged informationally (the `npm run bench` step tracks
 *    regressions). The median is taken over warmed iterations, never one sample.
 *  - ST-3: capability detection against a non-responding query stub — one whose
 *    `read()` blocks forever — completes via fallback within `timeoutMs` + slack,
 *    proving the budget is the timeout winning, not a short-circuit (AR-12 / AC-3).
 *
 * The `.mjs`/`.js` extensions in the import specifiers are required by NodeNext
 * ESM resolution (resolved to source by tsx at run time). The bench helper is
 * imported from the main-guarded `bench/frame-bench.mjs`, which runs no CLI and
 * has no top-level side effects on import (PF-005).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCapabilitiesAsync } from '../src/engine/index.js';
import type { TerminalQuery } from '../src/engine/index.js';
import { measureComposeDiff, perfBudgetMode } from '../bench/frame-bench.mjs';

/** RD-10 AR-25 / AC-1: the 200×50 compose+diff frame budget. */
const BUDGET_MS = 16;
/** Median is taken over this many warmed iterations — never a single sample (AR-3). */
const ITER = 200;

// ST-1 — frame-budget ceiling. Asserts off-CI on capable hardware; logs under
// CI or when a contributor sets TUI_SKIP_PERF on slow/VM hardware (PF-006).
test('ST-1: 200x50 compose+diff median is within the 16ms frame budget', () => {
  const median = measureComposeDiff(200, 50, ITER);
  if (perfBudgetMode(process.env) === 'log') {
    console.log(`perf (informational): 200x50 compose+diff median ${median.toFixed(3)}ms`);
    return;
  }
  assert.ok(median <= BUDGET_MS, `200x50 compose+diff median ${median.toFixed(3)}ms exceeds ${BUDGET_MS}ms budget`);
});

// ST-3 — detection budget against a genuinely non-responding seam: read() blocks
// on the first next(), forever. A generator that merely yields nothing would
// return in ~0 ms and never exercise the timeout, so the budget would go untested
// and a removed timeout would slip through (PF-001).
test('ST-3: detection against a non-responding query falls back within the budget', async () => {
  const neverResponds: TerminalQuery = {
    write() {
      /* discarded */
    },
    read: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () =>
          new Promise<IteratorResult<Uint8Array>>(() => {
            /* never resolves — forces the timeoutMs branch to win the race */
          }),
      }),
    }),
  };

  const timeoutMs = 80;
  const t0 = performance.now();
  const { profile } = await resolveCapabilitiesAsync({ query: neverResponds, timeoutMs, env: {}, platform: 'linux' });
  const elapsed = performance.now() - t0;

  // Always: it completed via fallback rather than hanging.
  assert.ok(profile, 'detection completed via fallback, did not hang');

  // Off-CI, assert both bounds: a lower bound proves it actually waited on the
  // budget (catching a regression back to an instant-return stub) and an upper
  // bound proves it is bounded by timeoutMs + slack (the budget itself).
  if (!process.env.CI) {
    assert.ok(
      elapsed >= timeoutMs * 0.5,
      `must wait on the budget, not short-circuit (elapsed ${elapsed.toFixed(1)}ms)`,
    );
    assert.ok(elapsed <= timeoutMs + 60, `detection is bounded by timeoutMs + slack (elapsed ${elapsed.toFixed(1)}ms)`);
  }
});
