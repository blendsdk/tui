/**
 * Acceptance-gate consistency spec (RD-09 FR-7, plan doc 03-05; ST-22…ST-24).
 *
 * Specification oracle: the checked-in gate doc (`docs/acceptance-gate.md`) and
 * the runnable aggregator (`scripts/gate.mjs`) must agree, so the go/no-go gate
 * never silently drifts. Asserts (ST-22) all 11 RD-09 criteria are present in the
 * doc table, (ST-23) every non-DEFERRED criterion names ≥1 existing test file, and
 * (ST-24) the script's criteria↔step map covers exactly the doc's non-deferred
 * criteria and the deferred sets match. Criterion numbering is canonical RD-09 1–11.
 *
 * The `.mjs`/`.js` extensions in the import specifiers are required by NodeNext
 * ESM resolution (the test runs under tsx).
 */
import { test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { STEPS, DEFERRED, CRITERIA } from '../../../scripts/gate.mjs';
import { monorepoRoot } from './monorepo-root.js';

const here = dirname(fileURLToPath(import.meta.url)); // packages/tui-core/test/
const GATE_DOC = join(monorepoRoot, 'docs', 'acceptance-gate.md');
const ALL_CRITERIA = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** One parsed row of the gate doc's criteria table. */
interface DocRow {
  readonly num: number;
  readonly status: string;
  readonly evidence: string;
}

/** Parse the `| # | Criterion | Status | Evidence |` rows from the gate doc. */
function parseDocRows(): DocRow[] {
  const text = readFileSync(GATE_DOC, 'utf8');
  const rows: DocRow[] = [];
  for (const line of text.split('\n')) {
    const m = /^\|\s*(\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/.exec(line);
    if (m) rows.push({ num: Number(m[1]), status: m[3].trim(), evidence: m[4].trim() });
  }
  return rows;
}

const isDeferred = (status: string): boolean => /DEFERRED/i.test(status);

test('ST-22: the gate doc names all 11 RD-09 criteria', () => {
  const nums = parseDocRows()
    .map((r) => r.num)
    .sort((a, b) => a - b);
  expect(nums).toStrictEqual(ALL_CRITERIA);
});

// Evidence test files live across both package test dirs after the monorepo split
// (engine tests in tui-core; probe tests in tui-examples).
const TEST_DIRS = [here, resolve(here, '../../tui-examples/test')];

test('ST-23: every non-DEFERRED criterion names at least one existing test file', () => {
  for (const row of parseDocRows()) {
    if (isDeferred(row.status)) continue;
    const files = row.evidence.match(/[\w.-]+\.test\.ts/g) ?? [];
    expect(files.length > 0).toBeTruthy();
    for (const f of files) {
      expect(
        TEST_DIRS.some((d) => existsSync(join(d, f))),
        f,
      ).toBeTruthy();
    }
  }
});

test('ST-24: the script criteria↔step map matches the doc (no drift)', () => {
  const rows = parseDocRows();
  const docDeferred = rows.filter((r) => isDeferred(r.status)).map((r) => r.num);
  const docRequired = rows.filter((r) => !isDeferred(r.status)).map((r) => r.num);

  const scriptDeferred = Object.keys(DEFERRED).map(Number);
  const scriptCovered = [...new Set(STEPS.flatMap((s: { criteria: number[] }) => s.criteria))];

  const asc = (a: number, b: number): number => a - b;
  expect(scriptDeferred.sort(asc)).toStrictEqual(docDeferred.sort(asc));
  expect(scriptCovered.sort(asc)).toStrictEqual(docRequired.sort(asc));

  // The CRITERIA catalogue itself must enumerate all 11.
  expect(Object.keys(CRITERIA).map(Number).sort(asc)).toStrictEqual(ALL_CRITERIA);
  // Every criterion is accounted for: either covered by a step or explicitly deferred.
  for (const n of ALL_CRITERIA) {
    const covered = scriptCovered.includes(n) || scriptDeferred.includes(n);
    expect(covered).toBeTruthy();
  }
});
