/**
 * Implementation tests — VERSION internals (RD-01, Session 1.3).
 *
 * Edge/shape checks that go beyond the specification oracle: the exported
 * VERSION must be a well-formed SemVer `X.Y.Z` core string. Derived from the
 * implementation contract (PL-6: SemVer versioning), not a public AC.
 */
import { test, expect } from 'vitest';

import { VERSION } from '../src/engine/version.js';

// A SemVer core version: three dot-separated numeric identifiers with no
// leading zeros (pre-release/build metadata are out of scope for the foundation).
const SEMVER_CORE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

test('VERSION matches the SemVer X.Y.Z core shape', () => {
  expect(VERSION).toMatch(SEMVER_CORE);
});

test('VERSION has exactly three numeric segments', () => {
  const segments = VERSION.split('.');
  expect(segments.length).toBe(3);
  for (const segment of segments) {
    expect(/^\d+$/.test(segment)).toBeTruthy();
  }
});
