/**
 * Implementation tests — known-terminal table lookup (RD-02, Session 2.3).
 *
 * Covers the layer-4 keying contract from plan doc 03-02: lookup precedence
 * `TERM_PROGRAM > WT_SESSION > TERM` (then the VTE/Konsole markers), and that an
 * unrecognised terminal contributes nothing. These are internal table edges,
 * hence impl-level.
 */
import { test, expect } from 'vitest';

import { lookupTable } from '../src/engine/capability/table.js';

// ---------------------------------------------------------------------------
// Key precedence: TERM_PROGRAM > WT_SESSION > TERM
// ---------------------------------------------------------------------------

test('lookupTable: TERM_PROGRAM wins over WT_SESSION and TERM', () => {
  const caps = lookupTable({ TERM_PROGRAM: 'iTerm.app', WT_SESSION: 'abc', TERM: 'xterm' });
  // iTerm2's distinctive caps (truecolor + OSC hyperlink) confirm the match.
  expect(caps.colorDepth).toBe('truecolor');
  expect(caps.osc?.hyperlink8).toBe(true);
});

test('lookupTable: WT_SESSION wins over TERM', () => {
  const caps = lookupTable({ WT_SESSION: 'abc', TERM: 'xterm' });
  // Windows Terminal asserts truecolor; the bare `xterm` entry does not set colorDepth.
  expect(caps.colorDepth).toBe('truecolor');
});

test('lookupTable: an unknown TERM_PROGRAM falls through to the TERM family', () => {
  const caps = lookupTable({ TERM_PROGRAM: 'Unknown.app', TERM: 'xterm' });
  expect(caps.colorDepth).toBe(undefined); // xterm leaves colorDepth to env
  expect(caps.mouse?.sgr).toBe(true); // but does assert SGR mouse
});

// ---------------------------------------------------------------------------
// TERM family / marker matches
// ---------------------------------------------------------------------------

test('lookupTable: TERM=xterm-kitty matches Kitty (kittyFlags)', () => {
  expect(lookupTable({ TERM: 'xterm-kitty' }).keyboard?.kittyFlags).toBe(true);
});

test('lookupTable: TERM=screen-256color matches the multiplexer entry', () => {
  expect(lookupTable({ TERM: 'screen-256color' }).multiplexer).toBe(true);
});

test('lookupTable: TERM=tmux-256color matches the multiplexer entry', () => {
  expect(lookupTable({ TERM: 'tmux-256color' }).multiplexer).toBe(true);
});

test('lookupTable: VTE_VERSION identifies a VTE terminal', () => {
  expect(lookupTable({ VTE_VERSION: '6800' }).colorDepth).toBe('truecolor');
});

test('lookupTable: KONSOLE_VERSION identifies Konsole', () => {
  expect(lookupTable({ KONSOLE_VERSION: '220400' }).colorDepth).toBe('truecolor');
});

// ---------------------------------------------------------------------------
// Unknown terminals contribute nothing
// ---------------------------------------------------------------------------

test('lookupTable: an unrecognised TERM contributes nothing', () => {
  expect(lookupTable({ TERM: 'totally-unknown-term' })).toStrictEqual({});
});

test('lookupTable: empty env contributes nothing', () => {
  expect(lookupTable({})).toStrictEqual({});
});

test('lookupTable: the bare xterm entry omits colorDepth (env drives it)', () => {
  expect(lookupTable({ TERM: 'xterm-256color' }).colorDepth).toBe(undefined);
});
