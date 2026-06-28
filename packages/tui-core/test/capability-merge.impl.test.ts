/**
 * Implementation tests — `deepMerge` leaf semantics (RD-02, Session 1.3).
 *
 * Covers the override-merge primitive (PL-7): nested-group merge, scalar
 * replacement, `undefined`-skip, base immutability, and merging over a frozen
 * base. Derived from the deepMerge contract in plan doc 03-02.
 */
import { test, expect } from 'vitest';

import { deepMerge } from '../src/engine/capability/detect.js';
import { CONSERVATIVE_DEFAULTS } from '../src/engine/capability/defaults.js';
import type { CapabilityProfile } from '../src/engine/capability/profile.js';

test('deepMerge: nested group merges leaf-by-leaf, untouched leaves retained', () => {
  const base = { sgr: true, drag: true, wheel: true };
  const merged = deepMerge(base, { sgr: false });
  expect(merged).toStrictEqual({ sgr: false, drag: true, wheel: true });
});

test('deepMerge: scalar partial replaces the base scalar', () => {
  const merged = deepMerge<CapabilityProfile>(CONSERVATIVE_DEFAULTS, {
    colorDepth: 'truecolor',
  });
  expect(merged.colorDepth).toBe('truecolor');
});

test('deepMerge: nested + scalar override in one pass', () => {
  const merged = deepMerge<CapabilityProfile>(CONSERVATIVE_DEFAULTS, {
    colorDepth: '256',
    mouse: { sgr: true },
  });
  expect(merged.colorDepth).toBe('256');
  expect(merged.mouse.sgr).toBe(true);
  // Sibling leaves in the touched group keep their base values.
  expect(merged.mouse.drag).toBe(false);
  expect(merged.mouse.wheel).toBe(false);
});

test('deepMerge: undefined partial leaf is skipped (never clears the base)', () => {
  const base = { sgr: true, drag: true, wheel: true };
  const merged = deepMerge(base, { sgr: undefined });
  expect(merged.sgr).toBe(true);
});

test('deepMerge: does not mutate the base object', () => {
  const base = { sgr: true, drag: true, wheel: true };
  const snapshot = { ...base };
  deepMerge(base, { sgr: false });
  expect(base).toStrictEqual(snapshot);
});

test('deepMerge: nested merge does not mutate the base group', () => {
  const merged = deepMerge<CapabilityProfile>(CONSERVATIVE_DEFAULTS, {
    mouse: { sgr: true },
  });
  // The shared default group must be untouched by the merge.
  expect(CONSERVATIVE_DEFAULTS.mouse.sgr).toBe(false);
  expect(merged.mouse).not.toBe(CONSERVATIVE_DEFAULTS.mouse);
});

test('deepMerge: merging over a frozen base returns a new object, no throw', () => {
  const frozenBase = Object.freeze({ sgr: false, drag: false, wheel: false });
  const merged = deepMerge(frozenBase, { drag: true });
  expect(merged).toStrictEqual({ sgr: false, drag: true, wheel: false });
  expect(merged).not.toBe(frozenBase);
});
