/**
 * Decoder-fuzz implementation tests (RD-09 FR-6, plan doc 03-04).
 *
 * Internals behind the fuzz spec: PRNG determinism (ST-19 — same seed yields the
 * same stream, the property the whole harness relies on) and a specific pinned
 * adversarial case (an unterminated bracketed paste flooded past the cap) asserted
 * directly, so a regression in paste-bound enforcement is caught in isolation.
 *
 * The `.js` extension in the import specifier is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
import { test, expect } from 'vitest';
import { createDecoderState, decode, flush } from '../src/engine/index.js';
import { FUZZ_PASTE_CAP, mulberry32, randomBytes, stateSize } from './input-fuzz-helpers.js';

test('ST-19: mulberry32 is deterministic — same seed yields the same stream', () => {
  const a = mulberry32(1337);
  const b = mulberry32(1337);
  const seqA = Array.from({ length: 16 }, () => a());
  const seqB = Array.from({ length: 16 }, () => b());
  expect(seqA).toStrictEqual(seqB);

  // A different seed must diverge (otherwise the seed set adds no coverage).
  const c = mulberry32(42);
  expect(seqA).not.toStrictEqual(Array.from({ length: 16 }, () => c()));
});

test('randomBytes(seed) is reproducible and in range 0x00–0xff', () => {
  const bytes = randomBytes(mulberry32(525600), 32);
  expect(Array.from(bytes)).toStrictEqual(Array.from(randomBytes(mulberry32(525600), 32)));
  for (const b of bytes) expect(b >= 0 && b <= 255).toBeTruthy();
});

test('pinned case: an unterminated paste flood stays bounded at the cap (no DoS)', () => {
  const opts = { pasteCap: FUZZ_PASTE_CAP };
  // ESC [ 200 ~  then a flood with no end marker → paste accumulates, capped.
  const start = Uint8Array.from([0x1b, 0x5b, 0x32, 0x30, 0x30, 0x7e]);
  let state = decode(start, createDecoderState(), opts).state;
  expect(state.paste.active).toBe(true);

  // Feed far more than the cap, in chunks, with no end marker.
  for (let i = 0; i < 20; i += 1) {
    state = decode(new Uint8Array(1000).fill(0x41), state, opts).state;
    expect(stateSize(state) <= FUZZ_PASTE_CAP + 1024).toBeTruthy();
  }
  expect(state.paste.bytes.length <= FUZZ_PASTE_CAP).toBeTruthy();
  expect(() => flush(state, opts)).not.toThrow();
});
