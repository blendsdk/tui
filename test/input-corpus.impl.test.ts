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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDecoderState, decode, flush } from '../src/engine/index.js';
import type { InputEvent } from '../src/engine/index.js';
import { hexToBytes, splitChunks, loadCorpusFiles } from './input-corpus-helpers.js';

test('hexToBytes parses valid lowercase hex', () => {
  assert.deepEqual(Array.from(hexToBytes('1b5b41')), [0x1b, 0x5b, 0x41]);
  assert.deepEqual(Array.from(hexToBytes('')), []);
});

test('hexToBytes rejects odd-length hex (no silent mis-decode)', () => {
  assert.throws(() => hexToBytes('1b5'), /malformed bytesHex/);
});

test('hexToBytes rejects non-[0-9a-f] bytes (uppercase, letters, separators)', () => {
  assert.throws(() => hexToBytes('1B5b41'), /malformed bytesHex/); // uppercase B
  assert.throws(() => hexToBytes('1b5g41'), /malformed bytesHex/); // 'g'
  assert.throws(() => hexToBytes('1b 5b'), /malformed bytesHex/); // space
});

test('splitChunks(null) yields a single chunk equal to the whole input', () => {
  const bytes = hexToBytes('1b5b41');
  const chunks = splitChunks(bytes, null);
  assert.equal(chunks.length, 1);
  assert.deepEqual(Array.from(chunks[0]), [0x1b, 0x5b, 0x41]);
});

test('splitChunks rejects out-of-range / non-ascending offsets', () => {
  const bytes = hexToBytes('1b5b41'); // length 3
  assert.throws(() => splitChunks(bytes, [0]), /chunk offset out of range/); // 0 not allowed
  assert.throws(() => splitChunks(bytes, [3]), /chunk offset out of range/); // >= length
  assert.throws(() => splitChunks(bytes, [2, 1]), /chunk offset out of range/); // non-ascending
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
  assert.deepEqual(decodeEvents(bytes, null), decodeEvents(bytes, [1, 2]));
});

test('a query reply is routed to queries, never events (channel separation)', () => {
  const bytes = hexToBytes('1b5b3f3163'); // ESC[?1c — primary DA
  const r = decode(bytes, createDecoderState());
  assert.deepEqual(r.events, []);
  assert.equal(r.queries.length, 1);
  assert.equal(r.queries[0].kind, 'da1');
});

test('an empty corpus file contributes no cases and does not crash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rd09-corpus-'));
  try {
    writeFileSync(join(dir, 'empty.json'), '[]');
    const files = loadCorpusFiles(dir);
    assert.equal(files.length, 1);
    assert.equal(files[0].name, 'empty.json');
    assert.deepEqual(files[0].cases, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
