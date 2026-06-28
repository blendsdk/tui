/**
 * Implementation tests — report builder internals (RD-03, plan doc 03-04).
 *
 * Edge cases beyond the ST oracle: table header/markers/recommendation line,
 * JSON round-trip, and provided results overriding the null default.
 */
import { test, expect } from 'vitest';

import { buildReport, deriveRecommendation, renderTable, renderJson } from '../capability-probe/report.js';
import { gatherEnvMeta } from '../capability-probe/env-meta.js';
import { resolveCapabilities } from '@jsvision/core';

const META = gatherEnvMeta({
  env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  platform: 'linux',
  now: () => '2026-06-28T00:00:00.000Z',
});
const CAPS = resolveCapabilities({ env: { COLORTERM: 'truecolor' }, platform: 'linux' }).profile;

test('renderTable shows the terminal header, group sections, and recommendation', () => {
  const report = buildReport({
    meta: META,
    results: {},
    recommendation: deriveRecommendation({ caps: CAPS, results: {} }),
  });
  const table = renderTable(report);
  expect(table.includes('xterm-256color')).toBeTruthy();
  expect(table.includes('truecolor')).toBeTruthy();
  expect(table.includes('[color]') && table.includes('[osc]')).toBeTruthy();
  expect(table.includes('Recommendation:')).toBeTruthy();
});

test('renderTable marks yes / no / ? per result', () => {
  const results = {
    'attr.bold': { supported: true as const, method: 'manual' as const },
    'attr.dim': { supported: false as const, method: 'manual' as const },
  };
  const table = renderTable(
    buildReport({ meta: META, results, recommendation: deriveRecommendation({ caps: CAPS, results }) }),
  );
  expect(table.includes('yes  bold')).toBeTruthy();
  expect(table.includes('no  dim')).toBeTruthy();
  expect(table.includes('?  italic')).toBeTruthy();
});

test('renderJson round-trips to an equal object', () => {
  const report = buildReport({
    meta: META,
    results: {},
    recommendation: deriveRecommendation({ caps: CAPS, results: {} }),
  });
  expect(JSON.parse(renderJson(report))).toStrictEqual(report);
});

test('a provided result overrides the null default', () => {
  const results = { 'attr.bold': { supported: true as const, method: 'manual' as const } };
  const report = buildReport({ meta: META, results, recommendation: deriveRecommendation({ caps: CAPS, results }) });
  expect(report.results['attr.bold'].supported).toBe(true);
  expect(report.results['attr.dim'].supported).toBe(null);
});
