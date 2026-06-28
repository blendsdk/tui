/**
 * Implementation tests — SGR mouse internals (RD-06, Session 3.3).
 *
 * Edge coverage of `mouse.ts`: middle/right buttons, wheel left/right, and the
 * column 223/224 boundary (the legacy 1-byte coordinate limit SGR removes).
 * Complements the ST-3/ST-4/ST-11 spec oracles.
 */
import { test, expect } from 'vitest';

import { createDecoderState, decode } from '../src/engine/input/decoder.js';
import type { MouseEvent, WheelEvent } from '../src/engine/input/events.js';

const enc = new TextEncoder();

function one(bytes: string): MouseEvent | WheelEvent {
  const r = decode(enc.encode(bytes), createDecoderState());
  expect(r.events.length).toBe(1);
  return r.events[0] as MouseEvent | WheelEvent;
}

test('mouse: middle and right buttons (b=1, b=2)', () => {
  const middle = one('\x1b[<1;5;5M') as MouseEvent;
  expect(middle.kind).toBe('down');
  expect(middle.button).toBe(1);

  const right = one('\x1b[<2;5;5M') as MouseEvent;
  expect(right.kind).toBe('down');
  expect(right.button).toBe(2);
});

test('mouse: wheel left/right (b=66, b=67)', () => {
  expect((one('\x1b[<66;5;5M') as WheelEvent).dir).toBe('left');
  expect((one('\x1b[<67;5;5M') as WheelEvent).dir).toBe('right');
});

test('mouse: column 223/224 boundary is reported verbatim (1-based)', () => {
  expect((one('\x1b[<0;223;1M') as MouseEvent).x).toBe(223);
  expect((one('\x1b[<0;224;1M') as MouseEvent).x).toBe(224);
});

test('mouse: a report split across chunks is carried then completed', () => {
  const s0 = createDecoderState();
  const r1 = decode(enc.encode('\x1b[<0;240'), s0);
  expect(r1.events.length).toBe(0);
  expect(r1.rest.length > 0).toBeTruthy();

  const r2 = decode(enc.encode(';5M'), r1.state);
  expect(r2.events.length).toBe(1);
  const e = r2.events[0] as MouseEvent;
  expect(e.x).toBe(240);
  expect(e.y).toBe(5);
});
