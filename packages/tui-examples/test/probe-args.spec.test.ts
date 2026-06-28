/**
 * Specification tests — CLI arg parser (RD-03, plan doc 03-02).
 *
 * Oracle source: 07-testing-strategy.md ST-1…ST-7 (CLI surface, AR-7). Expectations
 * derive from the requirements' CLI table, not from the implementation.
 */
import { test, expect } from 'vitest';

import { parseArgs } from '../capability-probe/args.js';

// ST-1: defaults.
test('ST-1: no flags yields the default options', () => {
  const result = parseArgs([]);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.args).toStrictEqual({ auto: false, out: null, matrix: true, help: false });
});

// ST-2: --auto.
test('ST-2: --auto sets auto', () => {
  const result = parseArgs(['--auto']);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.args.auto).toBe(true);
});

// ST-3: --out <path>.
test('ST-3: --out captures the path', () => {
  const result = parseArgs(['--out', 'r.json']);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.args.out).toBe('r.json');
});

// ST-4: --no-matrix.
test('ST-4: --no-matrix disables the matrix append', () => {
  const result = parseArgs(['--no-matrix']);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.args.matrix).toBe(false);
});

// ST-5: --help.
test('ST-5: --help sets help', () => {
  const result = parseArgs(['--help']);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.args.help).toBe(true);
});

// ST-6: unknown flag is an error.
test('ST-6: an unknown flag yields an error result', () => {
  const result = parseArgs(['--bogus']);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.length > 0).toBeTruthy();
});

// ST-7: --out without a value is an error.
test('ST-7: --out without a value yields an error result', () => {
  const result = parseArgs(['--out']);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.length > 0).toBeTruthy();
});
