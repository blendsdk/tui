/**
 * Pure byte→event input decoder core (RD-06, plan doc 03-02).
 *
 * `decode(bytes, state, options?)` is a pure function of its inputs: it never
 * owns a timer, performs I/O, or logs bytes (AC-8), so the same input always
 * yields the same output (replayable under a fuzz corpus). It concatenates the
 * carried bytes with the new chunk, scans left-to-right consuming complete
 * tokens, and carries any incomplete trailing token forward in the returned
 * state (chunk-boundary safety, AC-2).
 *
 * The single genuinely time-dependent decision — a lone trailing `ESC` (Escape
 * key vs the start of a CSI/SS3 sequence) — is externalised to `flush()`, driven
 * by the RD-07 host's `ESC_TIMEOUT_MS` timer (PL-3). The host threads decoding
 * forward with `state = result.state` (RT-1), which carries both the incomplete
 * bytes and any in-progress bracketed paste.
 *
 * At each scan position the decoder tries token types in priority order (03-03):
 * in-progress paste, query-response demux, mouse/wheel, focus, bracketed-paste
 * start, then the keyboard fallback — so query replies, mouse, and paste are
 * never misread as keys.
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import type {
  DecodeOptions,
  DecodeResult,
  DecoderState,
  FocusEvent,
  InputEvent,
  KeyEvent,
  PasteState,
  QueryResponse,
} from './events.js';
import { PASTE_CAP_BYTES } from './events.js';
import { decodeKey } from './keys.js';
import { decodeMouse } from './mouse.js';
import { PASTE_END, PASTE_START, matchMarker, decodePasteText } from './paste.js';
import { matchResponse } from '../capability/responses.js';
import { RESPONSE_BUFFER_CAP } from '../capability/query.js';

const ESC = 0x1b;
const CSI_INTRODUCER = 0x5b; // '['
const FOCUS_IN = 0x49; // 'I'
const FOCUS_OUT = 0x4f; // 'O'
const EMPTY = new Uint8Array(0);

/** Outcome of attempting to decode a focus report at an offset. */
type FocusDecode =
  { readonly status: 'event'; readonly event: FocusEvent; readonly end: number } | { readonly status: 'none' };

/** A fresh, empty decoder state: no carried bytes, no in-progress paste, not resyncing. */
export function createDecoderState(): DecoderState {
  return { carry: EMPTY, paste: { active: false, bytes: [], truncated: false }, resync: false };
}

/**
 * Decode a chunk of terminal bytes into input events.
 *
 * @param bytes The newly received bytes.
 * @param state The carry from the previous call (or `createDecoderState()`).
 * @param options Optional capability profile and paste-cap override.
 * @returns The decoded events, isolated query responses, the incomplete trailing
 *   bytes (`rest`), and the next `state` to pass to the following call (RT-1).
 */
export function decode(bytes: Uint8Array, state: DecoderState, options?: DecodeOptions): DecodeResult {
  return scan(concat(state.carry, bytes), state.paste, state.resync, options);
}

/**
 * Force out a held ambiguous trailing `ESC` as a standalone Escape key (PL-3).
 *
 * Called by the host when its `ESC_TIMEOUT_MS` timer fires with no further bytes.
 * A leading lone `ESC` in the carry becomes `KeyEvent{ key:'escape' }`; any bytes
 * after it are decoded normally. With no held `ESC`, this just re-scans the carry.
 *
 * @param state The current decoder state (its `carry` may hold the lone `ESC`).
 * @param options Optional decode options.
 * @returns The decode result, including the emitted Escape key when applicable.
 */
export function flush(state: DecoderState, options?: DecodeOptions): DecodeResult {
  const buf = state.carry;
  if (!state.paste.active && !state.resync && buf.length > 0 && buf[0] === ESC) {
    const escape: KeyEvent = { type: 'key', key: 'escape', ctrl: false, alt: false, shift: false };
    const tail = scan(copyOf(buf.subarray(1)), state.paste, state.resync, options);
    return {
      events: [escape, ...tail.events],
      queries: tail.queries,
      rest: tail.rest,
      state: tail.state,
    };
  }
  return scan(buf, state.paste, state.resync, options);
}

/**
 * The core scan loop over a working buffer. At each position it tries the token
 * types in priority order (03-03): in-progress paste, query-response demux,
 * mouse/wheel, focus, bracketed-paste start, then the keyboard fallback. A
 * complete token is consumed and appended; an incomplete trailing token stops
 * the scan (carried in `rest`); a recognised-but-unmapped token is dropped.
 *
 * Query responses are pushed to `queries`, never `events`, so a terminal reply
 * physically cannot leak as a keystroke (AC-6, PL-9). The in-progress paste is
 * accumulated into local state and threaded out via the returned `state` (RT-1).
 */
