/**
 * Specification tests — decoder core: chunk-boundary safety & ESC flush (RD-06).
 *
 * Immutable oracle: expectations derive from RD-06's acceptance criterion AC-2
 * (chunk-boundary safety) and plan decision PL-3 (pure decoder + host-driven
 * flush for ESC disambiguation), per 07-testing-strategy ST-2 and ST-10 — never
 * from reading the implementation.
 */
import { test, expect } from 'vitest';

import { createDecoderState, decode, flush } from '../src/engine/input/decoder.js';
import type { DecoderState, KeyEvent } from '../src/engine/input/events.js';

const enc = new TextEncoder();

/** Carry a decode result's `rest` forward into the next state. */
function carry(state: DecoderState, rest: Uint8Array): DecoderState {
  return { ...state, carry: rest };
}

// ---------------------------------------------------------------------------
// ST-2 — chunk-boundary safety (AC-2)
// ---------------------------------------------------------------------------

test('ST-2: a CSI split across two chunks decodes once, no partial events', () => {
  const s0 = createDecoderState();

  // First chunk ends mid-sequence: nothing emitted, the bytes are carried.
  const r1 = decode(enc.encode('\x1b[1'), s0);
  expect(r1.events.length).toBe(0);
  expect(r1.queries.length).toBe(0);
  expect(r1.rest.length > 0).toBeTruthy();

  // Second chunk completes it: exactly one event, nothing left over.
  const r2 = decode(enc.encode(';5C'), carry(s0, r1.rest));
  expect(r2.events.length).toBe(1);
  const k = r2.events[0] as KeyEvent;
  expect(k.type).toBe('key');
  expect(k.key).toBe('right');
  expect(k.ctrl).toBe(true);
  expect(r2.rest.length).toBe(0);
});

// ---------------------------------------------------------------------------
// ST-10 — ESC disambiguation via flush (PL-3)
// ---------------------------------------------------------------------------

test('ST-10: a lone ESC is carried, then flush() emits escape', () => {
  const s0 = createDecoderState();

  const r1 = decode(Uint8Array.from([0x1b]), s0);
  expect(r1.events.length).toBe(0);
  expect(r1.rest.length).toBe(1);

  const flushed = flush(carry(s0, r1.rest));
  expect(flushed.events.length).toBe(1);
  const k = flushed.events[0] as KeyEvent;
  expect(k.type).toBe('key');
  expect(k.key).toBe('escape');
  expect(flushed.rest.length).toBe(0);
});

test('ST-10: a byte arriving after ESC continues the sequence, not escape', () => {
  const s0 = createDecoderState();

  const r1 = decode(Uint8Array.from([0x1b]), s0);
  expect(r1.events.length).toBe(0);

  // The next byte completes a CSI introducer rather than producing Escape.
  const r2 = decode(enc.encode('[A'), carry(s0, r1.rest));
  expect(r2.events.length).toBe(1);
  const k = r2.events[0] as KeyEvent;
  expect(k.key).toBe('up');
});
