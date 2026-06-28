/**
 * Shared decoder-fuzz helpers (RD-09 FR-6, plan doc 03-04).
 *
 * A small, deterministic, in-repo fuzzer for the RD-06 decoder: a seeded PRNG
 * (mulberry32) driven by a checked-in seed set, a byte-chunk generator that mixes
 * random bytes with adversarial fragments (partial CSI/OSC, ESC floods, an
 * unterminated paste flood, lone C0/C1), and the decoder-state size probe used to
 * assert bounded growth. Kept in a non-test module (mirroring `host-doubles.ts`)
 * so both the spec and impl tests reuse it without re-registering tests.
 *
 * The `.js` extension in the import specifier is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
import type { DecodeOptions, DecoderState } from '../src/engine/index.js';

/** The checked-in fixed seed set — reproducible, broad, and each seed pinnable on failure (AR-11). */
export const SEEDS: readonly number[] = [1, 42, 1337, 90210, 525600, 0xc0ffee, 0xdeadbeef];

/** Decode calls per seed. Enough to drive the carry/paste bounds without being slow. */
export const ITERATIONS = 200;

/**
 * Decoder carry cap (RESPONSE_BUFFER_CAP, `capability/query.ts:25`): a trailing
 * incomplete token longer than this is dropped, so `state.carry` never exceeds it.
 */
export const CARRY_CAP = 1024;

/** Paste-cap override used by the fuzz run so the paste bound is exercised quickly. */
export const FUZZ_PASTE_CAP = 4096;

/** The maximum total decoder-state size: bounded carry + bounded paste accumulation. */
export const STATE_BOUND = CARRY_CAP + FUZZ_PASTE_CAP;

/** Per-decode options for the fuzz run (small paste cap to exercise the bound). */
export const FUZZ_OPTS: DecodeOptions = { pasteCap: FUZZ_PASTE_CAP };

/**
 * mulberry32: a tiny deterministic PRNG. Same seed → same sequence (reproducible
 * fuzzing; `Math.random`/`Date` are banned for determinism).
 *
 * @param seed The 32-bit seed.
 * @returns A function yielding the next float in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate `len` random bytes (0x00–0xff) from the PRNG. */
export function randomBytes(rnd: () => number, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) out[i] = Math.floor(rnd() * 256);
  return out;
}

/** Adversarial fragments that probe bounded buffering (partial/unterminated sequences). */
const ADVERSARIAL: readonly number[][] = [
  [0x1b, 0x5b], // ESC [ — a CSI starter with no final byte
  [0x1b, 0x5d], // ESC ] — an OSC starter with no terminator
  new Array(64).fill(0x1b), // a long run of ESC
  [0x1b, 0x5b, 0x32, 0x30, 0x30, 0x7e, ...new Array(256).fill(0x41)], // paste start + flood, no end
  [0x00, 0x01, 0x07, 0x9b, 0x1b], // lone C0/C1 bytes + ESC
];

/**
 * Produce the next fuzz chunk: roughly half random bytes, half a structured
 * adversarial fragment. Deterministic in the PRNG so a failing seed replays.
 *
 * @param rnd The seeded PRNG.
 * @returns The next chunk of bytes to feed to `decode`.
 */
export function makeChunk(rnd: () => number): Uint8Array {
  if (rnd() < 0.5) {
    return randomBytes(rnd, 1 + Math.floor(rnd() * 64));
  }
  return Uint8Array.from(ADVERSARIAL[Math.floor(rnd() * ADVERSARIAL.length)]);
}

/** The decoder's accumulated state size: bounded carry + bounded in-progress paste. */
export function stateSize(state: DecoderState): number {
  return state.carry.length + state.paste.bytes.length;
}
