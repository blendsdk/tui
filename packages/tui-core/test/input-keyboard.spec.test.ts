/**
 * Specification tests — classic keyboard decoding (RD-06, AC-1).
 *
 * Immutable oracle: expectations derive from RD-06's acceptance criterion AC-1
 * and the keyboard grammar in plan doc 03-02 / 07-testing-strategy ST-1 — never
 * from reading the implementation. If a test here fails after implementation,
 * the implementation is wrong, not the test.
 *
 * All inputs are byte literals so no terminal is required.
 */
import { test, expect } from 'vitest';

import { createDecoderState, decode } from '../src/engine/input/decoder.js';
import type { KeyEvent } from '../src/engine/input/events.js';

const enc = new TextEncoder();

/** Decode `bytes` against a fresh state and return the single decoded event. */
function decodeOne(bytes: Uint8Array): KeyEvent {
  const result = decode(bytes, createDecoderState());
  expect(result.events.length).toBe(1);
  expect(result.queries.length).toBe(0);
  expect(result.rest.length).toBe(0);
  const event = result.events[0];
  expect(event.type).toBe('key');
  return event as KeyEvent;
}

// ---------------------------------------------------------------------------
// ST-1 — classic keyboard map (AC-1): each input → exactly one KeyEvent
// ---------------------------------------------------------------------------

test('ST-1: CSI cursor up (ESC [ A) → up', () => {
  const k = decodeOne(enc.encode('\x1b[A'));
  expect(k.key).toBe('up');
  expect(k.ctrl).toBe(false);
  expect(k.alt).toBe(false);
  expect(k.shift).toBe(false);
});

test('ST-1: SS3 cursor up (ESC O A) → up', () => {
  const k = decodeOne(enc.encode('\x1bOA'));
  expect(k.key).toBe('up');
});

test('ST-1: modified cursor (ESC [ 1 ; 5 C) → right + ctrl', () => {
  const k = decodeOne(enc.encode('\x1b[1;5C'));
  expect(k.key).toBe('right');
  expect(k.ctrl).toBe(true);
  expect(k.alt).toBe(false);
  expect(k.shift).toBe(false);
});

test('ST-1: function key (ESC [ 1 5 ~) → f5', () => {
  const k = decodeOne(enc.encode('\x1b[15~'));
  expect(k.key).toBe('f5');
});

test('ST-1: alt-prefixed printable (ESC x) → x + alt', () => {
  const k = decodeOne(enc.encode('\x1bx'));
  expect(k.key).toBe('x');
  expect(k.alt).toBe(true);
  expect(k.ctrl).toBe(false);
});

test('ST-1: carriage return (\\r) → enter', () => {
  const k = decodeOne(Uint8Array.from([0x0d]));
  expect(k.key).toBe('enter');
});

test('ST-1: DEL (0x7f) → backspace', () => {
  const k = decodeOne(Uint8Array.from([0x7f]));
  expect(k.key).toBe('backspace');
});

test('ST-1: Ctrl-C (0x03) → c + ctrl', () => {
  const k = decodeOne(Uint8Array.from([0x03]));
  expect(k.key).toBe('c');
  expect(k.ctrl).toBe(true);
});
