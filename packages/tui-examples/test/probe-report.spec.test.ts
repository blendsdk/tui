/**
 * Specification tests — report builder & recommendation (RD-03, plan doc 03-04).
 *
 * Oracle source: 07-testing-strategy.md ST-8/9/10/11 (RD AC-4/AC-5, AR-10/AR-11).
 * Expectations derive from the report schema and the recommendation rule, not the
 * implementation.
 */
import { test, expect } from 'vitest';

import { buildReport, deriveRecommendation } from '../capability-probe/report.js';
import { gatherEnvMeta } from '../capability-probe/env-meta.js';
import { runAutoProbes } from '../capability-probe/auto-probes.js';
import { PROBES } from '../capability-probe/taxonomy.js';
import { resolveCapabilities } from '@jsvision/core';
import type { TerminalQuery } from '@jsvision/core';

const META = gatherEnvMeta({ env: { TERM: 'xterm' }, platform: 'linux', now: () => '2026-06-28T00:00:00.000Z' });

function silentQuery(): TerminalQuery {
  async function* nothing(): AsyncGenerator<Uint8Array> {
    /* yields nothing, ends immediately */
  }
  return { write(): void {}, read: () => nothing() };
}

// ST-8: the report has every schema field.
test('ST-8: buildReport produces all schema fields', () => {
  const caps = resolveCapabilities({ env: {}, platform: 'linux' }).profile;
  const recommendation = deriveRecommendation({ caps, results: {} });
  const report = buildReport({ meta: META, results: {}, recommendation });
  for (const key of [
    'terminal',
    'version',
    'os',
    'term',
    'colorterm',
    'termProgram',
    'multiplexer',
    'timestamp',
    'results',
    'recommendation',
  ]) {
    expect(key in report).toBeTruthy();
  }
});

// ST-9: with only auto results, every manual probe is supported:null.
test('ST-9: manual probes default to supported:null when unprovided (--auto)', () => {
  const caps = resolveCapabilities({ env: {}, platform: 'linux' }).profile;
  const report = buildReport({ meta: META, results: {}, recommendation: deriveRecommendation({ caps, results: {} }) });
  for (const probe of PROBES) {
    if (probe.method === 'manual') {
      expect(report.results[probe.id]).toStrictEqual({ supported: null, method: 'manual' });
    }
  }
});

// ST-10: recommendation echoes the resolved profile's key fields.
test('ST-10: deriveRecommendation populates the key fields from the profile', () => {
  const caps = resolveCapabilities({ env: { COLORTERM: 'truecolor' }, platform: 'linux' }).profile;
  const rec = deriveRecommendation({ caps, results: {} });
  expect(rec.colorDepth).toBe('truecolor');
  expect(typeof rec.mouse).toBe('boolean');
  expect(typeof rec.unicodeWidth).toBe('string');
  expect(typeof rec.altScreen).toBe('boolean');
  expect(typeof rec.bracketedPaste).toBe('boolean');
});

// ST-11: COLORTERM=truecolor surfaces in the report's recommendation + color results.
test('ST-11: COLORTERM=truecolor surfaces as a truecolor recommendation', async () => {
  const env = { COLORTERM: 'truecolor' };
  const caps = resolveCapabilities({ env, platform: 'linux' }).profile;
  const auto = await runAutoProbes({ query: silentQuery(), env, platform: 'linux', timeoutMs: 30 });
  const report = buildReport({
    meta: META,
    results: auto,
    recommendation: deriveRecommendation({ caps, results: auto }),
  });
  expect(report.recommendation.colorDepth).toBe('truecolor');
  expect(report.results['color.truecolor'].supported).toBe(true);
});
