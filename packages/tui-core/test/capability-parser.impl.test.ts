/**
 * Implementation tests — bounded response parser (RD-02, Session 3.3).
 *
 * Covers the layer-2 parser internals from plan doc 03-03: each response
 * grammar (primary/secondary DA, XTVERSION DCS, `?2026` DECRPM), the 1 KB cap
 * boundary at exactly 1024 bytes (PL-8), partial-then-complete reassembly, and
 * the `write()`-throws fallback (AC-3). High priority per the testing strategy.
 */
import { test, expect } from 'vitest';

import { runQueries, RESPONSE_BUFFER_CAP } from '../src/engine/capability/query.js';
import type { TerminalQuery } from '../src/engine/capability/profile.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A stub stream over canned chunks; `write` optionally throws. */
function stubQuery(chunks: Uint8Array[], opts: { throwOnWrite?: boolean } = {}): TerminalQuery {
  return {
    write() {
      if (opts.throwOnWrite === true) {
        throw new Error('write failed');
      }
    },
    async *read(): AsyncIterable<Uint8Array> {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Each grammar is recognised and consumed (zero passthrough leak)
// ---------------------------------------------------------------------------

test('parser: primary DA is consumed (no passthrough)', async () => {
  const { passthrough } = await runQueries(stubQuery([enc.encode('\x1b[?64;1;2c')]), 200);
  expect(passthrough.length).toBe(0);
});

test('parser: secondary DA is consumed (no passthrough)', async () => {
  const { passthrough } = await runQueries(stubQuery([enc.encode('\x1b[>0;276;0c')]), 200);
  expect(passthrough.length).toBe(0);
});

test('parser: XTVERSION DCS is consumed (no passthrough)', async () => {
  // ESC P > | foot(1.0) ESC \  (DCS … ST)
  const { passthrough } = await runQueries(stubQuery([enc.encode('\x1bP>|foot(1.0)\x1b\\')]), 200);
  expect(passthrough.length).toBe(0);
});

test('parser: ?2026 DECRPM value 1 sets sync2026 true', async () => {
  const { parsed, passthrough } = await runQueries(stubQuery([enc.encode('\x1b[?2026;1$y')]), 200);
  expect(parsed.sync2026).toBe(true);
  expect(passthrough.length).toBe(0);
});

test('parser: ?2026 DECRPM value 2 (reset, but recognised) sets sync2026 true', async () => {
  const { parsed } = await runQueries(stubQuery([enc.encode('\x1b[?2026;2$y')]), 200);
  expect(parsed.sync2026).toBe(true);
});

test('parser: ?2026 DECRPM value 0 (unrecognised mode) is consumed without a hint', async () => {
  const { parsed, passthrough } = await runQueries(stubQuery([enc.encode('\x1b[?2026;0$y')]), 200);
  expect(parsed.sync2026).toBe(undefined);
  expect(passthrough.length).toBe(0); // still our query response → demuxed
});

// ---------------------------------------------------------------------------
// Demultiplexing: valid responses consumed, junk forwarded (AC-4)
// ---------------------------------------------------------------------------

test('parser: interleaved valid response + junk forwards only the junk', async () => {
  const { passthrough } = await runQueries(stubQuery([enc.encode('\x1b[?64;1;2chello')]), 200);
  expect(dec.decode(passthrough)).toBe('hello');
});

// ---------------------------------------------------------------------------
// 1 KB cap boundary (PL-8)
// ---------------------------------------------------------------------------

test('parser: exactly 1024 passthrough bytes are retained (at the cap)', async () => {
  const atCap = new Uint8Array(RESPONSE_BUFFER_CAP).fill(0x78); // 'x'
  const { passthrough } = await runQueries(stubQuery([atCap]), 200);
  expect(passthrough.length).toBe(RESPONSE_BUFFER_CAP);
});

test('parser: 1025 bytes exceed the cap → discarded, falls back', async () => {
  const overCap = new Uint8Array(RESPONSE_BUFFER_CAP + 1).fill(0x78);
  const { parsed, passthrough } = await runQueries(stubQuery([overCap]), 200);
  expect(passthrough.length).toBe(0);
  expect(parsed).toStrictEqual({});
});

// ---------------------------------------------------------------------------
// Partial-then-complete reassembly
// ---------------------------------------------------------------------------

test('parser: a DA split across two chunks is reassembled and consumed', async () => {
  const chunks = [enc.encode('\x1b[?64;1'), enc.encode(';2c')];
  const { passthrough } = await runQueries(stubQuery(chunks), 200);
  expect(passthrough.length).toBe(0);
});

// ---------------------------------------------------------------------------
// write() throws → fall back (AC-3)
// ---------------------------------------------------------------------------

test('parser: a throwing write() falls back without rejecting', async () => {
  const result = await runQueries(stubQuery([], { throwOnWrite: true }), 200);
  expect(result.parsed).toStrictEqual({});
  expect(result.passthrough.length).toBe(0);
});
