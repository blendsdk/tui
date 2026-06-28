/**
 * Shared input-corpus helpers (RD-09 FR-1, plan doc 03-01).
 *
 * Pure helpers for the corpus runner and its impl tests: the `hexToBytes`
 * security boundary, `splitChunks` range-checked chunking, and `loadCorpusFiles`.
 * Kept in a non-test module (mirroring `host-doubles.ts`) so importing them from
 * both the spec runner and the impl tests does not re-register the spec's tests.
 *
 * The `.js` extension in the import specifier is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InputEvent, QueryResponse } from '../src/engine/index.js';

/** A single expected query reply — the classification only (raw bytes are not asserted). */
export interface ExpectedQuery {
  readonly kind: QueryResponse['kind'];
}

/** One corpus record: input bytes (+ optional chunking) → expected events and queries. */
export interface CorpusRecord {
  readonly name: string;
  /** Lowercase, even-length, `[0-9a-f]` hex of the input bytes. */
  readonly bytesHex: string;
  /** `null` = one `decode()` call; an array of split offsets = multiple chunked calls. */
  readonly chunks: number[] | null;
  /** Optional per-case paste size-cap override (mirrors `DecodeOptions.pasteCap`). */
  readonly pasteCap?: number;
  /** The full ordered app-facing event list expected across all chunks plus `flush()`. */
  readonly expectedEvents: InputEvent[];
  /** Optional ordered query-reply classifications expected on the `queries` channel. */
  readonly expectedQueries?: ExpectedQuery[];
}

/**
 * Parse lowercase, even-length hex into bytes. The security boundary (AR-6): odd
 * length or any non-`[0-9a-f]` byte throws rather than silently mis-decoding.
 *
 * @param hex The hex string to parse.
 * @returns The decoded bytes.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/.test(hex)) {
    throw new Error(`corpus: malformed bytesHex: ${JSON.stringify(hex)}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Split bytes at the given ascending offsets into successive decode() chunks.
 * `null` yields a single chunk. An out-of-range or non-ascending offset throws
 * (a fixture-authoring bug surfaced loudly, AR-6).
 *
 * @param bytes The full input bytes.
 * @param chunks `null` for one chunk, or split offsets in `(0, bytes.length)`.
 * @returns The ordered chunk views.
 */
export function splitChunks(bytes: Uint8Array, chunks: number[] | null): Uint8Array[] {
  if (chunks === null) {
    return [bytes];
  }
  const slices: Uint8Array[] = [];
  let prev = 0;
  for (const offset of chunks) {
    if (!Number.isInteger(offset) || offset <= prev || offset >= bytes.length) {
      throw new Error(`corpus: chunk offset out of range: ${offset}`);
    }
    slices.push(bytes.subarray(prev, offset));
    prev = offset;
  }
  slices.push(bytes.subarray(prev));
  return slices;
}

/** Load every `*.json` corpus file as `{ name, cases }`, sorted for deterministic order. */
export function loadCorpusFiles(dir: string): { name: string; cases: CorpusRecord[] }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((name) => ({ name, cases: JSON.parse(readFileSync(join(dir, name), 'utf8')) as CorpusRecord[] }));
}
