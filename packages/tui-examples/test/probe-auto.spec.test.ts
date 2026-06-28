/**
 * Specification tests — auto-probes (RD-03, plan doc 03-03).
 *
 * Oracle source: 07-testing-strategy.md ST-16/17/18 (RD §Auto, AR-9, AR-15, RT-3).
 * Auto-probes drive the live query through the public resolveCapabilitiesAsync and
 * record profile-derived facts as `method:'auto'`. Expectations derive from the
 * spec, not the implementation.
 *
 * The live query is a real createTerminalQuery over PassThrough streams; the DECRPM
 * response bytes are a VT protocol fact (`CSI ? 2026 ; Ps $ y`, Ps≠0 ⇒ supported).
 */
import { test, expect } from 'vitest';
import { PassThrough } from 'node:stream';

import { runAutoProbes } from '../capability-probe/auto-probes.js';
import { createTerminalQuery } from '@jsvision/core';
import type { TerminalQuery } from '@jsvision/core';

/** A terminal that never responds — read() yields nothing (relies on the bounded timeout). */
function silentQuery(): TerminalQuery {
  async function* nothing(): AsyncGenerator<Uint8Array> {
    await new Promise<void>(() => {}); // never yields; the timeout settles the probe
  }
  return {
    write(): void {},
    read(): AsyncIterable<Uint8Array> {
      return nothing();
    },
  };
}

// ST-16: a live ?2026 reply is recorded as output.sync2026 (auto).
test('ST-16: a ?2026 "supported" reply is recorded as output.sync2026 (auto)', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const query = createTerminalQuery({ input, output });
  let replied = false;
  output.on('data', (c: Buffer) => {
    if (!replied && c.toString('latin1').includes('2026')) {
      replied = true;
      input.write(Buffer.from('\x1b[?2026;2$y', 'latin1'));
    }
  });
  try {
    const results = await runAutoProbes({ query, env: {}, platform: 'linux', timeoutMs: 100 });
    expect(results['output.sync2026']).toStrictEqual({ supported: true, method: 'auto' });
  } finally {
    query.close();
  }
});

// ST-17: COLORTERM=truecolor is recorded as color.truecolor (auto).
test('ST-17: COLORTERM=truecolor is recorded as color.truecolor (auto)', async () => {
  const results = await runAutoProbes({
    query: silentQuery(),
    env: { COLORTERM: 'truecolor' },
    platform: 'linux',
    timeoutMs: 50,
  });
  expect(results['color.truecolor']).toStrictEqual({ supported: true, method: 'auto' });
});

// ST-18: a silent terminal settles without hanging; sync2026 is unsupported.
test('ST-18: a silent terminal settles and records output.sync2026 false (auto)', async () => {
  const results = await runAutoProbes({
    query: silentQuery(),
    env: {},
    platform: 'linux',
    timeoutMs: 50,
  });
  expect(results['output.sync2026'].supported).toBe(false);
  expect(results['output.sync2026'].method).toBe('auto');
});
