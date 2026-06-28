/**
 * Specification / integration tests — public API surface (RD-02).
 *
 * Immutable oracle: derived from the RD-02 success criteria ("resolveCapabilities
 * exported from src/engine/index.ts; result deep-frozen") and the "Ambient
 * resolve" integration scenario in plan doc 07. Imports through the package's
 * single public entry point — not the capability subpath — to prove the
 * re-export wiring.
 *
 * Traceability: success criteria #4, 07 Integration/E2E.
 */
import { test, expect } from 'vitest';

import { resolveCapabilities, resolveCapabilitiesAsync } from '../src/engine/index.js';

const COLOR_DEPTHS = new Set(['mono', '16', '256', 'truecolor']);

test('public API: resolveCapabilities is exported from the package entry point', () => {
  expect(typeof resolveCapabilities).toBe('function');
  expect(typeof resolveCapabilitiesAsync).toBe('function');
});

test('public API: ambient resolve returns a frozen profile + reasons, never throws', () => {
  const { profile, reasons } = resolveCapabilities();

  expect(COLOR_DEPTHS.has(profile.colorDepth)).toBeTruthy();
  expect(Object.isFrozen(profile)).toBeTruthy();
  expect(Object.isFrozen(reasons)).toBeTruthy();
  expect(Object.isFrozen(profile.mouse)).toBeTruthy();
});

test('public API: ambient async resolve (no query) returns a frozen resolution', async () => {
  const { profile, reasons } = await resolveCapabilitiesAsync();
  expect(Object.isFrozen(profile)).toBeTruthy();
  expect(Object.isFrozen(reasons)).toBeTruthy();
});
