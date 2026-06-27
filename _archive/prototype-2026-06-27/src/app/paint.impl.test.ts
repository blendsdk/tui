/**
 * Implementation tests for the painter: it produces a buffer of the requested
 * size and the expected glyphs/overlays appear for each mode.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { paint } from './paint.js';
import { Mode } from './state.js';
import type { ScreenSize } from '../tui/useScreenSize.js';

const SIZE: ScreenSize = { columns: 64, rows: 20 };

/** Flatten a painted buffer to a single plain-text string for assertions. */
function asText(mode: Mode, menuIndex = 0): string {
  const buf = paint({ mode, menuIndex }, SIZE);
  return buf
    .rows()
    .map((row) => row.map((cell) => cell.char).join(''))
    .join('\n');
}

test('buffer matches the requested terminal size', () => {
  const buf = paint({ mode: Mode.Desktop, menuIndex: 0 }, SIZE);
  assert.equal(buf.width, SIZE.columns);
  assert.equal(buf.height, SIZE.rows);
});

test('desktop shows the menu bar, window, button and status hints', () => {
  const text = asText(Mode.Desktop);
  assert.match(text, /File/);
  assert.match(text, /Hello App/);
  assert.match(text, /Hello/);
  assert.match(text, /Alt-X Exit/);
  assert.match(text, /░/, 'desktop is filled with the light-shade stipple pattern');
});

test('open menu overlays the dropdown with both items', () => {
  const text = asText(Mode.Menu, 0);
  assert.match(text, /Hello\.\.\./);
  assert.match(text, /Exit/);
  assert.match(text, /Alt-X/);
});

test('dialog mode renders the Information box with the greeting and OK', () => {
  const text = asText(Mode.Dialog);
  assert.match(text, /Information/);
  assert.match(text, /Hello, World!/);
  assert.match(text, /OK/);
});
