/**
 * Implementation tests — the typed error model (RD-08; AR-7).
 *
 * The `instanceof` chain (subclass → TuiError → Error) and the per-subclass
 * `name`, so a broad `catch (e) { if (e instanceof TuiError) }` works and stacks
 * read with the concrete name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TuiError, EssentialsNotMetError, LoggerConfigError } from '../src/engine/safety/index.js';

test('EssentialsNotMetError is a TuiError and an Error, named correctly', () => {
  const err = new EssentialsNotMetError(['interactive TTY']);
  assert.ok(err instanceof EssentialsNotMetError);
  assert.ok(err instanceof TuiError);
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'EssentialsNotMetError');
  assert.deepEqual(err.missing, ['interactive TTY']);
});

test('LoggerConfigError is a TuiError and an Error, named correctly', () => {
  const err = new LoggerConfigError('bad sink');
  assert.ok(err instanceof LoggerConfigError);
  assert.ok(err instanceof TuiError);
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'LoggerConfigError');
  assert.equal(err.message, 'bad sink');
});

test('the TuiError base reports its own name', () => {
  const err = new TuiError('base');
  assert.equal(err.name, 'TuiError');
  assert.ok(err instanceof Error);
});

test('EssentialsNotMetError joins multiple missing essentials into its message', () => {
  const err = new EssentialsNotMetError(['interactive TTY', 'another thing']);
  assert.match(err.message, /interactive TTY/);
  assert.match(err.message, /another thing/);
});
