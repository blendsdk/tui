/**
 * Implementation tests — `readEnv` edge cases (RD-02, Session 1.3).
 *
 * Edge/error coverage beyond the specification oracle: invalid `FORCE_COLOR`,
 * `LC_ALL`/`LC_CTYPE`/`LANG` POSIX precedence for UTF-8, and the `COLORTERM=24bit`
 * alias. Derived from the layer-3 contract in plan doc 03-02 (these are internal
 * edges, hence impl-level, not spec-level).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readEnv } from '../src/engine/capability/env.js';

// ---------------------------------------------------------------------------
// FORCE_COLOR validity
// ---------------------------------------------------------------------------

test('readEnv: invalid FORCE_COLOR=9 is ignored, falls through to TERM', () => {
  const { colorDepth } = readEnv({ TERM: 'xterm', FORCE_COLOR: '9' });
  assert.equal(colorDepth.forced, undefined);
  assert.equal(colorDepth.soft, '16');
});

test('readEnv: non-numeric FORCE_COLOR is ignored', () => {
  const { colorDepth } = readEnv({ TERM: 'xterm-256color', FORCE_COLOR: 'yes' });
  assert.equal(colorDepth.forced, undefined);
  assert.equal(colorDepth.soft, '256');
});

test('readEnv: each valid FORCE_COLOR level maps to a forced depth', () => {
  assert.equal(readEnv({ FORCE_COLOR: '0' }).colorDepth.forced, 'mono');
  assert.equal(readEnv({ FORCE_COLOR: '1' }).colorDepth.forced, '16');
  assert.equal(readEnv({ FORCE_COLOR: '2' }).colorDepth.forced, '256');
  assert.equal(readEnv({ FORCE_COLOR: '3' }).colorDepth.forced, 'truecolor');
});

// ---------------------------------------------------------------------------
// NO_COLOR precedence (the highest env band)
// ---------------------------------------------------------------------------

test('readEnv: NO_COLOR forces mono and outranks FORCE_COLOR', () => {
  const { colorDepth } = readEnv({ NO_COLOR: '1', FORCE_COLOR: '3' });
  assert.equal(colorDepth.forced, 'mono');
  assert.equal(colorDepth.soft, undefined);
});

// ---------------------------------------------------------------------------
// COLORTERM aliases
// ---------------------------------------------------------------------------

test('readEnv: COLORTERM=24bit is a truecolor alias', () => {
  assert.equal(readEnv({ COLORTERM: '24bit' }).colorDepth.soft, 'truecolor');
});

test('readEnv: COLORTERM matching is case-insensitive', () => {
  assert.equal(readEnv({ COLORTERM: 'TrueColor' }).colorDepth.soft, 'truecolor');
});

test('readEnv: unknown COLORTERM falls back to TERM', () => {
  const { colorDepth } = readEnv({ COLORTERM: 'rgb', TERM: 'xterm-256color' });
  assert.equal(colorDepth.soft, '256');
});

// ---------------------------------------------------------------------------
// UTF-8 locale precedence (LC_ALL > LC_CTYPE > LANG)
// ---------------------------------------------------------------------------

test('readEnv: LANG carrying UTF-8 sets unicode.utf8', () => {
  assert.equal(readEnv({ LANG: 'en_US.UTF-8' }).profile.unicode?.utf8, true);
});

test('readEnv: LC_ALL (no UTF-8) overrides a UTF-8 LANG', () => {
  // POSIX: LC_ALL is the effective locale; "C" carries no UTF-8 → utf8 stays off.
  const { profile } = readEnv({ LC_ALL: 'C', LANG: 'en_US.UTF-8' });
  assert.equal(profile.unicode, undefined);
});

test('readEnv: LC_CTYPE overrides LANG and is honored above it', () => {
  assert.equal(readEnv({ LC_CTYPE: 'en_US.UTF-8', LANG: 'C' }).profile.unicode?.utf8, true);
});

test('readEnv: UTF-8 detection is case-insensitive and accepts utf8', () => {
  assert.equal(readEnv({ LANG: 'en_US.utf8' }).profile.unicode?.utf8, true);
});

test('readEnv: no locale vars → utf8 unset', () => {
  assert.equal(readEnv({ TERM: 'xterm' }).profile.unicode, undefined);
});
