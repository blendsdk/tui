/**
 * Specification tests — non-TTY interactive boundary (RD-03, plan doc 03-02).
 *
 * Oracle source: 07-testing-strategy.md ST-22 (RD AC-6). An interactive (non --auto)
 * invocation without a TTY must print a clear message and exit WITHOUT entering
 * alt-screen or raw mode. Expectations derive from AC-6, not from the implementation.
 */
import { test, expect } from 'vitest';
import { PassThrough, Writable } from 'node:stream';

import { main } from '../capability-probe/main.js';

/** A Writable that captures everything written, synchronously. */
function capture(): { stream: Writable; text: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb): void {
      chunks.push(chunk.toString('utf8'));
      cb();
    },
  });
  return { stream, text: () => chunks.join('') };
}

// ST-22: interactive run on a non-TTY prints a message and exits without alt-screen.
test('ST-22: non-TTY interactive invocation exits without entering alt-screen', async () => {
  const out = capture();
  const err = capture();
  let exitCode: number | null = null;

  await main({
    argv: [],
    env: {},
    platform: 'linux',
    isTty: () => false,
    input: new PassThrough(),
    output: out.stream,
    stdout: out.stream,
    stderr: err.stream,
    exit: (code: number) => {
      exitCode = code;
    },
    now: () => '2026-06-28T00:00:00.000Z',
  });

  expect(err.text().length > 0).toBeTruthy();
  expect(exitCode).toBe(1);
  expect(!out.text().includes('?1049h')).toBeTruthy();
  expect(!out.text().includes('?1000')).toBeTruthy();
});
