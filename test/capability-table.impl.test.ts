/**
 * Implementation tests — known-terminal table lookup (RD-02, Session 2.3).
 *
 * Covers the layer-4 keying contract from plan doc 03-02: lookup precedence
 * `TERM_PROGRAM > WT_SESSION > TERM` (then the VTE/Konsole markers), and that an
 * unrecognised terminal contributes nothing. These are internal table edges,
 * hence impl-level.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lookupTable } from '../src/engine/capability/table.js';

// ---------------------------------------------------------------------------
// Key precedence: TERM_PROGRAM > WT_SESSION > TERM
// ---------------------------------------------------------------------------

test('lookupTable: TERM_PROGRAM wins over WT_SESSION and TERM', () => {
  const caps = lookupTable({ TERM_PROGRAM: 'iTerm.app', WT_SESSION: 'abc', TERM: 'xterm' });
  // iTerm2's distinctive caps (truecolor + OSC hyperlink) confirm the match.
  assert.equal(caps.colorDepth, 'truecolor');
  assert.equal(caps.osc?.hyperlink8, true);
});

test('lookupTable: WT_SESSION wins over TERM', () => {
  const caps = lookupTable({ WT_SESSION: 'abc', TERM: 'xterm' });
  // Windows Terminal asserts truecolor; the bare `xterm` entry does not set colorDepth.
  assert.equal(caps.colorDepth, 'truecolor');
});

test('lookupTable: an unknown TERM_PROGRAM falls through to the TERM family', () => {
  const caps = lookupTable({ TERM_PROGRAM: 'Unknown.app', TERM: 'xterm' });
  assert.equal(caps.colorDepth, undefined); // xterm leaves colorDepth to env
  assert.equal(caps.mouse?.sgr, true); // but does assert SGR mouse
});

// ---------------------------------------------------------------------------
// TERM family / marker matches
// ---------------------------------------------------------------------------

test('lookupTable: TERM=xterm-kitty matches Kitty (kittyFlags)', () => {
  assert.equal(lookupTable({ TERM: 'xterm-kitty' }).keyboard?.kittyFlags, true);
});

test('lookupTable: TERM=screen-256color matches the multiplexer entry', () => {
  assert.equal(lookupTable({ TERM: 'screen-256color' }).multiplexer, true);
});

test('lookupTable: TERM=tmux-256color matches the multiplexer entry', () => {
  assert.equal(lookupTable({ TERM: 'tmux-256color' }).multiplexer, true);
});

test('lookupTable: VTE_VERSION identifies a VTE terminal', () => {
  assert.equal(lookupTable({ VTE_VERSION: '6800' }).colorDepth, 'truecolor');
});

test('lookupTable: KONSOLE_VERSION identifies Konsole', () => {
  assert.equal(lookupTable({ KONSOLE_VERSION: '220400' }).colorDepth, 'truecolor');
});

// ---------------------------------------------------------------------------
// Unknown terminals contribute nothing
// ---------------------------------------------------------------------------

test('lookupTable: an unrecognised TERM contributes nothing', () => {
  assert.deepEqual(lookupTable({ TERM: 'totally-unknown-term' }), {});
});

test('lookupTable: empty env contributes nothing', () => {
  assert.deepEqual(lookupTable({}), {});
});

test('lookupTable: the bare xterm entry omits colorDepth (env drives it)', () => {
  assert.equal(lookupTable({ TERM: 'xterm-256color' }).colorDepth, undefined);
});
