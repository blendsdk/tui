/**
 * Implementation tests — CLI arg parser internals (RD-03, plan doc 03-02).
 *
 * Edge cases beyond the ST oracle: usage text, combined flags, a flag-like value
 * after --out, and last-wins for a repeated --out.
 */
import { test, expect } from 'vitest';

import { parseArgs, USAGE } from '../capability-probe/args.js';

test('USAGE documents every flag', () => {
  for (const flag of ['--auto', '--out', '--no-matrix', '--help']) {
    expect(USAGE.includes(flag)).toBeTruthy();
  }
});

test('combined flags parse together', () => {
  const result = parseArgs(['--auto', '--no-matrix', '--out', 'f.json']);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.args).toStrictEqual({ auto: true, out: 'f.json', matrix: false, help: false });
});

test('--out followed by another flag is an error (missing value)', () => {
  const result = parseArgs(['--out', '--auto']);
  expect(result.ok).toBe(false);
});

test('a repeated --out keeps the last value', () => {
  const result = parseArgs(['--out', 'a.json', '--out', 'b.json']);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.args.out).toBe('b.json');
});
