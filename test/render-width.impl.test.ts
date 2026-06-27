/**
 * Implementation tests — character-width boundaries (RD-04, PL-10).
 *
 * Edge/boundary coverage for `charWidth`: pins the documented East-Asian Width
 * range boundaries and the ambiguous-mode switch. Complements the ST-3 spec
 * oracle (which proves the buffer integrates width correctly).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { charWidth } from '../src/engine/render/width.js';

test('control and zero-width code points are width 0', () => {
  assert.equal(charWidth(0x00, 'wcwidth'), 0, 'NUL');
  assert.equal(charWidth(0x1b, 'wcwidth'), 0, 'ESC (C0)');
  assert.equal(charWidth(0x9b, 'wcwidth'), 0, 'CSI (C1)');
  assert.equal(charWidth(0x200b, 'wcwidth'), 0, 'zero-width space');
  assert.equal(charWidth(0xfeff, 'wcwidth'), 0, 'BOM / ZWNBSP');
});

test('combining mark U+0301 is width 0 in both modes', () => {
  assert.equal(charWidth(0x0301, 'wcwidth'), 0);
  assert.equal(charWidth(0x0301, 'ambiguous-wide'), 0);
});

test('CJK boundary: U+4DFF narrow, U+4E00 wide', () => {
  // U+4DC0..4DFF (Yijing Hexagrams) is narrow; CJK Unified begins at U+4E00.
  assert.equal(charWidth(0x4dff, 'wcwidth'), 1, 'U+4DFF must be narrow');
  assert.equal(charWidth(0x4e00, 'wcwidth'), 2, 'U+4E00 must be wide');
});

test('fullwidth and CJK ideographs are width 2', () => {
  assert.equal(charWidth(0xff00, 'wcwidth'), 2, 'fullwidth form U+FF00');
  assert.equal(charWidth(0x4e16, 'wcwidth'), 2, '世 U+4E16');
  assert.equal(charWidth(0xac00, 'wcwidth'), 2, 'Hangul syllable');
});

test('wide emoji is width 2', () => {
  assert.equal(charWidth(0x1f600, 'wcwidth'), 2, '😀 U+1F600');
  assert.equal(charWidth(0x1f300, 'wcwidth'), 2, 'emoji block start');
});

test('plain ASCII is width 1', () => {
  assert.equal(charWidth(0x41, 'wcwidth'), 1, 'A');
  assert.equal(charWidth(0x20, 'wcwidth'), 1, 'space');
});

test('ambiguous U+00A1 widens only under ambiguous-wide', () => {
  assert.equal(charWidth(0x00a1, 'wcwidth'), 1, '¡ narrow by default');
  assert.equal(charWidth(0x00a1, 'ambiguous-wide'), 2, '¡ wide in CJK context');
});

test('ambiguous U+2018 widens only under ambiguous-wide', () => {
  assert.equal(charWidth(0x2018, 'wcwidth'), 1);
  assert.equal(charWidth(0x2018, 'ambiguous-wide'), 2);
});
