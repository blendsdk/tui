/**
 * Implementation tests — `deepMerge` leaf semantics (RD-02, Session 1.3).
 *
 * Covers the override-merge primitive (PL-7): nested-group merge, scalar
 * replacement, `undefined`-skip, base immutability, and merging over a frozen
 * base. Derived from the deepMerge contract in plan doc 03-02.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deepMerge } from '../src/engine/capability/detect.js';
import { CONSERVATIVE_DEFAULTS } from '../src/engine/capability/defaults.js';
import type { CapabilityProfile } from '../src/engine/capability/profile.js';

test('deepMerge: nested group merges leaf-by-leaf, untouched leaves retained', () => {
  const base = { sgr: true, drag: true, wheel: true };
  const merged = deepMerge(base, { sgr: false });
  assert.deepEqual(merged, { sgr: false, drag: true, wheel: true });
});

test('deepMerge: scalar partial replaces the base scalar', () => {
  const merged = deepMerge<CapabilityProfile>(CONSERVATIVE_DEFAULTS, {
    colorDepth: 'truecolor',
  });
  assert.equal(merged.colorDepth, 'truecolor');
});

test('deepMerge: nested + scalar override in one pass', () => {
  const merged = deepMerge<CapabilityProfile>(CONSERVATIVE_DEFAULTS, {
    colorDepth: '256',
    mouse: { sgr: true },
  });
  assert.equal(merged.colorDepth, '256');
  assert.equal(merged.mouse.sgr, true);
  // Sibling leaves in the touched group keep their base values.
  assert.equal(merged.mouse.drag, false);
  assert.equal(merged.mouse.wheel, false);
});

test('deepMerge: undefined partial leaf is skipped (never clears the base)', () => {
  const base = { sgr: true, drag: true, wheel: true };
  const merged = deepMerge(base, { sgr: undefined });
  assert.equal(merged.sgr, true);
});

test('deepMerge: does not mutate the base object', () => {
  const base = { sgr: true, drag: true, wheel: true };
  const snapshot = { ...base };
  deepMerge(base, { sgr: false });
  assert.deepEqual(base, snapshot);
});

test('deepMerge: nested merge does not mutate the base group', () => {
  const merged = deepMerge<CapabilityProfile>(CONSERVATIVE_DEFAULTS, {
    mouse: { sgr: true },
  });
  // The shared default group must be untouched by the merge.
  assert.equal(CONSERVATIVE_DEFAULTS.mouse.sgr, false);
  assert.notEqual(merged.mouse, CONSERVATIVE_DEFAULTS.mouse);
});

test('deepMerge: merging over a frozen base returns a new object, no throw', () => {
  const frozenBase = Object.freeze({ sgr: false, drag: false, wheel: false });
  const merged = deepMerge(frozenBase, { drag: true });
  assert.deepEqual(merged, { sgr: false, drag: true, wheel: false });
  assert.notEqual(merged, frozenBase);
});
