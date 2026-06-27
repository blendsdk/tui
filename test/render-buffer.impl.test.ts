/**
 * Implementation tests — ScreenBuffer geometry & width invariants (RD-04, PL-17).
 *
 * Edge cases around bounds clipping, wide-glyph orphan repair, last-column
 * clipping, and the `rows()` shape. Complements the ST-3 spec oracle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ScreenBuffer } from '../src/engine/render/buffer.js';
import type { Style } from '../src/engine/render/types.js';

const STYLE: Style = { fg: 'default', bg: 'default' };
const fresh = (w = 10, h = 4): ScreenBuffer => new ScreenBuffer(w, h, { fg: 'default', bg: 'default' });

test('out-of-bounds writes are silently clipped; get() returns undefined', () => {
  const buf = fresh();
  buf.set(-1, 0, 'X', STYLE);
  buf.set(0, -1, 'X', STYLE);
  buf.set(99, 0, 'X', STYLE);
  assert.equal(buf.get(-1, 0), undefined);
  assert.equal(buf.get(99, 0), undefined);
  assert.equal(buf.get(0, 0)?.char, ' ', 'in-bounds cell untouched');
});

test('dimensions clamp to at least 1', () => {
  const buf = new ScreenBuffer(0, -3, { fg: 'default', bg: 'default' });
  assert.equal(buf.width, 1);
  assert.equal(buf.height, 1);
});

test('overwriting the lead half of a wide glyph clears the orphan continuation', () => {
  const buf = fresh();
  buf.set(0, 0, '世', STYLE); // lead@0 (w2) + cont@1 (w0)
  buf.set(0, 0, 'A', STYLE); // overwrite the lead
  assert.equal(buf.get(0, 0)?.char, 'A');
  assert.equal(buf.get(0, 0)?.width, 1);
  const orphan = buf.get(1, 0);
  assert.equal(orphan?.char, ' ', 'orphaned continuation blanked to a space');
  assert.equal(orphan?.width, 1);
});

test('overwriting the continuation half of a wide glyph clears the orphan lead', () => {
  const buf = fresh();
  buf.set(0, 0, '世', STYLE);
  buf.set(1, 0, 'B', STYLE); // overwrite the continuation
  assert.equal(buf.get(1, 0)?.char, 'B');
  assert.equal(buf.get(0, 0)?.char, ' ', 'orphaned lead blanked to a space');
  assert.equal(buf.get(0, 0)?.width, 1);
});

test('a wide glyph in the last column clips to a space (never a half glyph)', () => {
  const buf = fresh(3, 1);
  buf.set(2, 0, '世', STYLE); // last column, no room for continuation
  assert.equal(buf.get(2, 0)?.char, ' ');
  assert.equal(buf.get(2, 0)?.width, 1);
});

test('text() with a wide glyph advances two columns and writes lead+continuation', () => {
  const buf = fresh();
  const next = buf.text(0, 0, 'a世b', STYLE);
  assert.equal(buf.get(0, 0)?.char, 'a');
  assert.equal(buf.get(1, 0)?.char, '世');
  assert.equal(buf.get(1, 0)?.width, 2);
  assert.equal(buf.get(2, 0)?.width, 0);
  assert.equal(buf.get(3, 0)?.char, 'b');
  assert.equal(next, 4, 'a(1) + 世(2) + b(1) = column 4');
});

test('fillRect fills the rectangle and clips at the edges', () => {
  const buf = fresh(5, 3);
  buf.fillRect(1, 1, 2, 2, '#', STYLE);
  assert.equal(buf.get(1, 1)?.char, '#');
  assert.equal(buf.get(2, 2)?.char, '#');
  assert.equal(buf.get(0, 0)?.char, ' ', 'outside the rect untouched');
  assert.equal(buf.get(3, 1)?.char, ' ');
});

test('shadow recolors the cells right and below the rectangle', () => {
  const buf = fresh(6, 6);
  const shade: Style = { fg: '#808080', bg: '#000000' };
  buf.shadow(1, 1, 3, 2, shade);
  // One column to the right of the rect (x+w = 4), rows y+1..y+h.
  assert.equal(buf.get(4, 2)?.bg, '#000000');
  // One row below (y+h = 3), cols x+1..x+w.
  assert.equal(buf.get(2, 3)?.bg, '#000000');
  assert.equal(buf.get(0, 0)?.bg, 'default', 'untouched cell keeps its bg');
});

test('box draws a framed panel storing the real Unicode glyphs', () => {
  const buf = fresh(6, 4);
  buf.box(0, 0, 4, 3, STYLE, 'single');
  assert.equal(buf.get(0, 0)?.char, '┌');
  assert.equal(buf.get(3, 0)?.char, '┐');
  assert.equal(buf.get(0, 2)?.char, '└');
  assert.equal(buf.get(3, 2)?.char, '┘');
  assert.equal(buf.get(1, 0)?.char, '─');
  assert.equal(buf.get(0, 1)?.char, '│');
});

test('rows() returns height rows of width cells', () => {
  const buf = fresh(5, 3);
  const rows = buf.rows();
  assert.equal(rows.length, 3);
  assert.equal(rows[0].length, 5);
  assert.equal(rows[0][0].char, ' ');
});
