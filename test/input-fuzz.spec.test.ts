/**
 * Decoder fuzz harness (RD-09 FR-6, plan doc 03-04; gate item 11).
 *
 * Specification oracle (ST-17, ST-18): feeding random/adversarial byte streams to
 * `decode`/`flush` must never throw, and the decoder's accumulated state must stay
 * bounded (no unbounded buffer = no DoS, AR-5/AR-11). Driven by a checked-in fixed
 * seed set via a small in-repo PRNG, so any failure replays from its seed. A
 * failing seed is the signal to fix the **decoder**, then pin the seed.
 *
 * The `.js` extension in the import specifier is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecoderState, decode, flush } from '../src/engine/index.js';
import { FUZZ_OPTS, ITERATIONS, SEEDS, STATE_BOUND, makeChunk, mulberry32, stateSize } from './input-fuzz-helpers.js';

for (const seed of SEEDS) {
  test(`fuzz: seed ${seed} — no throw and bounded decoder state`, () => {
    const rnd = mulberry32(seed);
    let state = createDecoderState();
    let maxSize = 0;
    for (let i = 0; i < ITERATIONS; i += 1) {
      const chunk = makeChunk(rnd);
      let result;
      try {
        result = decode(chunk, state, FUZZ_OPTS); // ST-17: must not throw
      } catch (err) {
        assert.fail(`seed ${seed}, iteration ${i}: decode threw: ${String(err)}`);
      }
      state = result.state;
      const size = stateSize(state);
      maxSize = Math.max(maxSize, size);
      assert.ok(size <= STATE_BOUND, `seed ${seed}, iteration ${i}: state ${size} exceeded bound ${STATE_BOUND}`); // ST-18
    }
    try {
      flush(state, FUZZ_OPTS); // ST-17: flush must not throw either
    } catch (err) {
      assert.fail(`seed ${seed}: flush threw: ${String(err)}`);
    }
    // The adversarial fragments should actually drive growth — guard against a no-op fuzz.
    assert.ok(maxSize > 0, `seed ${seed}: expected some carry/paste accumulation during the run`);
  });
}
