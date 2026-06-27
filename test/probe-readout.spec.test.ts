/**
 * Specification tests — live input/mouse readout formatter (RD-03, plan doc 03-03).
 *
 * Oracle source: 07-testing-strategy.md ST-25/26/27 (RD AC-2, AC-8, AR-17, RT-4).
 * Field names/coordinates come from RD-06's public InputEvent model (the contract
 * the formatter consumes), not from the formatter's implementation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatEventLine } from '../examples/capability-probe/live-readout.js';
import type { KeyEvent, MouseEvent, PasteEvent } from '../src/engine/index.js';

// ST-25: key events name the key and modifiers.
test('ST-25: key events render the key name and modifiers', () => {
  const up: KeyEvent = { type: 'key', key: 'up', ctrl: false, alt: false, shift: false };
  const ctrlA: KeyEvent = { type: 'key', key: 'a', ctrl: true, alt: false, shift: false };
  assert.ok(formatEventLine(up).includes('up'), 'names the arrow key');
  assert.ok(formatEventLine(ctrlA).includes('ctrl+a'), 'shows the ctrl modifier');
});

// ST-26: mouse events show kind and 1-based coordinates as given.
test('ST-26: mouse events show kind and coordinates as-is (already 1-based)', () => {
  const down: MouseEvent = { type: 'mouse', kind: 'down', button: 0, x: 6, y: 4 };
  const line = formatEventLine(down);
  assert.ok(line.includes('down'), 'shows the mouse kind');
  assert.ok(line.includes('6,4'), 'shows the 1-based coordinates verbatim');
});

// ST-27: paste shows byte length only, never contents.
test('ST-27: paste shows byte length only, never contents', () => {
  const paste: PasteEvent = { type: 'paste', text: 'hello', truncated: false };
  const line = formatEventLine(paste);
  assert.ok(line.includes('5 bytes'), 'shows the byte length');
  assert.ok(!line.includes('hello'), 'must NOT show paste contents');
});
