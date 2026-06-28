/**
 * Implementation tests — matrix internals (RD-03, plan doc 03-04).
 *
 * Edge cases beyond the ST oracle: malformed / non-array existing files recover
 * by starting fresh (never crash), and the written file ends with a newline.
 */
import { test, expect } from 'vitest';

import { appendToMatrix } from '../capability-probe/matrix.js';
import type { MatrixFs } from '../capability-probe/matrix.js';
import { buildReport, deriveRecommendation } from '../capability-probe/report.js';
import { gatherEnvMeta } from '../capability-probe/env-meta.js';
import { resolveCapabilities } from '@jsvision/core';

const CAPS = resolveCapabilities({ env: {}, platform: 'linux' }).profile;
const REPORT = buildReport({
  meta: gatherEnvMeta({ env: { TERM: 'xterm' }, platform: 'linux', now: () => '2026-06-28T00:00:00.000Z' }),
  results: {},
  recommendation: deriveRecommendation({ caps: CAPS, results: {} }),
});

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

test('an unparseable existing file recovers by starting fresh', () => {
  const fs = memFs('not json at all {{{');
  const result = appendToMatrix({ fs, path: 'm.json', report: REPORT });
  expect(result.length).toBe(1);
});

test('a non-array JSON file recovers by starting fresh', () => {
  const fs = memFs('{"oops":true}');
  const result = appendToMatrix({ fs, path: 'm.json', report: REPORT });
  expect(result.length).toBe(1);
});

test('the written matrix ends with a trailing newline', () => {
  const fs = memFs(null);
  appendToMatrix({ fs, path: 'm.json', report: REPORT });
  expect((fs.content() ?? '').endsWith('\n')).toBeTruthy();
});
