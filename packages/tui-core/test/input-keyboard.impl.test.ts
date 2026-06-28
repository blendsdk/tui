/**
 * Implementation tests — keyboard decoder internals (RD-06, Session 2.3).
 *
 * Edge/internal coverage of `keys.ts` + `decoder.ts`: every nav/F-key, SS3
 * f1–f4, the xterm modifier matrix, the Ctrl-letter range, and UTF-8 multibyte
 * decoding (including a code point split across a chunk boundary and invalid
 * UTF-8 dropped without a crash). Complements the ST-1/2/10 spec oracles.
 */
import { test, expect } from 'vitest';

import { createDecoderState, decode } from '../src/engine/input/decoder.js';
import type { KeyEvent } from '../src/engine/input/events.js';

const enc = new TextEncoder();

/** Decode `bytes` against a fresh state and return the single KeyEvent. */
function one(bytes: Uint8Array): KeyEvent {
  const r = decode(bytes, createDecoderState());
  expect(r.events.length).toBe(1);
  return r.events[0] as KeyEvent;
}

// ---------------------------------------------------------------------------
// Cursor / nav keys (CSI single-final)
// ---------------------------------------------------------------------------

test('keys: CSI cursor keys A/B/C/D → up/down/right/left', () => {
  expect(one(enc.encode('\x1b[A')).key).toBe('up');
  expect(one(enc.encode('\x1b[B')).key).toBe('down');
  expect(one(enc.encode('\x1b[C')).key).toBe('right');
  expect(one(enc.encode('\x1b[D')).key).toBe('left');
});

test('keys: CSI H/F → home/end', () => {
  expect(one(enc.encode('\x1b[H')).key).toBe('home');
  expect(one(enc.encode('\x1b[F')).key).toBe('end');
});

test('keys: CSI ~ edit keys 1–6 → home/insert/delete/end/pageup/pagedown', () => {
  expect(one(enc.encode('\x1b[1~')).key).toBe('home');
  expect(one(enc.encode('\x1b[2~')).key).toBe('insert');
  expect(one(enc.encode('\x1b[3~')).key).toBe('delete');
  expect(one(enc.encode('\x1b[4~')).key).toBe('end');
  expect(one(enc.encode('\x1b[5~')).key).toBe('pageup');
  expect(one(enc.encode('\x1b[6~')).key).toBe('pagedown');
});

// ---------------------------------------------------------------------------
// Function keys: CSI ~ encodings and SS3 f1–f4
// ---------------------------------------------------------------------------

test('keys: CSI ~ function keys 11–24 → f1–f12', () => {
  const pairs: [number, string][] = [
    [11, 'f1'],
    [12, 'f2'],
    [13, 'f3'],
    [14, 'f4'],
    [15, 'f5'],
    [17, 'f6'],
    [18, 'f7'],
    [19, 'f8'],
    [20, 'f9'],
    [21, 'f10'],
    [23, 'f11'],
    [24, 'f12'],
  ];
  for (const [n, name] of pairs) {
    expect(one(enc.encode(`\x1b[${n}~`)).key).toBe(name);
  }
});

test('keys: SS3 P/Q/R/S → f1–f4', () => {
  expect(one(enc.encode('\x1bOP')).key).toBe('f1');
  expect(one(enc.encode('\x1bOQ')).key).toBe('f2');
  expect(one(enc.encode('\x1bOR')).key).toBe('f3');
  expect(one(enc.encode('\x1bOS')).key).toBe('f4');
});

// ---------------------------------------------------------------------------
// Modifier matrix (xterm `1 + bitmask`)
// ---------------------------------------------------------------------------

test('keys: modifier matrix on a cursor key (CSI 1 ; <mod> C)', () => {
  const right2 = one(enc.encode('\x1b[1;2C')); // shift
  expect([right2.shift, right2.alt, right2.ctrl]).toStrictEqual([true, false, false]);

  const right3 = one(enc.encode('\x1b[1;3C')); // alt
  expect([right3.shift, right3.alt, right3.ctrl]).toStrictEqual([false, true, false]);

  const right5 = one(enc.encode('\x1b[1;5C')); // ctrl
  expect([right5.shift, right5.alt, right5.ctrl]).toStrictEqual([false, false, true]);

  const right6 = one(enc.encode('\x1b[1;6C')); // ctrl+shift
  expect([right6.shift, right6.alt, right6.ctrl]).toStrictEqual([true, false, true]);

  const right7 = one(enc.encode('\x1b[1;7C')); // alt+ctrl
  expect([right7.shift, right7.alt, right7.ctrl]).toStrictEqual([false, true, true]);
});

test('keys: meta bit (mod 9) folds into alt', () => {
  const right9 = one(enc.encode('\x1b[1;9C'));
  expect(right9.alt).toBe(true);
});

test('keys: modifier on a ~ key (CSI 3 ; 5 ~) → ctrl+delete', () => {
  const del = one(enc.encode('\x1b[3;5~'));
  expect(del.key).toBe('delete');
  expect(del.ctrl).toBe(true);
});

// ---------------------------------------------------------------------------
// Ctrl-letter range and the named-control exclusions
// ---------------------------------------------------------------------------

test('keys: Ctrl-letter range 0x01–0x1a → a–z with ctrl', () => {
  const a = one(Uint8Array.from([0x01]));
  expect(a.key).toBe('a');
  expect(a.ctrl).toBe(true);
  const z = one(Uint8Array.from([0x1a]));
  expect(z.key).toBe('z');
  expect(z.ctrl).toBe(true);
});

test('keys: named controls are not Ctrl-letters (tab/enter/backspace)', () => {
  expect(one(Uint8Array.from([0x09])).key).toBe('tab');
  expect(one(Uint8Array.from([0x0a])).key).toBe('enter');
  expect(one(Uint8Array.from([0x08])).key).toBe('backspace');
  expect(one(Uint8Array.from([0x20])).key).toBe('space');
});

// ---------------------------------------------------------------------------
// UTF-8 multibyte printables
// ---------------------------------------------------------------------------

test('keys: 2-/3-/4-byte UTF-8 decode to one code point each', () => {
  const e = one(enc.encode('é'));
  expect(e.key).toBe('é');
  expect(e.codepoint).toBe(0x00e9);

  const euro = one(enc.encode('€'));
  expect(euro.key).toBe('€');
  expect(euro.codepoint).toBe(0x20ac);

  const grin = one(enc.encode('😀'));
  expect(grin.key).toBe('😀');
  expect(grin.codepoint).toBe(0x1f600);
});

test('keys: a multibyte char split across chunks is carried then completed', () => {
  const bytes = enc.encode('€'); // 3 bytes: E2 82 AC
  const s0 = createDecoderState();

  const r1 = decode(bytes.subarray(0, 2), s0); // first 2 bytes only
  expect(r1.events.length).toBe(0);
  expect(r1.rest.length > 0).toBeTruthy();

  const r2 = decode(bytes.subarray(2), r1.state); // final byte
  expect(r2.events.length).toBe(1);
  expect((r2.events[0] as KeyEvent).codepoint).toBe(0x20ac);
  expect(r2.rest.length).toBe(0);
});

test('keys: invalid UTF-8 bytes are dropped without crashing', () => {
  // A lone continuation byte and an out-of-range lead byte: no events, no throw.
  const r = decode(Uint8Array.from([0x80, 0xff]), createDecoderState());
  expect(r.events.length).toBe(0);
  expect(r.rest.length).toBe(0);
});
