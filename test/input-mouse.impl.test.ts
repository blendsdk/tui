/**
 * Implementation tests — SGR mouse internals (RD-06, Session 3.3).
 *
 * Edge coverage of `mouse.ts`: middle/right buttons, wheel left/right, and the
 * column 223/224 boundary (the legacy 1-byte coordinate limit SGR removes).
 * Complements the ST-3/ST-4/ST-11 spec oracles.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDecoderState, decode } from '../src/engine/input/decoder.js';
import type { MouseEvent, WheelEvent } from '../src/engine/input/events.js';

const enc = new TextEncoder();

function one(bytes: string): MouseEvent | WheelEvent {
  const r = decode(enc.encode(bytes), createDecoderState());
  assert.equal(r.events.length, 1, 'expected exactly one event');
  return r.events[0] as MouseEvent | WheelEvent;
}

test('mouse: middle and right buttons (b=1, b=2)', () => {
  const middle = one('\x1b[<1;5;5M') as MouseEvent;
  assert.equal(middle.kind, 'down');
  assert.equal(middle.button, 1);

  const right = one('\x1b[<2;5;5M') as MouseEvent;
  assert.equal(right.kind, 'down');
  assert.equal(right.button, 2);
});

test('mouse: wheel left/right (b=66, b=67)', () => {
  assert.equal((one('\x1b[<66;5;5M') as WheelEvent).dir, 'left');
  assert.equal((one('\x1b[<67;5;5M') as WheelEvent).dir, 'right');
});

test('mouse: column 223/224 boundary is reported verbatim (1-based)', () => {
  assert.equal((one('\x1b[<0;223;1M') as MouseEvent).x, 223);
  assert.equal((one('\x1b[<0;224;1M') as MouseEvent).x, 224);
});

test('mouse: a report split across chunks is carried then completed', () => {
  const s0 = createDecoderState();
  const r1 = decode(enc.encode('\x1b[<0;240'), s0);
  assert.equal(r1.events.length, 0, 'incomplete report emits nothing');
  assert.ok(r1.rest.length > 0, 'partial report carried');

  const r2 = decode(enc.encode(';5M'), r1.state);
  assert.equal(r2.events.length, 1);
  const e = r2.events[0] as MouseEvent;
  assert.equal(e.x, 240);
  assert.equal(e.y, 5);
});
