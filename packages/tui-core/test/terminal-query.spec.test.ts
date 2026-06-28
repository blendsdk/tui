/**
 * Specification tests — engine TerminalQuery (RD-03, plan doc 03-01).
 *
 * Oracle source: 07-testing-strategy.md ST-19/20/21. Expectations derive from the
 * spec (a real tty-backed `createTerminalQuery` that writes requests and yields
 * response bytes, usable by `resolveCapabilitiesAsync`), NOT from the implementation.
 *
 * Streams are real `PassThrough`s (no mocks); the DECRPM response bytes are a VT
 * protocol fact (`CSI ? 2026 ; Ps $ y`, Ps≠0 ⇒ supported).
 */
import { test, expect } from 'vitest';
import { PassThrough } from 'node:stream';

import { createTerminalQuery } from '../src/engine/host/terminal-query.js';
import { resolveCapabilitiesAsync } from '../src/engine/capability/index.js';

// ST-19: write() writes the exact request bytes to the output stream.
test('ST-19: write() emits the request bytes to the output stream', async () => {
  const output = new PassThrough();
  const query = createTerminalQuery({ output });
  try {
    const received = new Promise<Buffer>((resolve) => output.once('data', (c: Buffer) => resolve(c)));
    query.write('\x1b[c');
    const chunk = await received;
    expect(Buffer.from(chunk).toString('latin1')).toBe('\x1b[c');
  } finally {
    query.close();
  }
});

// ST-20: read() yields input bytes as a Uint8Array.
test('ST-20: read() yields received input bytes as a Uint8Array', async () => {
  const input = new PassThrough();
  const query = createTerminalQuery({ input });
  try {
    const iterator = query.read()[Symbol.asyncIterator]();
    input.write(Buffer.from([0x1b, 0x5b, 0x63])); // ESC [ c
    const { value, done } = await iterator.next();
    expect(done).toBe(false);
    expect(value instanceof Uint8Array).toBeTruthy();
    expect(Array.from(value as Uint8Array)).toStrictEqual([0x1b, 0x5b, 0x63]);
    await iterator.return?.(undefined);
  } finally {
    query.close();
  }
});

// ST-21: the query drives resolveCapabilitiesAsync against a scripted terminal.
test('ST-21: a scripted ?2026 reply flows through resolveCapabilitiesAsync', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const query = createTerminalQuery({ input, output });

  // Simulate a terminal: when the ?2026 DECRQM request is written, reply "supported".
  let replied = false;
  output.on('data', (c: Buffer) => {
    if (!replied && c.toString('latin1').includes('2026')) {
      replied = true;
      input.write(Buffer.from('\x1b[?2026;2$y', 'latin1')); // DECRPM Ps=2 ⇒ supported
    }
  });

  try {
    const { profile } = await resolveCapabilitiesAsync({
      query,
      env: {},
      platform: 'linux',
      timeoutMs: 100,
      refresh: true,
    });
    expect(profile.sync2026).toBe(true);
  } finally {
    query.close();
  }
});
