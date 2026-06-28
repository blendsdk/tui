/**
 * Input-corpus runner implementation tests (RD-09 FR-1, plan doc 03-01).
 *
 * Edge cases and internals of the corpus runner: the `hexToBytes` security
 * boundary (malformed-hex rejection), `splitChunks` range checking, empty-file
 * handling, single-vs-multi-chunk equivalence, and the events/queries channel
 * separation. Complements the spec runner's contract-driven cases.
 *
 * The `.js` extension in the import specifier is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDecoderState, decode, flush } from '../src/engine/index.js';
import type { InputEvent } from '../src/engine/index.js';
import { hexToBytes, splitChunks, loadCorpusFiles } from './input-corpus-helpers.js';

test('hexToBytes parses valid lowercase hex', () => {
  expect(Array.from(hexToBytes('1b5b41'))).toStrictEqual([0x1b, 0x5b, 0x41]);
  expect(Array.from(hexToBytes(''))).toStrictEqual([]);
});

test('hexToBytes rejects odd-length hex (no silent mis-decode)', () => {
  expect(() => hexToBytes('1b5')).toThrow(/malformed bytesHex/);
});

test('hexToBytes rejects non-[0-9a-f] bytes (uppercase, letters, separators)', () => {
  expect(() => hexToBytes('1B5b41')).toThrow(/malformed bytesHex/); // uppercase B
  expect(() => hexToBytes('1b5g41')).toThrow(/malformed bytesHex/); // 'g'
  expect(() => hexToBytes('1b 5b')).toThrow(/malformed bytesHex/); // space
});

test('splitChunks(null) yields a single chunk equal to the whole input', () => {
  const bytes = hexToBytes('1b5b41');
  const chunks = splitChunks(bytes, null);
  expect(chunks.length).toBe(1);
  expect(Array.from(chunks[0])).toStrictEqual([0x1b, 0x5b, 0x41]);
});

test('splitChunks rejects out-of-range / non-ascending offsets', () => {
  const bytes = hexToBytes('1b5b41'); // length 3
  expect(() => splitChunks(bytes, [0])).toThrow(/chunk offset out of range/); // 0 not allowed
  expect(() => splitChunks(bytes, [3])).toThrow(/chunk offset out of range/); // >= length
  expect(() => splitChunks(bytes, [2, 1])).toThrow(/chunk offset out of range/); // non-ascending
});

/** Decode helper mirroring the runner's chunk+flush loop (events only). */
function decodeEvents(bytes: Uint8Array, chunks: number[] | null): InputEvent[] {
  let state = createDecoderState();
  const events: InputEvent[] = [];
  for (const chunk of splitChunks(bytes, chunks)) {
    const r = decode(chunk, state);
    events.push(...r.events);
    state = r.state;
  }
  events.push(...flush(state).events);
  return events;
}

test('single-chunk and multi-chunk decoding are equivalent (state threading)', () => {
  const bytes = hexToBytes('1b5b41'); // arrow up
  expect(decodeEvents(bytes, null)).toStrictEqual(decodeEvents(bytes, [1, 2]));
});

test('a query reply is routed to queries, never events (channel separation)', () => {
  const bytes = hexToBytes('1b5b3f3163'); // ESC[?1c — primary DA
  const r = decode(bytes, createDecoderState());
  expect(r.events).toStrictEqual([]);
  expect(r.queries.length).toBe(1);
  expect(r.queries[0].kind).toBe('da1');
});

test('an empty corpus file contributes no cases and does not crash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rd09-corpus-'));
  try {
    writeFileSync(join(dir, 'empty.json'), '[]');
    const files = loadCorpusFiles(dir);
    expect(files.length).toBe(1);
    expect(files[0].name).toBe('empty.json');
    expect(files[0].cases).toStrictEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
