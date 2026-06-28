/**
 * Specification tests — env-meta security boundary (RD-03, plan doc 03-02).
 *
 * Oracle source: 07-testing-strategy.md ST-28 (RD AC-8 / AR-17). Only allowlisted env
 * keys may appear in the metadata; no other environment value may leak. Expectations
 * derive from the security requirement, not from the implementation.
 */
import { test, expect } from 'vitest';

import { gatherEnvMeta } from '../capability-probe/env-meta.js';

// ST-28: allowlisted env is recorded; secrets are never copied anywhere.
test('ST-28: only allowlisted env keys are recorded; secrets do not leak', () => {
  const meta = gatherEnvMeta({
    env: {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      SECRET: 'topsecret-value',
      AWS_SECRET_ACCESS_KEY: 'aws-leak-value',
    },
    platform: 'linux',
    now: () => '2026-06-28T00:00:00.000Z',
  });

  expect(meta.term).toBe('xterm-256color');
  expect(meta.colorterm).toBe('truecolor');
  expect(meta.os).toBe('linux');
  expect(meta.timestamp).toBe('2026-06-28T00:00:00.000Z');

  // No secret value may appear anywhere in the serialized metadata.
  const serialized = JSON.stringify(meta);
  expect(!serialized.includes('topsecret-value')).toBeTruthy();
  expect(!serialized.includes('aws-leak-value')).toBeTruthy();
});