function scan(buf: Uint8Array, paste: PasteState, resync: boolean, options?: DecodeOptions): DecodeResult {
  const events: InputEvent[] = [];
  const queries: QueryResponse[] = [];
  const cap = options?.pasteCap ?? PASTE_CAP_BYTES;

  // Local, mutable copies so decode() never mutates the caller's state (purity, AC-8).
  let active = paste.active;
  let pasteBytes = active ? paste.bytes.slice() : [];
  let truncated = active ? paste.truncated : false;
  let resyncing = resync;

  let i = 0;
  scanLoop: while (i < buf.length) {
    // 0. Resync after a carry-bound overflow (PL-6): drop bytes until the next
    // ESC so an oversized unterminated sequence emits nothing (AC-7/AC-8).
    if (resyncing) {
      if (buf[i] !== ESC) {
        i += 1;
        continue;
      }
      resyncing = false; // reached a sequence boundary — resume normal decoding
    }

    // 1. In-progress paste: every byte is content until the end marker (AC-5).
    if (active) {
      const endMarker = matchMarker(buf, i, PASTE_END);
      if (endMarker === 'incomplete') {
        break; // a partial end marker at the buffer end — carry & retry
      }
      if (typeof endMarker === 'number') {
        events.push({ type: 'paste', text: decodePasteText(pasteBytes), truncated });
        active = false;
        pasteBytes = [];
        truncated = false;
        i = endMarker;
        continue;
      }
      // Accumulate one content byte under the size cap (PL-5, AC-7).
      if (pasteBytes.length < cap) {
        pasteBytes.push(buf[i]);
      } else {
        truncated = true;
      }
      i += 1;
      continue;
    }

    // 2. Query-response demux → queries (never events) (AC-6, PL-9).
    const response = matchResponse(buf, i);
    if (response !== null) {
      queries.push({ raw: copyOf(buf.subarray(i, response.end)), kind: response.kind });
      i = response.end;
      continue;
    }

    // 3. Mouse / wheel (SGR 1006).
    const mouse = decodeMouse(buf, i);
    if (mouse.status === 'incomplete') {
      break;
    }
    if (mouse.status === 'event') {
      events.push(mouse.event);
      i = mouse.end;
      continue;
    }

    // 4. Focus in/out (`CSI I` / `CSI O`).
    const focus = decodeFocus(buf, i);
    if (focus.status === 'event') {
      events.push(focus.event);
      i = focus.end;
      continue;
    }

    // 5. Bracketed-paste start marker.
    const startMarker = matchMarker(buf, i, PASTE_START);
    if (startMarker === 'incomplete') {
      break; // a partial start marker at the buffer end — carry & retry
    }
    if (typeof startMarker === 'number') {
      active = true;
      i = startMarker;
      continue;
    }

    // 6. Keyboard fallback (classic xterm grammar).
    const token = decodeKey(buf, i, options);
    switch (token.status) {
      case 'incomplete':
        break scanLoop; // incomplete trailing token — carry the remaining bytes
      case 'drop':
        i = token.end; // recognised shape, no key emitted — advance & resync
        continue;
      case 'event':
        events.push(token.event);
        i = token.end;
        continue;
    }
  }

  let rest = copyOf(buf.subarray(i));
  let nextResync = resyncing;
  // Carry bound (PL-6, AC-7/AC-8): a trailing incomplete token longer than the
  // shared cap is adversarial garbage — drop it and resync rather than grow.
  // (Paste content is bounded separately by the paste cap, not carried in rest.)
  if (rest.length > RESPONSE_BUFFER_CAP) {
    rest = EMPTY;
    nextResync = true; // discard the poisoned tail until the next ESC boundary
  }

  const nextPaste: PasteState = active
    ? { active: true, bytes: pasteBytes, truncated }
    : { active: false, bytes: [], truncated: false };

  return { events, queries, rest, state: { carry: rest, paste: nextPaste, resync: nextResync } };
}

/**
 * Decode a focus in/out report: `ESC [ I` → focused, `ESC [ O` → unfocused
 * (PL-7). Returns `none` when the bytes are not a focus report (the decoder then
 * tries the bracketed-paste start and keyboard fallbacks).
 */
function decodeFocus(buf: Uint8Array, i: number): FocusDecode {
  if (buf[i] !== ESC || buf[i + 1] !== CSI_INTRODUCER) {
    return { status: 'none' };
  }
  const final = buf[i + 2];
  if (final === FOCUS_IN) {
    return { status: 'event', event: { type: 'focus', focused: true }, end: i + 3 };
  }
  if (final === FOCUS_OUT) {
    return { status: 'event', event: { type: 'focus', focused: false }, end: i + 3 };
  }
  return { status: 'none' };
}

/** Concatenate the carried bytes with the new chunk into one working buffer. */
function concat(carry: Uint8Array, bytes: Uint8Array): Uint8Array {
  if (carry.length === 0) {
    return bytes;
  }
  if (bytes.length === 0) {
    return carry;
  }
  const out = new Uint8Array(carry.length + bytes.length);
  out.set(carry, 0);
  out.set(bytes, carry.length);
  return out;
}

/** Copy a byte range into a standalone array (so carried bytes don't retain the buffer). */
function copyOf(view: Uint8Array): Uint8Array {
  return view.length === 0 ? EMPTY : Uint8Array.from(view);
}
