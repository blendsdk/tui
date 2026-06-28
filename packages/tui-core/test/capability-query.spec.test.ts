/**
 * Specification tests — runtime query, parser & security (RD-02).
 *
 * Immutable oracle: expectations derive from RD-02's acceptance criteria
 * (AC-3 timeout, AC-4 demultiplex, AC-7 oversized/malformed), the component
 * spec (03-03), and the Ambiguity Register (PL-1, PL-8, PL-11, RT-2) — never
 * from reading the implementation. If a test here fails after implementation,
 * the implementation is wrong, not the test.
 *
 * Layer 2 is exercised through a STUB `TerminalQuery` (an async generator over
 * canned bytes), so no real TTY is needed and the cases are deterministic and
 * cross-platform. The async entry point is `resolveCapabilitiesAsync` (RT-2);
 * the parser contract is `runQueries`.
 */
import { test, expect } from 'vitest';

import { resolveCapabilitiesAsync } from '../src/engine/capability/index.js';
import { runQueries } from '../src/engine/capability/query.js';
import type { TerminalQuery } from '../src/engine/capability/profile.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * A stub {@link TerminalQuery} over canned byte chunks. With `neverEnd: true`
 * the stream yields its chunks (if any) and then blocks forever, modelling a
 * terminal that does not reply.
 */
function stubQuery(chunks: Uint8Array[], opts: { neverEnd?: boolean } = {}): TerminalQuery {
  return {
    write() {
      /* requests are discarded by the stub */
    },
    async *read(): AsyncIterable<Uint8Array> {
      for (const chunk of chunks) {
        yield chunk;
      }
      if (opts.neverEnd === true) {
        await new Promise<void>(() => {
          /* never resolves: models a silent terminal */
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// AC-3 — timeout on a silent terminal
// ---------------------------------------------------------------------------

// ST-13: a query that never replies must time out within timeoutMs, fall back,
// and never reject.
test('ST-13: silent terminal times out, falls back, never rejects', async () => {
  const start = Date.now();
  const { profile, reasons } = await resolveCapabilitiesAsync({
    query: stubQuery([], { neverEnd: true }),
    timeoutMs: 100,
    env: { TERM: 'xterm' },
  });
  const elapsed = Date.now() - start;

  expect(elapsed <= 150).toBeTruthy();
  // Fell back to env/table/default — nothing came from the (silent) runtime.
  for (const reason of Object.values(reasons)) {
    expect(reason).not.toBe('runtime');
  }
  expect(Object.isFrozen(profile)).toBeTruthy();
});

// ---------------------------------------------------------------------------
// AC-4 — demultiplexing (query responses never leak to app input)
// ---------------------------------------------------------------------------

// ST-14: a DA response followed by a plain "a" — the DA is consumed and only
// "a" survives as passthrough (zero response bytes leak to the app).
test('ST-14: DA response is consumed; only non-response bytes pass through', async () => {
  const stream = concat(enc.encode('\x1b[?64;1;2c'), enc.encode('a'));
  const { passthrough } = await runQueries(stubQuery([stream]), 200);

  expect(dec.decode(passthrough)).toBe('a');
  // No escape (DA) bytes leak into the passthrough stream.
  expect(!passthrough.includes(0x1b)).toBeTruthy();
});

// ---------------------------------------------------------------------------
// AC-7 — oversized response is bounded, no crash, falls back
// ---------------------------------------------------------------------------

// ST-15: 64 KB of ESC with no terminator must be rejected within the 1 KB cap
// without throwing or hanging; detection falls back.
test('ST-15: oversized unterminated response is bounded and falls back', async () => {
  const oversized = new Uint8Array(64 * 1024).fill(0x1b);

  // runQueries itself must not throw and must return bounded results.
  const result = await runQueries(stubQuery([oversized]), 200);
  expect(result !== null && typeof result === 'object').toBeTruthy();
  expect(passthroughIsBounded(result.passthrough)).toBeTruthy();

  // The whole resolution still completes and falls back (no runtime field).
  const { profile, reasons } = await resolveCapabilitiesAsync({
    query: stubQuery([oversized]),
    timeoutMs: 200,
    env: { TERM: 'xterm' },
  });
  expect(Object.isFrozen(profile)).toBeTruthy();
  for (const reason of Object.values(reasons)) {
    expect(reason).not.toBe('runtime');
  }
});

// ---------------------------------------------------------------------------
// AC-7 — malformed (non-grammar) bytes are ignored, never become capabilities
// ---------------------------------------------------------------------------

// ST-16: random non-grammar bytes set no capability; detection falls back and
// no field is attributed to the runtime layer.
test('ST-16: malformed bytes set no capability; no field reasoned as runtime', async () => {
  const junk = enc.encode('not an escape sequence at all 12345');

  const { reasons } = await resolveCapabilitiesAsync({
    query: stubQuery([junk]),
    timeoutMs: 200,
    env: { TERM: 'xterm-256color' },
  });

  for (const [field, reason] of Object.entries(reasons)) {
    expect(reason, field).not.toBe('runtime');
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Concatenate byte chunks into a single Uint8Array. */
function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** The 1 KB response cap (PL-8); passthrough must never exceed it. */
function passthroughIsBounded(passthrough: Uint8Array): boolean {
  return passthrough.length <= 1024;
}
