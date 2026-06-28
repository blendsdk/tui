/**
 * Specification tests — terminal-matrix accumulation (RD-03, plan doc 03-04).
 *
 * Oracle source: 07-testing-strategy.md ST-13/14/15 (RD Should-Have, AR-6). The
 * matrix is a JSON array of report objects; each run appends one. Expectations
 * derive from the spec, not the implementation. The fs seam is in-memory (no disk).
 */
import { test, expect } from 'vitest';

import { appendToMatrix } from '../capability-probe/matrix.js';
import type { MatrixFs } from '../capability-probe/matrix.js';
import { buildReport, deriveRecommendation } from '../capability-probe/report.js';
import { gatherEnvMeta } from '../capability-probe/env-meta.js';
import { resolveCapabilities } from '@jsvision/core';
import type { Report } from '../capability-probe/report.js';

const CAPS = resolveCapabilities({ env: {}, platform: 'linux' }).profile;

function sampleReport(terminal: string): Report {
  const meta = gatherEnvMeta({ env: { TERM: terminal }, platform: 'linux', now: () => '2026-06-28T00:00:00.000Z' });
  return buildReport({ meta, results: {}, recommendation: deriveRecommendation({ caps: CAPS, results: {} }) });
}

/** In-memory MatrixFs holding a single file's content. */
function memFs(initial: string | null): MatrixFs & { content: () => string | null } {
  let store = initial;
  return {
    readFile: () => store,
    writeFile: (_path, data) => {
      store = data;
    },
    content: () => store,
  };
}

// ST-13: appending to an absent matrix yields a 1-element array.
test('ST-13: append to an absent matrix creates a single-element array', () => {
  const fs = memFs(null);
  const result = appendToMatrix({ fs, path: 'terminal-matrix.json', report: sampleReport('xterm') });
  expect(result.length).toBe(1);
  expect(result[0].term).toBe('xterm');
  expect(fs.content() !== null).toBeTruthy();
});

// ST-14: appending to an existing matrix preserves prior entries in order.
test('ST-14: append to an existing matrix yields N+1 preserving order', () => {
  const first = sampleReport('alacritty');
  const fs = memFs(JSON.stringify([first], null, 2));
  const result = appendToMatrix({ fs, path: 'terminal-matrix.json', report: sampleReport('kitty') });
  expect(result.length).toBe(2);
  expect(result[0].term).toBe('alacritty');
  expect(result[1].term).toBe('kitty');
});

// ST-15: the written content parses as a JSON array of reports.
test('ST-15: the written matrix is a JSON array', () => {
  const fs = memFs(null);
  appendToMatrix({ fs, path: 'terminal-matrix.json', report: sampleReport('xterm') });
  const parsed: unknown = JSON.parse(fs.content() ?? 'null');
  expect(Array.isArray(parsed)).toBeTruthy();
  expect((parsed as Report[]).length).toBe(1);
});
