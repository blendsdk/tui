/**
 * Golden-screen emulator-adapter implementation tests (RD-09 FR-2, plan doc 03-02).
 *
 * Edge cases of the `readCell` normalization the golden spec relies on: an empty
 * (never-written) cell, the trailing continuation of a wide glyph, and a cell
 * with no SGR colour (terminal defaults). These pin the adapter's behaviour so a
 * future `@xterm/headless` change is caught here rather than corrupting a golden
 * assertion silently.
 *
 * The `.js` extension in the import specifier is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source under tsx).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTerm, feed, readCell } from './golden-screen-helpers.js';

test('readCell: an empty (never-written) cell is normalized to "" width 1, default colours', async () => {
  const term = makeTerm(4, 1);
  const cell = readCell(term, 0, 0);
  assert.equal(cell.char, '');
  assert.equal(cell.width, 1);
  assert.equal(cell.fg.mode, 'default');
  assert.equal(cell.bg.mode, 'default');
});

test('readCell: the trailing continuation of a wide glyph is "" width 0', async () => {
  const term = makeTerm(4, 1);
  await feed(term, '漢');
  const lead = readCell(term, 0, 0);
  const cont = readCell(term, 1, 0);
  assert.equal(lead.char, '漢');
  assert.equal(lead.width, 2);
  assert.equal(cont.char, '');
  assert.equal(cont.width, 0);
});

test('readCell: a plain char with no SGR reports default fg/bg', async () => {
  const term = makeTerm(4, 1);
  await feed(term, 'A');
  const cell = readCell(term, 0, 0);
  assert.equal(cell.char, 'A');
  assert.equal(cell.width, 1);
  assert.equal(cell.fg.mode, 'default');
  assert.equal(cell.bg.mode, 'default');
});
