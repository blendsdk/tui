/**
 * Implementation tests for the frame-bench helpers (RD-10, plan doc 03-01).
 *
 * Covers the pure statistics (`median`/`p95`) on known inputs, the
 * non-mutation contract, the `measureComposeDiff` measurement shape, and the
 * `perfBudgetMode` CI/TUI_SKIP_PERF skip decision — all imported from the
 * main-guarded `bench/frame-bench.mjs` (no CLI/side effects on import, PF-005).
 *
 * The `.mjs` extension in the import specifier is required by NodeNext ESM
 * resolution (resolved by tsx at run time).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, p95, measureComposeDiff, perfBudgetMode } from '../bench/frame-bench.mjs';

test('median: odd-length input returns the middle value', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([5, 1, 3, 2, 4]), 3);
});

test('median: even-length input returns the mean of the two middle values', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5); // sorted [1,2,3,4] → (2+3)/2
  assert.equal(median([10, 20]), 15);
});

test('median: unsorted input is handled and the input is not mutated', () => {
  const input = [9, 1, 5, 3, 7];
  assert.equal(median(input), 5);
  assert.deepEqual(input, [9, 1, 5, 3, 7], 'median must not mutate its argument');
});

test('p95: nearest-rank picks the value at ceil(0.95·n)', () => {
  // n=20 → ceil(19) = 19th element (index 18) of [1..20] = 19.
  const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
  assert.equal(p95(twenty), 19);
  // n=100 → ceil(95) = 95th element of [1..100] = 95.
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(p95(hundred), 95);
});

test('p95: a single sample returns that sample (rank clamped to ≥1)', () => {
  assert.equal(p95([42]), 42);
});

test('measureComposeDiff: returns a positive, finite median over warmed runs', () => {
  const ms = measureComposeDiff(40, 12, 10);
  assert.ok(Number.isFinite(ms), 'median must be a finite number');
  assert.ok(ms > 0, 'composing + serializing a real frame takes nonzero time');
});

test('perfBudgetMode: asserts off-CI, logs under CI or TUI_SKIP_PERF', () => {
  assert.equal(perfBudgetMode({}), 'assert', 'a plain dev environment enforces the budget');
  assert.equal(perfBudgetMode({ CI: 'true' }), 'log', 'CI logs instead of asserting');
  assert.equal(perfBudgetMode({ TUI_SKIP_PERF: '1' }), 'log', 'the slow-machine opt-out logs');
  assert.equal(perfBudgetMode({ CI: '', TUI_SKIP_PERF: '' }), 'assert', 'empty flags do not trigger the skip');
});
