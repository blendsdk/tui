/**
 * Implementation tests — the typed error model (RD-08; AR-7).
 *
 * The `instanceof` chain (subclass → TuiError → Error) and the per-subclass
 * `name`, so a broad `catch (e) { if (e instanceof TuiError) }` works and stacks
 * read with the concrete name.
 */
import { test, expect } from 'vitest';

import { TuiError, EssentialsNotMetError, LoggerConfigError } from '../src/engine/safety/index.js';

test('EssentialsNotMetError is a TuiError and an Error, named correctly', () => {
  const err = new EssentialsNotMetError(['interactive TTY']);
  expect(err instanceof EssentialsNotMetError).toBeTruthy();
  expect(err instanceof TuiError).toBeTruthy();
  expect(err instanceof Error).toBeTruthy();
  expect(err.name).toBe('EssentialsNotMetError');
  expect(err.missing).toStrictEqual(['interactive TTY']);
});

test('LoggerConfigError is a TuiError and an Error, named correctly', () => {
  const err = new LoggerConfigError('bad sink');
  expect(err instanceof LoggerConfigError).toBeTruthy();
  expect(err instanceof TuiError).toBeTruthy();
  expect(err instanceof Error).toBeTruthy();
  expect(err.name).toBe('LoggerConfigError');
  expect(err.message).toBe('bad sink');
});

test('the TuiError base reports its own name', () => {
  const err = new TuiError('base');
  expect(err.name).toBe('TuiError');
  expect(err instanceof Error).toBeTruthy();
});

test('EssentialsNotMetError joins multiple missing essentials into its message', () => {
  const err = new EssentialsNotMetError(['interactive TTY', 'another thing']);
  expect(err.message).toMatch(/interactive TTY/);
  expect(err.message).toMatch(/another thing/);
});
