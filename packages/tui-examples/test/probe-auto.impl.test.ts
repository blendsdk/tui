/**
 * Implementation tests — auto-probes internals (RD-03, plan doc 03-03).
 *
 * Edge cases beyond the ST oracle: COLORTERM depth mapping, the method tag, and
 * oversized-response bounding (delegated to RD-02's RESPONSE_BUFFER_CAP). Real
 * PassThrough streams (no mocks).
 */
import { test, expect } from 'vitest';
import { PassThrough } from 'node:stream';

import { runAutoProbes } from '../capability-probe/auto-probes.js';
import { createTerminalQuery } from '@jsvision/core';
import type { TerminalQuery } from '@jsvision/core';

/** A terminal that never responds — relies on the bounded timeout. */
function silentQuery(): TerminalQuery {
  async function* nothing(): AsyncGenerator<Uint8Array> {
    await new Promise<void>(() => {});
  }
  return { write(): void {}, read: () => nothing() };
}

test('COLORTERM=truecolor maps to color.truecolor and color.256 true', async () => {
  const results = await runAutoProbes({
    query: silentQuery(),
    env: { COLORTERM: 'truecolor' },
    platform: 'linux',
    timeoutMs: 30,
  });
  expect(results['color.truecolor'].supported).toBe(true);
  expect(results['color.256'].supported).toBe(true);
});

test('a plain xterm TERM is not reported as truecolor', async () => {
  const results = await runAutoProbes({
    query: silentQuery(),
    env: { TERM: 'xterm' },
    platform: 'linux',
    timeoutMs: 30,
  });
  expect(results['color.truecolor'].supported).toBe(false);
});

test('every auto result is tagged method:auto', async () => {
  const results = await runAutoProbes({ query: silentQuery(), env: {}, platform: 'linux', timeoutMs: 30 });
  for (const value of Object.values(results)) {
    expect(value.method).toBe('auto');
  }
});

test('an oversized response does not hang or crash the auto phase', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const query = createTerminalQuery({ input, output });
  let flooded = false;
  output.on('data', () => {
    if (!flooded) {
      flooded = true;
      input.write(Buffer.alloc(2000, 0x41)); // exceeds RESPONSE_BUFFER_CAP (1024) → discarded
    }
  });
  try {
    const results = await runAutoProbes({ query, env: {}, platform: 'linux', timeoutMs: 100 });
    expect(results['output.sync2026'].supported).toBe(false);
  } finally {
    query.close();
  }
});
