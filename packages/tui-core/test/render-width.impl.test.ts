/**
 * Implementation tests — character-width boundaries (RD-04, PL-10).
 *
 * Edge/boundary coverage for `charWidth`: pins the documented East-Asian Width
 * range boundaries and the ambiguous-mode switch. Complements the ST-3 spec
 * oracle (which proves the buffer integrates width correctly).
 */
import { test, expect } from 'vitest';

import { charWidth } from '../src/engine/render/width.js';

test('control and zero-width code points are width 0', () => {
  expect(charWidth(0x00, 'wcwidth')).toBe(0);
  expect(charWidth(0x1b, 'wcwidth')).toBe(0);
  expect(charWidth(0x9b, 'wcwidth')).toBe(0);
  expect(charWidth(0x200b, 'wcwidth')).toBe(0);
  expect(charWidth(0xfeff, 'wcwidth')).toBe(0);
});

test('combining mark U+0301 is width 0 in both modes', () => {
  expect(charWidth(0x0301, 'wcwidth')).toBe(0);
  expect(charWidth(0x0301, 'ambiguous-wide')).toBe(0);
});

test('CJK boundary: U+4DFF narrow, U+4E00 wide', () => {
  // U+4DC0..4DFF (Yijing Hexagrams) is narrow; CJK Unified begins at U+4E00.
  expect(charWidth(0x4dff, 'wcwidth')).toBe(1);
  expect(charWidth(0x4e00, 'wcwidth')).toBe(2);
});

test('fullwidth and CJK ideographs are width 2', () => {
  expect(charWidth(0xff00, 'wcwidth')).toBe(2);
  expect(charWidth(0x4e16, 'wcwidth')).toBe(2);
  expect(charWidth(0xac00, 'wcwidth')).toBe(2);
});

test('wide emoji is width 2', () => {
  expect(charWidth(0x1f600, 'wcwidth')).toBe(2);
  expect(charWidth(0x1f300, 'wcwidth')).toBe(2);
});

test('plain ASCII is width 1', () => {
  expect(charWidth(0x41, 'wcwidth')).toBe(1);
  expect(charWidth(0x20, 'wcwidth')).toBe(1);
});

test('ambiguous U+00A1 widens only under ambiguous-wide', () => {
  expect(charWidth(0x00a1, 'wcwidth')).toBe(1);
  expect(charWidth(0x00a1, 'ambiguous-wide')).toBe(2);
});

test('ambiguous U+2018 widens only under ambiguous-wide', () => {
  expect(charWidth(0x2018, 'wcwidth')).toBe(1);
  expect(charWidth(0x2018, 'ambiguous-wide')).toBe(2);
});
