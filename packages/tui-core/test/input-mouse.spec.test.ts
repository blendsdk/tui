/**
 * Specification tests — SGR mouse & wheel decoding (RD-06, AC-3/AC-4).
 *
 * Immutable oracle: expectations derive from RD-06's acceptance criteria AC-3
 * (extended coordinates), AC-4 (wheel), the Must-Have mouse completeness
 * (press/release/drag/motion), and plan doc 03-03 / 07-testing-strategy
 * ST-3/ST-4/ST-11 — never from reading the implementation.
 */
import { test, expect } from 'vitest';

import { createDecoderState, decode } from '../src/engine/input/decoder.js';
import type { MouseEvent, WheelEvent } from '../src/engine/input/events.js';

const enc = new TextEncoder();

/** Decode `bytes` against a fresh state and return the single event. */
function one(bytes: string): MouseEvent | WheelEvent {
  const r = decode(enc.encode(bytes), createDecoderState());
  expect(r.events.length).toBe(1);
  return r.events[0] as MouseEvent | WheelEvent;
}

// ---------------------------------------------------------------------------
// ST-3 — extended coordinates beyond column 223 (AC-3)
// ---------------------------------------------------------------------------

test('ST-3: SGR press at (240,5) keeps 1-based coords (no 0-based conversion)', () => {
  const e = one('\x1b[<0;240;5M') as MouseEvent;
  expect(e.type).toBe('mouse');
  expect(e.kind).toBe('down');
  expect(e.button).toBe(0);
  expect(e.x).toBe(240);
  expect(e.y).toBe(5);
});

// ---------------------------------------------------------------------------
// ST-4 — wheel up/down (AC-4); a wheel report is never a MouseEvent
// ---------------------------------------------------------------------------

test('ST-4: SGR button 64 → wheel up, button 65 → wheel down', () => {
  const up = one('\x1b[<64;10;3M') as WheelEvent;
  expect(up.type).toBe('wheel');
  expect(up.dir).toBe('up');

  const down = one('\x1b[<65;10;3M') as WheelEvent;
  expect(down.type).toBe('wheel');
  expect(down.dir).toBe('down');
});

// ---------------------------------------------------------------------------
// ST-11 — release / drag / move (Must-Have mouse completeness)
// ---------------------------------------------------------------------------

test('ST-11: m-final is release (up)', () => {
  const e = one('\x1b[<0;5;5m') as MouseEvent;
  expect(e.kind).toBe('up');
});

test('ST-11: motion bit with a held button is drag', () => {
  const e = one('\x1b[<32;5;5M') as MouseEvent;
  expect(e.kind).toBe('drag');
  expect(e.button).toBe(0);
});

test('ST-11: motion bit with no held button is move', () => {
  const e = one('\x1b[<35;5;5M') as MouseEvent;
  expect(e.kind).toBe('move');
});
