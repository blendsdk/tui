/**
 * Implementation tests — engine TerminalQuery internals (RD-03, plan doc 03-01).
 *
 * Edge cases beyond the ST oracle: byte buffering between iterations, listener
 * detach on `return()`, `close()` idempotency, and graceful end on a stream error.
 * Real `PassThrough` streams (no mocks).
 */
import { test, expect } from 'vitest';
import { PassThrough } from 'node:stream';

import { createTerminalQuery } from '../src/engine/host/terminal-query.js';

test('bytes arriving between iterations are queued and delivered in order', async () => {
  const input = new PassThrough();
  const query = createTerminalQuery({ input });
  const iterator = query.read()[Symbol.asyncIterator]();
  try {
    input.write(Buffer.from([1, 2]));
    input.write(Buffer.from([3, 4]));
    await new Promise((resolve) => setImmediate(resolve)); // let both 'data' events queue
    const first = await iterator.next();
    const second = await iterator.next();
    expect(Array.from(first.value as Uint8Array)).toStrictEqual([1, 2]);
    expect(Array.from(second.value as Uint8Array)).toStrictEqual([3, 4]);
  } finally {
    await iterator.return?.(undefined);
    query.close();
  }
});

test('return() detaches the input listeners', async () => {
  const input = new PassThrough();
  const query = createTerminalQuery({ input });
  const iterator = query.read()[Symbol.asyncIterator]();
  expect(input.listenerCount('data')).toBe(1);
  await iterator.return?.(undefined);
  expect(input.listenerCount('data')).toBe(0);
  query.close();
});

test('close() is idempotent and ends a pending read as done', async () => {
  const input = new PassThrough();
  const query = createTerminalQuery({ input });
  const iterator = query.read()[Symbol.asyncIterator]();
  const pending = iterator.next();
  query.close();
  query.close(); // idempotent — must not throw
  const result = await pending;
  expect(result.done).toBe(true);
});

test('a stream error ends iteration cleanly without throwing', async () => {
  const input = new PassThrough();
  const query = createTerminalQuery({ input });
  const iterator = query.read()[Symbol.asyncIterator]();
  const pending = iterator.next();
  input.emit('error', new Error('boom')); // handled by the adapter, not unhandled
  const result = await pending;
  expect(result.done).toBe(true);
  query.close();
});
