/**
 * Specification tests — the canonical RD-08 output sanitizer (the SDK's primary
 * injection boundary).
 *
 * Immutable oracle: expectations derive from RD-08 §Sanitizer rule and the
 * acceptance criteria (AC-3/AC-8) via ST-9…ST-13 in plan doc 07-testing-strategy
 * — never from reading the implementation. If a case fails after the relocation,
 * the relocation is wrong (AR-13), not the test.
 *
 * Imports from the relocated canonical home `safety/sanitize.js`.
 */
import { test, expect } from 'vitest';

import { sanitize } from '../src/engine/safety/sanitize.js';

// ST-9 — an embedded OSC-injection attempt has its control bytes stripped (AC-3).
test('ST-9: strips ESC and BEL from an OSC-injection attempt', () => {
  const out = sanitize('a\x1b]0;x\x07b');
  expect(!out.includes('\x1b')).toBeTruthy();
  expect(!out.includes('\x07')).toBeTruthy();
  expect(out).toBe('a]0;xb');
});

// ST-10 — printable UTF-8 (incl. astral), tab, and newline pass through (AC-3).
test('ST-10: preserves UTF-8, astral, tab, and newline unchanged', () => {
  expect(sanitize('café\tline\n😀')).toBe('café\tline\n😀');
});

// ST-11 — the two-byte `ESC \` String Terminator is removed whole.
test('ST-11: removes both bytes of the ESC-backslash String Terminator', () => {
  expect(sanitize('x\x1b\\y')).toBe('xy');
});

// ST-12 — each control class is stripped: BEL, single-byte ST, a C0, a C1 (AC-8).
test('ST-12: strips BEL, single-byte ST, a C0, and a C1 control byte', () => {
  expect(!sanitize('a\x07b').includes('\x07')).toBeTruthy();
  expect(!sanitize('a\x9cb').includes('\x9c')).toBeTruthy();
  expect(!sanitize('a\x01b').includes('\x01')).toBeTruthy();
  expect(!sanitize('a\x85b').includes('\x85')).toBeTruthy();
});

// ST-13 — empty and all-control inputs collapse to the empty string (AC-8).
test('ST-13: empty and all-control inputs collapse to the empty string', () => {
  expect(sanitize('')).toBe('');
  expect(sanitize('\x1b\x1b\x1b')).toBe('');
});
