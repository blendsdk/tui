/**
 * Implementation tests — VERSION internals (RD-01, Session 1.3).
 *
 * Edge/shape checks that go beyond the specification oracle: the exported
 * VERSION must be a well-formed SemVer `X.Y.Z` core string. Derived from the
 * implementation contract (PL-6: SemVer versioning), not a public AC.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VERSION } from './version.js';

// A SemVer core version: three dot-separated numeric identifiers with no
// leading zeros (pre-release/build metadata are out of scope for the foundation).
const SEMVER_CORE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

test('VERSION matches the SemVer X.Y.Z core shape', () => {
  assert.match(VERSION, SEMVER_CORE);
});

test('VERSION has exactly three numeric segments', () => {
  const segments = VERSION.split('.');
  assert.equal(segments.length, 3);
  for (const segment of segments) {
    assert.ok(/^\d+$/.test(segment), `segment "${segment}" is not numeric`);
  }
});
