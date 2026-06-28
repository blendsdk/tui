/**
 * Frame performance benchmark (RD-10 FR-1/FR-13, plan doc 03-01).
 *
 * Measures, over N warmed iterations, the median/p95 wall-clock time of the
 * rendering hot paths on a 200×50 frame:
 *   - compose+diff : build a full frame (ScreenBuffer + box/text) then serialize
 *                    it against `null` (a full first paint)
 *   - single-cell  : serialize a one-cell change against a prior frame (the
 *                    steady-state damage-diff path)
 *   - serialize    : serialize a fully-built frame against `null` (paint only)
 *
 * It is INFORMATIONAL ONLY — it prints a table and exits 0, never a gate (AR-9).
 * The hard 16 ms budget lives in `test/perf-budget.spec.test.ts` (skippable under
 * CI). Reported numbers are indicative of a modern dev machine, not contractual.
 *
 * The pure measurement helpers (`median`, `p95`, `measureComposeDiff`) are
 * EXPORTED with no top-level side effects, so the spec/impl tests can import them
 * without triggering a bench run or `process.exit`. The printing CLI runs only
 * when this file is executed directly, behind an `import.meta.url` main-guard
 * (PF-005).
 *
 * Pure-Node ESM, run via `tsx` (so the `.ts` engine can be imported through the
 * built `../src/engine/index.js` specifier, resolved to source at run time).
 */
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { ScreenBuffer, serialize, resolveCapabilities } from '../src/engine/index.js';

/** Truecolor render options — the widest encoder path, a worst-case for bytes. */
const OPTS = {
  caps: resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile,
};
/** A non-default styled border/text so the encoder actually emits SGR per run. */
const BORDER_STYLE = { fg: 'cyan', bg: 'blue' };
const TEXT_STYLE = { fg: 'white', bg: 'blue' };
const CHANGE_STYLE = { fg: 'red', bg: 'blue' };

/** A long filler line, sliced per row — precomputed so we time render, not string ops. */
const BASE_LINE = 'The quick brown fox jumps over the lazy dog. 0123456789 '.repeat(8);

/** Warm-up iterations discarded before timing (let the JIT settle). */
const WARMUP = 20;

/**
 * Build a representative full frame: a titled box border with filler text on
 * every interior row, exercising `box`/`text`/`set` across the whole buffer.
 *
 * @param {number} w Frame width in columns.
 * @param {number} h Frame height in rows.
 * @returns {ScreenBuffer} The composed buffer.
 */
function composeFrame(w, h) {
  const buf = new ScreenBuffer(w, h, { fg: 'default', bg: 'default' });
  buf.box(0, 0, w, h, BORDER_STYLE, 'single', 'frame-bench');
  const inner = Math.max(0, w - 4);
  for (let y = 1; y < h - 1; y += 1) {
    buf.text(2, y, BASE_LINE.slice(0, inner), TEXT_STYLE);
  }
  return buf;
}

/** A sink to keep the measured work observable so it can't be optimized away. */
let sink = 0;

/**
 * Sort a copy of the samples ascending (numeric). Helpers never mutate input.
 *
 * @param {readonly number[]} xs Samples.
 * @returns {number[]} A new ascending-sorted array.
 */
function sortedCopy(xs) {
  return [...xs].sort((a, b) => a - b);
}

/**
 * The median of a sample set: the middle value (odd length) or the mean of the
 * two middle values (even length).
 *
 * @param {readonly number[]} xs Non-empty samples.
 * @returns {number} The median.
 */
export function median(xs) {
  const sorted = sortedCopy(xs);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * The 95th percentile by nearest-rank: the value at rank `ceil(0.95·n)`,
 * clamped to the last element.
 *
 * @param {readonly number[]} xs Non-empty samples.
 * @returns {number} The p95 value.
 */
export function p95(xs) {
  const sorted = sortedCopy(xs);
  const rank = Math.ceil(0.95 * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/**
 * Time a thunk over `iters` warmed iterations, returning the raw per-iteration
 * millisecond samples. The thunk's result is folded into `sink` so the work is
 * never dead-code-eliminated.
 *
 * @param {() => string} thunk The work to time (returns the serialized frame).
 * @param {number} iters Timed iterations (warm-up runs are additional).
 * @returns {number[]} Per-iteration durations in milliseconds.
 */
function sample(thunk, iters) {
  for (let i = 0; i < WARMUP; i += 1) sink += thunk().length;
  const samples = new Array(iters);
  for (let i = 0; i < iters; i += 1) {
    const t0 = performance.now();
    sink += thunk().length;
    samples[i] = performance.now() - t0;
  }
  return samples;
}

/**
 * Median wall-clock time of composing AND diff-serializing a `w`×`h` frame, over
 * `iters` warmed iterations (never a single sample). This is the ST-1 hot path
 * the frame-budget ceiling asserts against.
 *
 * @param {number} w Frame width in columns.
 * @param {number} h Frame height in rows.
 * @param {number} iters Timed iterations.
 * @returns {number} The median compose+diff time in milliseconds.
 */
export function measureComposeDiff(w, h, iters) {
  return median(sample(() => serialize(composeFrame(w, h), null, OPTS), iters));
}

/**
 * Whether the frame-budget ceiling test should hard-assert the budget or only log
 * the number. Wall-clock timing is environment-sensitive, so the assertion is
 * suppressed under CI (runner jitter) and via `TUI_SKIP_PERF` (a contributor's
 * slow/throttled/VM machine) — those paths log instead (AR-2/AR-9, PF-006).
 *
 * @param {Record<string, string | undefined>} env Environment (e.g. `process.env`).
 * @returns {'assert' | 'log'} `'assert'` to enforce the budget, `'log'` to record only.
 */
export function perfBudgetMode(env) {
  return env.CI || env.TUI_SKIP_PERF ? 'log' : 'assert';
}

/** Format a `median … p95 …` cell to fixed precision. */
function fmt(samples) {
  return `median ${median(samples).toFixed(3)}ms   p95 ${p95(samples).toFixed(3)}ms`;
}

/**
 * Run the three benchmark cases on a 200×50 frame and print an informational
 * table, then exit 0. Never asserts a budget (AR-9).
 */
function runBench() {
  const W = 200;
  const H = 50;
  const ITER = 200;

  const composeDiff = sample(() => serialize(composeFrame(W, H), null, OPTS), ITER);

  const base = composeFrame(W, H);
  const next = composeFrame(W, H);
  next.set(3, 3, 'Z', CHANGE_STYLE); // one changed cell
  const singleCell = sample(() => serialize(next, base, OPTS), ITER);

  const filled = composeFrame(W, H);
  const serializeOnly = sample(() => serialize(filled, null, OPTS), ITER);

  process.stdout.write(
    `frame-bench — ${W}×${H}, ${ITER} warmed iterations (informational; reference: a modern dev laptop)\n`,
  );
  process.stdout.write(`  compose+diff   ${fmt(composeDiff)}\n`);
  process.stdout.write(`  single-cell    ${fmt(singleCell)}\n`);
  process.stdout.write(`  serialize-only ${fmt(serializeOnly)}\n`);
  // Reference the sink so the optimizer must keep the measured work.
  if (sink < 0) process.stdout.write('');
  process.exit(0);
}

// CLI only when run directly as `tsx bench/frame-bench.mjs`, never on import (PF-005).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBench();
}
