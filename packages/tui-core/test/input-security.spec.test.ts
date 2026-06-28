/**
 * Specification tests — input security & robustness (RD-06, AC-7/AC-8).
 *
 * Immutable oracle: expectations derive from RD-06's acceptance criteria AC-7
 * (bounded memory: paste cap + carry bound) and AC-8 (fuzz-safe: never throws,
 * bounded, no query reply leaks to events, no raw-input logging), per plan doc
 * 03-04 / 07-testing-strategy ST-7/ST-8/ST-9 — never from reading the
 * implementation.
 */
import { test, expect } from 'vitest';

import { createDecoderState, decode, flush } from '../src/engine/input/decoder.js';
import type { DecoderState, PasteEvent } from '../src/engine/input/events.js';
import { RESPONSE_BUFFER_CAP } from '../src/engine/capability/query.js';

const enc = new TextEncoder();
const INPUT_EVENT_TYPES = new Set(['key', 'mouse', 'wheel', 'paste', 'focus']);

// ---------------------------------------------------------------------------
// ST-7 — paste size cap & truncation (AC-7)
// ---------------------------------------------------------------------------

test('ST-7: a paste over the cap is truncated to the cap, truncated:true', () => {
  const content = 'X'.repeat(100);
  const r = decode(enc.encode(`\x1b[200~${content}\x1b[201~`), createDecoderState(), { pasteCap: 8 });

  expect(r.events.length).toBe(1);
  const paste = r.events[0] as PasteEvent;
  expect(paste.type).toBe('paste');
  expect(paste.text.length).toBe(8);
  expect(paste.truncated).toBe(true);
  // Memory did not retain the 100 bytes: the in-progress paste reset on close.
  expect(r.state.paste.bytes.length).toBe(0);
});

// ---------------------------------------------------------------------------
// ST-8 — carry buffer bound under an unterminated CSI flood (AC-7)
// ---------------------------------------------------------------------------

test('ST-8: an unterminated CSI flood stays within the carry bound, no throw, no events', () => {
  const flood = '1;'.repeat(2000); // 4000 param bytes, never a final
  let state: DecoderState = decode(enc.encode('\x1b['), createDecoderState()).state;

  // Feed the flood in chunks; rest must never exceed the bound and no event fires.
  for (let off = 0; off < flood.length; off += 300) {
    const chunk = flood.slice(off, off + 300);
    const r = decode(enc.encode(chunk), state);
    expect(r.events.length).toBe(0);
    expect(r.rest.length <= RESPONSE_BUFFER_CAP).toBeTruthy();
    state = r.state;
  }
});

// ---------------------------------------------------------------------------
// ST-9 — fuzz: never throws, stays bounded, no query leak, no raw logging (AC-8)
// ---------------------------------------------------------------------------

test('ST-9: a seeded adversarial corpus is decoded safely (no throw/leak/log)', () => {
  const rng = mulberry32(0x1234_5678);
  const pasteCap = 64;

  // Capture all console output during decoding to assert zero raw-input logging.
  const consoleCalls = captureConsole();
  try {
    for (let iter = 0; iter < 200; iter += 1) {
      const bytes = randomBytes(rng, 1 + Math.floor(rng() * 64));
      let state: DecoderState = createDecoderState();

      // Feed the stream in random chunk splits, threading state.
      let off = 0;
      while (off < bytes.length) {
        const size = 1 + Math.floor(rng() * 8);
        const chunk = bytes.subarray(off, off + size);
        off += size;

        const r = decode(chunk, state, { pasteCap });
        assertSafe(r.events, r.rest, r.state, pasteCap);
        state = r.state;
      }
      // A trailing flush (lone-ESC timer) must also be safe.
      const f = flush(state, { pasteCap });
      assertSafe(f.events, f.rest, f.state, pasteCap);
    }
  } finally {
    consoleCalls.restore();
  }

  expect(consoleCalls.count()).toBe(0);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert one decode result is bounded, leak-free, and well-typed. */
function assertSafe(
  events: readonly { type: string }[],
  rest: Uint8Array,
  state: DecoderState,
  pasteCap: number,
): void {
  expect(rest.length <= RESPONSE_BUFFER_CAP).toBeTruthy();
  expect(state.paste.bytes.length <= pasteCap).toBeTruthy();
  for (const event of events) {
    expect(INPUT_EVENT_TYPES.has(event.type)).toBeTruthy();
  }
}

/** A deterministic 32-bit PRNG (mulberry32) — no Math.random, so the corpus is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a byte stream that biases toward escape-sequence introducers (adversarial). */
function randomBytes(rng: () => number, length: number): Uint8Array {
  const seeds = [0x1b, 0x5b, 0x4f, 0x3c, 0x32, 0x30, 0x31, 0x7e, 0x3b, 0x4d, 0x6d, 0x63];
  const out = new Uint8Array(length);
  for (let k = 0; k < length; k += 1) {
    out[k] = rng() < 0.5 ? seeds[Math.floor(rng() * seeds.length)] : Math.floor(rng() * 256);
  }
  return out;
}

/** Replace every console method with a counter; `restore()` puts them back. */
function captureConsole(): { count(): number; restore(): void } {
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;
  const originals = methods.map((m) => console[m]);
  let calls = 0;
  for (const m of methods) {
    console[m] = (() => {
      calls += 1;
    }) as typeof console.log;
  }
  return {
    count: () => calls,
    restore: () => methods.forEach((m, idx) => (console[m] = originals[idx])),
  };
}
