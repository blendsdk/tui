/**
 * Implementation tests — canonical sanitizer edge cases (RD-08).
 *
 * Both String Terminator forms, tab/newline preservation, the empty string,
 * and multibyte pass-through. Complements the ST-9…ST-13 spec oracle. Relocated
 * from `render-sanitize.impl.test.ts` when the sanitizer moved to `safety/`.
 */
import { test, expect } from 'vitest';

import { sanitize } from '../src/engine/safety/sanitize.js';

test('ST in single-byte C1 form (0x9c) is stripped', () => {
  expect(sanitize('a\x9cb')).toBe('ab');
});

test('ST in two-byte ESC-backslash form is stripped whole', () => {
  expect(sanitize('a\x1b\\b')).toBe('ab');
  expect(sanitize('\x1b\\')).toBe('');
});

test('a lone ESC drops only the ESC, keeping a following non-backslash', () => {
  expect(sanitize('a\x1bXb')).toBe('aXb');
});

test('a lone trailing ESC is dropped with no following byte to consume', () => {
  expect(sanitize('abc\x1b')).toBe('abc');
});

test('mixed runs of control and printable text strip only the controls', () => {
  expect(sanitize('a\x07b\x1bc\x9cd\x01e')).toBe('abcde');
});

test('tab and newline are preserved; other C0 controls are stripped', () => {
  expect(sanitize('a\tb\nc')).toBe('a\tb\nc');
  expect(sanitize('a\x00\x01\x1f b')).toBe('a b');
});

test('the empty string sanitizes to the empty string', () => {
  expect(sanitize('')).toBe('');
});

test('multibyte and combining text passes through unchanged', () => {
  expect(sanitize('café 世界 😀 é')).toBe('café 世界 😀 é');
});

test('the full C1 range 0x80–0x9f is stripped', () => {
  for (let cp = 0x80; cp <= 0x9f; cp += 1) {
    expect(sanitize(`x${String.fromCodePoint(cp)}y`)).toBe('xy');
  }
});
