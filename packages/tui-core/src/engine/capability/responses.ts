/**
 * Shared query-response grammar classifier (RD-02 + RD-06, PL-2).
 *
 * One implementation of the terminal query-response grammars, used by two
 * callers so the grammar lives in a single place (DRY):
 * - RD-02's layer-2 parser ({@link ../capability/query.js}) consumes recognised
 *   responses into capability hints and forwards everything else as input.
 * - RD-06's input decoder routes recognised responses to its `queries` channel
 *   (never `events`) so a terminal reply cannot leak as a keystroke (AC-6, PL-9).
 *
 * Security posture: responses are untrusted data. Only exact, fully-terminated
 * grammar matches are recognised; partial or malformed bytes return `null` so
 * the caller treats them as ordinary input. No `eval`, no code execution.
 */

/** The capability hints a recognised response can contribute (RD-02 layer 2). */
export interface RuntimeHint {
  sync2026?: boolean;
}

/** A recognised query-response match: end index, classification, and capability hint. */
export interface ResponseMatch {
  /** Index just past the consumed sequence. */
  readonly end: number;
  /** Grammar classification of the matched response. */
  readonly kind: 'da1' | 'da2' | 'xtversion' | 'decrpm';
  /** Capability hint extracted from the sequence (empty for pure-demux matches). */
  readonly hint: RuntimeHint;
}

// Control-byte constants used by the grammar matchers.
const ESC = 0x1b;
const CSI_INTRODUCER = 0x5b; // '['
const DCS_INTRODUCER = 0x50; // 'P'
const ST_FINAL = 0x5c; // '\' (the second byte of the ST terminator ESC \)
const BEL = 0x07;

/**
 * Attempt to match a known query-response grammar at `start`. Returns the match
 * (its end index, classification, and capability hint) or `null` when the bytes
 * there are not a complete, recognised response.
 *
 * @param bytes The buffer to scan.
 * @param start The index to attempt a match at.
 * @returns A {@link ResponseMatch}, or `null` when not a complete recognised response.
 */
export function matchResponse(bytes: Uint8Array, start: number): ResponseMatch | null {
  if (bytes[start] !== ESC) {
    return null;
  }
  const introducer = bytes[start + 1];
  if (introducer === CSI_INTRODUCER) {
    return matchCsi(bytes, start);
  }
  if (introducer === DCS_INTRODUCER) {
    return matchDcs(bytes, start);
  }
  return null;
}

/**
 * Match a CSI response: `ESC [` then parameter bytes (0x30–0x3f), intermediate
 * bytes (0x20–0x2f), and a final byte (0x40–0x7e). Only the primary/secondary
 * DA (`…c`) and the `?2026` DECRPM (`…$y`) grammars are recognised; any other
 * CSI returns `null` (left for the caller to treat as input).
 */
function matchCsi(bytes: Uint8Array, start: number): ResponseMatch | null {
  let j = start + 2;

  const paramsStart = j;
  while (j < bytes.length && bytes[j] >= 0x30 && bytes[j] <= 0x3f) {
    j += 1;
  }
  const params = decodeAscii(bytes, paramsStart, j);

  const intermediatesStart = j;
  while (j < bytes.length && bytes[j] >= 0x20 && bytes[j] <= 0x2f) {
    j += 1;
  }
  const intermediates = decodeAscii(bytes, intermediatesStart, j);

  if (j >= bytes.length) {
    return null; // incomplete: no final byte yet
  }
  const final = bytes[j];
  if (final < 0x40 || final > 0x7e) {
    return null; // not a valid CSI final byte
  }
  const end = j + 1;

  // Primary DA (`?…c`) / Secondary DA (`>…c`): recognised and consumed for
  // demultiplexing; no concrete capability field is derived (refined by RD-03).
  if (final === 0x63 && params.startsWith('?')) {
    return { end, kind: 'da1', hint: {} };
  }
  if (final === 0x63 && params.startsWith('>')) {
    return { end, kind: 'da2', hint: {} };
  }

  // Synchronized-output report: `ESC [ ? 2026 ; <value> $ y` (DECRPM).
  if (final === 0x79 && intermediates === '$' && params.startsWith('?')) {
    const fields = params.slice(1).split(';');
    if (fields[0] !== '2026') {
      return null; // a DECRPM for a mode we did not query → not our response
    }
    // value 0 = mode not recognised; 1/2/3/4 = recognised (supported).
    const recognised = fields[1] !== undefined && fields[1] !== '0';
    return { end, kind: 'decrpm', hint: recognised ? { sync2026: true } : {} };
  }

  return null;
}

/**
 * Match a DCS response (XTVERSION): `ESC P … ST`, where ST is `ESC \` or BEL.
 * Recognised and consumed for demultiplexing; no concrete field is derived.
 */
function matchDcs(bytes: Uint8Array, start: number): ResponseMatch | null {
  let j = start + 2;
  while (j < bytes.length) {
    if (bytes[j] === ESC && bytes[j + 1] === ST_FINAL) {
      return { end: j + 2, kind: 'xtversion', hint: {} };
    }
    if (bytes[j] === BEL) {
      return { end: j + 1, kind: 'xtversion', hint: {} };
    }
    j += 1;
  }
  return null; // incomplete: no terminator yet
}

/** Decode a byte range as an ASCII string (response grammars are ASCII). */
function decodeAscii(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let k = start; k < end; k += 1) {
    out += String.fromCharCode(bytes[k]);
  }
  return out;
}
