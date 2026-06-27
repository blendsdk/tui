/**
 * Layer-2 runtime-query seam & bounded response parser (RD-02, plan doc 03-03).
 *
 * Writes the terminal capability queries through an injected {@link TerminalQuery}
 * seam (PL-1), then reads the responses under a single bounded timeout (PL-11)
 * into a length-bounded buffer (PL-8). Recognised response sequences are parsed
 * into a capability partial and consumed; every other byte is returned as
 * `passthrough` so RD-06 can deliver genuine input to the app while query
 * responses never leak as keystrokes (AC-4).
 *
 * Security posture (AC-7): responses are untrusted. The buffer never grows past
 * {@link RESPONSE_BUFFER_CAP}; on overflow it is discarded and detection falls
 * back. Only exact, fully-terminated grammar matches become capabilities;
 * partial or malformed bytes are treated as passthrough, never as capabilities.
 * Responses are parsed as data only — no `eval`, no code execution (AC-8).
 */
import type { CapabilityProfile, DeepPartial, TerminalQuery } from './profile.js';
import { matchResponse } from './responses.js';
import type { RuntimeHint } from './responses.js';

/** Default layer-2 timeout in milliseconds (PL-11). */
export const DEFAULT_QUERY_TIMEOUT_MS = 200;

/** Maximum retained response buffer in bytes (PL-8). */
export const RESPONSE_BUFFER_CAP = 1024;

/** The capability queries issued when a seam is provided (03-03). */
const QUERY_REQUESTS: readonly string[] = [
  '\x1b[c', // Primary DA
  '\x1b[>c', // Secondary DA
  '\x1b[>q', // XTVERSION
  '\x1b[?2026$p', // Synchronized-output mode (DECRQM ?2026)
];

/** The result of a layer-2 run: parsed capabilities + bytes to forward. */
export interface QueryResult {
  /** Capabilities parsed from recognised responses (reason `'runtime'`). */
  readonly parsed: DeepPartial<CapabilityProfile>;
  /** Unrecognised bytes to forward to the app input stream (AC-4). */
  readonly passthrough: Uint8Array;
}

/** Empty result used whenever layer 2 yields nothing usable. */
const EMPTY_RESULT: QueryResult = { parsed: {}, passthrough: new Uint8Array(0) };

/**
 * Run the capability queries against a {@link TerminalQuery} seam and parse the
 * responses.
 *
 * Always resolves, never rejects (AC-3): a silent terminal hits the timeout, an
 * oversized response hits the cap, and a throwing `write()`/`read()` falls back
 * — each returns whatever was parsed plus the passthrough bytes.
 *
 * @param query The injected terminal stream seam.
 * @param timeoutMs Whole-step timeout in ms (default {@link DEFAULT_QUERY_TIMEOUT_MS}).
 * @returns The parsed capability partial and the passthrough bytes.
 */
export async function runQueries(
  query: TerminalQuery,
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS,
): Promise<QueryResult> {
  try {
    for (const request of QUERY_REQUESTS) {
      query.write(request);
    }
  } catch {
    // A failing write means we cannot query; skip layer 2 entirely (AC-3).
    return EMPTY_RESULT;
  }

  const collected = await collectBytes(query, timeoutMs);
  if (collected === null) {
    // Oversized: the buffer was discarded at the cap; fall back (AC-7).
    return EMPTY_RESULT;
  }
  return parseResponses(collected);
}

/**
 * Read bytes from the seam into a bounded buffer under a timeout.
 *
 * @returns The collected bytes, or `null` if the cap was exceeded (oversized).
 */
async function collectBytes(query: TerminalQuery, timeoutMs: number): Promise<Uint8Array | null> {
  const bytes: number[] = [];

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  // The read loop never rejects: a throwing stream resolves to 'error' so the
  // race always settles and we fall back gracefully (AC-3).
  const readLoop: Promise<'cap' | 'end' | 'error'> = (async () => {
    try {
      for await (const chunk of query.read()) {
        for (const byte of chunk) {
          bytes.push(byte);
          if (bytes.length > RESPONSE_BUFFER_CAP) {
            return 'cap';
          }
        }
      }
      return 'end';
    } catch {
      return 'error';
    }
  })();

  try {
    const outcome = await Promise.race([readLoop, timeout]);
    if (outcome === 'cap') {
      return null; // oversized → discard (AC-7)
    }
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer); // the timer is always cleared (PL-11)
    }
  }

  return Uint8Array.from(bytes);
}

/**
 * Scan a byte buffer, consuming recognised response grammars into `parsed` and
 * forwarding every other byte to `passthrough` (the demultiplexer, AC-4).
 */
function parseResponses(bytes: Uint8Array): QueryResult {
  const parsed: RuntimeHint = {};
  const passthrough: number[] = [];

  let i = 0;
  while (i < bytes.length) {
    const match = matchResponse(bytes, i);
    if (match === null) {
      passthrough.push(bytes[i]);
      i += 1;
      continue;
    }
    if (match.hint.sync2026 !== undefined) {
      parsed.sync2026 = match.hint.sync2026;
    }
    i = match.end; // consume the recognised sequence
  }

  return { parsed, passthrough: Uint8Array.from(passthrough) };
}
