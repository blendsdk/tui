/**
 * Data-driven Tier-1 input-corpus regression runner (RD-09 FR-1, plan doc 03-01).
 *
 * Specification oracle (ST-1…ST-7): every `bytes → expected events/queries`
 * expectation is authored from the RD-06 event contract and the classic xterm /
 * SGR / bracketed-paste grammars — never by running the decoder and copying its
 * output. The corpus is the checked-in, shareable evidence base; this file just
 * iterates it. If a case fails after implementation, the **engine** is wrong, not
 * the fixture (AR-8) — provided the fixture matches the contract.
 *
 * Each record feeds its bytes to `decode()` (optionally split into chunks to
 * exercise cross-chunk state threading, RD-06 RT-1), then calls `flush()`, and
 * asserts both the app-facing `events` and the isolated `queries` channel (PL-9).
 * Pure helpers live in `input-corpus-helpers.ts` so the impl tests can reuse them
 * without re-registering these tests.
 *
 * The `.js` extension in the import specifier is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
import { test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDecoderState, decode, flush } from '../src/engine/index.js';
import type { DecodeOptions, InputEvent } from '../src/engine/index.js';
import { hexToBytes, loadCorpusFiles, splitChunks } from './input-corpus-helpers.js';
import type { CorpusRecord, ExpectedQuery } from './input-corpus-helpers.js';

const here = dirname(fileURLToPath(import.meta.url)); // test/
const CORPUS_DIR = join(here, 'fixtures', 'input-corpus');

/** Decode one record's bytes (chunked + flush), collecting events and query classifications. */
function runRecord(record: CorpusRecord): { events: InputEvent[]; queries: ExpectedQuery[] } {
  const opts: DecodeOptions | undefined = record.pasteCap !== undefined ? { pasteCap: record.pasteCap } : undefined;
  const bytes = hexToBytes(record.bytesHex);
  let state = createDecoderState();
  const events: InputEvent[] = [];
  const queries: ExpectedQuery[] = [];
  for (const chunk of splitChunks(bytes, record.chunks)) {
    const result = decode(chunk, state, opts);
    events.push(...result.events);
    for (const q of result.queries) queries.push({ kind: q.kind });
    state = result.state;
  }
  const flushed = flush(state, opts);
  events.push(...flushed.events);
  for (const q of flushed.queries) queries.push({ kind: q.kind });
  return { events, queries };
}

for (const file of loadCorpusFiles(CORPUS_DIR)) {
  for (const record of file.cases) {
    test(`corpus: ${file.name} / ${record.name}`, () => {
      const { events, queries } = runRecord(record);
      expect(events).toStrictEqual(record.expectedEvents);
      expect(queries).toStrictEqual(record.expectedQueries ?? []);
    });
  }
}
