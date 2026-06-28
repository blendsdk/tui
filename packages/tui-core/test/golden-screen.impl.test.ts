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
import { test, expect } from 'vitest';
import { makeTerm, feed, readCell, reverseState } from './golden-screen-helpers.js';

test('readCell: an empty (never-written) cell is normalized to "" width 1, default colours', async () => {
  const term = makeTerm(4, 1);
  const cell = readCell(term, 0, 0);
  expect(cell.char).toBe('');
  expect(cell.width).toBe(1);
  expect(cell.fg.mode).toBe('default');
  expect(cell.bg.mode).toBe('default');
});

test('readCell: the trailing continuation of a wide glyph is "" width 0', async () => {
  const term = makeTerm(4, 1);
  await feed(term, '漢');
  const lead = readCell(term, 0, 0);
  const cont = readCell(term, 1, 0);
  expect(lead.char).toBe('漢');
  expect(lead.width).toBe(2);
  expect(cont.char).toBe('');
  expect(cont.width).toBe(0);
});

test('readCell: a plain char with no SGR reports default fg/bg', async () => {
  const term = makeTerm(4, 1);
  await feed(term, 'A');
  const cell = readCell(term, 0, 0);
  expect(cell.char).toBe('A');
  expect(cell.width).toBe(1);
  expect(cell.fg.mode).toBe('default');
  expect(cell.bg.mode).toBe('default');
});

test('reverseState: normalizes the inverse attribute (SGR 7) to a boolean', async () => {
  const term = makeTerm(4, 1);
  // A plain char with no SGR is not inverse; SGR 7 ("\x1b[7m") sets it.
  await feed(term, 'A\x1b[7mB');
  expect(reverseState(term, 0, 0)).toBe(false);
  expect(reverseState(term, 1, 0)).toBe(true);
});
