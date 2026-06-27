/**
 * Specification tests — width-correct cell buffer (RD-04, AC-2).
 *
 * Immutable oracle: expectations derive from RD-04's acceptance criterion AC-2
 * and ST-3 in plan doc 07-testing-strategy — never from reading the
 * implementation. If a test here fails after implementation, the implementation
 * is wrong, not the test.
 *
 * Capabilities are not needed: the buffer knows display width but not terminal
 * capabilities, so a hand-built style fixture suffices.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ScreenBuffer } from '../src/engine/render/buffer.js';
import type { Style } from '../src/engine/render/types.js';

/** A minimal style fixture (terminal defaults; attributes are irrelevant here). */
const STYLE: Style = { fg: 'default', bg: 'default' };

// ---------------------------------------------------------------------------
// ST-3 — width-correct wide glyph (AC-2)
// ---------------------------------------------------------------------------

test('ST-3: wide CJK lead cell has width 2', () => {
  const buf = new ScreenBuffer(80, 24, { fg: 'default', bg: 'default' });
  buf.text(0, 0, '世', STYLE);
  const lead = buf.get(0, 0);
  assert.ok(lead, 'expected a cell at (0,0)');
  assert.equal(lead.width, 2, 'wide-glyph lead cell must have width 2');
  assert.equal(lead.char, '世', 'lead cell keeps the real glyph');
});

test('ST-3: wide CJK continuation cell has width 0 and empty char', () => {
  const buf = new ScreenBuffer(80, 24, { fg: 'default', bg: 'default' });
  buf.text(0, 0, '世', STYLE);
  const cont = buf.get(1, 0);
  assert.ok(cont, 'expected a continuation cell at (1,0)');
  assert.equal(cont.width, 0, 'continuation cell must have width 0');
  assert.equal(cont.char, '', 'continuation cell emits no glyph (empty char)');
});

test('ST-3: text() advances by display width (returns column 2 after one wide glyph)', () => {
  const buf = new ScreenBuffer(80, 24, { fg: 'default', bg: 'default' });
  const next = buf.text(0, 0, '世', STYLE);
  assert.equal(next, 2, 'next write column tracks display width, not code-point count');
});
