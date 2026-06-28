/**
 * Classic xterm keyboard grammar (RD-06, plan doc 03-02, PL-4/PL-11).
 *
 * A pure, allowlist-only decoder for one keyboard token at a byte offset: single
 * control/printable bytes, CSI/SS3 cursor & function keys, xterm `CSI 1;<mod>`
 * modifier encodings, Alt-prefixed printables, and UTF-8 multibyte printables.
 * No `eval`, no dynamic dispatch — every sequence is matched against explicit
 * tables (AC-8). The CSI-u/Kitty branch is reserved for Phase B (DEF-1): when
 * `caps.keyboard.kittyFlags` is set the decoder still falls through to classic
 * decoding here, so the enhancement slots in later without an API change (PL-4).
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import type { DecodeOptions, KeyEvent } from './events.js';

/** Outcome of attempting to decode one keyboard token at an offset. */
export type KeyDecode =
  | { readonly status: 'event'; readonly event: KeyEvent; readonly end: number }
  | { readonly status: 'drop'; readonly end: number }
  | { readonly status: 'incomplete' };

// Control bytes.
const ESC = 0x1b;
const CSI_INTRODUCER = 0x5b; // '['
const SS3_INTRODUCER = 0x4f; // 'O'

/** Single control bytes that map to a named key. */
const CONTROL_KEYS: ReadonlyMap<number, string> = new Map([
  [0x0d, 'enter'], // CR
  [0x0a, 'enter'], // LF
  [0x09, 'tab'],
  [0x7f, 'backspace'], // DEL
  [0x08, 'backspace'], // BS
  [0x20, 'space'],
]);

/** CSI/SS3 single-final cursor & edit keys (no parameters). */
const FINAL_KEYS: ReadonlyMap<number, string> = new Map([
  [0x41, 'up'], // 'A'
  [0x42, 'down'], // 'B'
  [0x43, 'right'], // 'C'
  [0x44, 'left'], // 'D'
  [0x48, 'home'], // 'H'
  [0x46, 'end'], // 'F'
]);

/** SS3 function-key finals: `ESC O P/Q/R/S` → f1–f4. */
const SS3_FUNCTION_KEYS: ReadonlyMap<number, string> = new Map([
  [0x50, 'f1'], // 'P'
  [0x51, 'f2'], // 'Q'
  [0x52, 'f3'], // 'R'
  [0x53, 'f4'], // 'S'
]);

/** `CSI <n> ~` numeric edit/function keys (xterm `~` encodings). */
const TILDE_KEYS: ReadonlyMap<number, string> = new Map([
  [1, 'home'],
  [2, 'insert'],
  [3, 'delete'],
  [4, 'end'],
  [5, 'pageup'],
  [6, 'pagedown'],
  [11, 'f1'],
  [12, 'f2'],
  [13, 'f3'],
  [14, 'f4'],
  [15, 'f5'],
  [17, 'f6'],
  [18, 'f7'],
  [19, 'f8'],
  [20, 'f9'],
  [21, 'f10'],
  [23, 'f11'],
  [24, 'f12'],
]);

/** Decoded xterm modifier bits (the `<mod>` parameter is `1 + bitmask`). */
interface Modifiers {
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

const NO_MODS: Modifiers = { ctrl: false, alt: false, shift: false };

/**
 * Decode one keyboard token starting at `buf[i]`.
 *
 * @param buf The working buffer (carry + new bytes).
 * @param i The offset to decode at.
 * @param _options Decode options; the `kittyFlags` branch is reserved for Phase B (PL-4).
 * @returns A complete `event`, a `drop` (recognised shape but no emitted key, e.g.
 *   an unknown CSI final or invalid UTF-8 byte — advance past `end`), or
 *   `incomplete` when the buffer ends mid-token (carry it forward, AC-2).
 */
export function decodeKey(buf: Uint8Array, i: number, _options?: DecodeOptions): KeyDecode {
  const b = buf[i];
  if (b === ESC) {
    return decodeEscape(buf, i);
  }
  return decodeSingle(buf, i);
}

/** Decode an `ESC`-introduced token: CSI, SS3, Alt-prefixed key, or a held lone ESC. */
function decodeEscape(buf: Uint8Array, i: number): KeyDecode {
  if (i + 1 >= buf.length) {
    return { status: 'incomplete' }; // lone trailing ESC — held for flush() (PL-3)
  }
  const next = buf[i + 1];
  if (next === CSI_INTRODUCER) {
    return decodeCsi(buf, i);
  }
  if (next === SS3_INTRODUCER) {
    return decodeSs3(buf, i);
  }
  // Alt-prefixed key: ESC + a single key. Decode the inner key and set alt.
  const inner = decodeSingle(buf, i + 1);
  if (inner.status !== 'event') {
    return inner; // incomplete inner → carry the ESC too; drop → drop
  }
  return {
    status: 'event',
    event: { ...inner.event, alt: true },
    end: inner.end,
  };
}

/** Decode an SS3 sequence: `ESC O <final>` (cursor keys and f1–f4). */
function decodeSs3(buf: Uint8Array, i: number): KeyDecode {
  if (i + 2 >= buf.length) {
    return { status: 'incomplete' };
  }
  const final = buf[i + 2];
  const end = i + 3;
  const cursor = FINAL_KEYS.get(final);
  if (cursor !== undefined) {
    return namedKey(cursor, NO_MODS, end);
  }
  const fn = SS3_FUNCTION_KEYS.get(final);
  if (fn !== undefined) {
    return namedKey(fn, NO_MODS, end);
  }
  return { status: 'drop', end }; // unknown SS3 final — consume, emit nothing
}

/**
 * Decode a CSI sequence: `ESC [` params (0x30–0x3f) intermediates (0x20–0x2f)
 * final (0x40–0x7e). Recognised cursor/edit/function keys (with optional xterm
 * modifiers) become events; valid-but-unrecognised CSIs are dropped; a malformed
 * byte resyncs by dropping the ESC; a truncated CSI is incomplete (carried).
 */
function decodeCsi(buf: Uint8Array, i: number): KeyDecode {
  let j = i + 2;
  const paramsStart = j;
  while (j < buf.length && buf[j] >= 0x30 && buf[j] <= 0x3f) {
    j += 1;
  }
  while (j < buf.length && buf[j] >= 0x20 && buf[j] <= 0x2f) {
    j += 1; // intermediates
  }
  if (j >= buf.length) {
    return { status: 'incomplete' }; // no final byte yet
  }
  const final = buf[j];
  if (final < 0x40 || final > 0x7e) {
    return { status: 'drop', end: i + 1 }; // malformed: drop ESC, resync at '['
  }
  const end = j + 1;
  const params = parseParams(buf, paramsStart, j);
  return classifyCsi(params, final, end);
}

/** Map parsed CSI params + final byte to a key event (or drop if unrecognised). */
function classifyCsi(params: number[], final: number, end: number): KeyDecode {
  // Modified cursor/edit form: `CSI 1 ; <mod> <letter>` or `CSI <n> ; <mod> ~`.
  const mods = params.length >= 2 ? decodeModifiers(params[1]) : NO_MODS;

  if (final === 0x7e) {
    // '~'
    const name = TILDE_KEYS.get(params[0] ?? 0);
    return name !== undefined ? namedKey(name, mods, end) : { status: 'drop', end };
  }

  const cursor = FINAL_KEYS.get(final);
  if (cursor !== undefined) {
    return namedKey(cursor, mods, end);
  }
  return { status: 'drop', end }; // valid CSI shape, unknown meaning
}

/** Parse `;`-separated numeric CSI parameters from a byte range. */
function parseParams(buf: Uint8Array, start: number, end: number): number[] {
  const params: number[] = [];
  let current = 0;
  let seen = false;
  for (let k = start; k < end; k += 1) {
    const c = buf[k];
    if (c >= 0x30 && c <= 0x39) {
      current = current * 10 + (c - 0x30);
      seen = true;
    } else if (c === 0x3b) {
      // ';'
      params.push(seen ? current : 0);
      current = 0;
      seen = false;
    }
    // Other param bytes (e.g. '?') are ignored for keyboard classification.
  }
  params.push(seen ? current : 0);
  return params;
}

/**
 * Decode the xterm modifier parameter: the value is `1 + bitmask`, where bit 1
 * = Shift, bit 2 = Alt, bit 4 = Ctrl (bit 8 = Meta is folded into Alt). A value
 * < 1 yields no modifiers.
 */
function decodeModifiers(mod: number): Modifiers {
  if (mod <= 1) {
    return NO_MODS;
  }
  const bits = mod - 1;
  return {
    shift: (bits & 1) !== 0,
    alt: (bits & 2) !== 0 || (bits & 8) !== 0,
    ctrl: (bits & 4) !== 0,
  };
}

/** Decode one single (non-ESC) byte: named control, Ctrl-letter, or UTF-8 printable. */
function decodeSingle(buf: Uint8Array, i: number): KeyDecode {
  const b = buf[i];

  const named = CONTROL_KEYS.get(b);
  if (named !== undefined) {
    return namedKey(named, NO_MODS, i + 1);
  }
  // Ctrl-letter range: 0x01–0x1a → a–z with ctrl (excludes the named controls above).
  if (b >= 0x01 && b <= 0x1a) {
    const letter = String.fromCharCode(b + 0x60); // 0x01 → 'a'
    return {
      status: 'event',
      event: { type: 'key', key: letter, ctrl: true, alt: false, shift: false },
      end: i + 1,
    };
  }
  // Other C0 controls (0x00, 0x1c–0x1f) are dropped (no defined key).
  if (b < 0x20) {
    return { status: 'drop', end: i + 1 };
  }
  return decodePrintable(buf, i);
}

/** UTF-8-decode one printable code point at `buf[i]` (1–4 bytes). */
function decodePrintable(buf: Uint8Array, i: number): KeyDecode {
  const b = buf[i];
  const len = utf8Length(b);
  if (len === 0) {
    return { status: 'drop', end: i + 1 }; // invalid lead byte — drop & resync
  }
  if (i + len > buf.length) {
    return { status: 'incomplete' }; // multibyte char split across the chunk boundary
  }
  for (let k = 1; k < len; k += 1) {
    if ((buf[i + k] & 0xc0) !== 0x80) {
      return { status: 'drop', end: i + 1 }; // bad continuation byte — drop & resync
    }
  }
  const codepoint = decodeUtf8(buf, i, len);
  return {
    status: 'event',
    event: {
      type: 'key',
      key: String.fromCodePoint(codepoint),
      ctrl: false,
      alt: false,
      shift: false,
      codepoint,
    },
    end: i + len,
  };
}

/** Expected UTF-8 byte length from a lead byte, or 0 if the lead byte is invalid. */
function utf8Length(lead: number): number {
  if (lead < 0x80) {
    return 1;
  }
  if (lead >= 0xc2 && lead <= 0xdf) {
    return 2;
  }
  if (lead >= 0xe0 && lead <= 0xef) {
    return 3;
  }
  if (lead >= 0xf0 && lead <= 0xf4) {
    return 4;
  }
  return 0; // lone continuation byte or an out-of-range/overlong lead
}

/** Combine a validated UTF-8 byte sequence into a single code point. */
function decodeUtf8(buf: Uint8Array, i: number, len: number): number {
  if (len === 1) {
    return buf[i];
  }
  const leadMask = (1 << (7 - len)) - 1;
  let cp = buf[i] & leadMask;
  for (let k = 1; k < len; k += 1) {
    cp = (cp << 6) | (buf[i + k] & 0x3f);
  }
  return cp;
}

/** Build a named-key event with the given modifiers. */
function namedKey(key: string, mods: Modifiers, end: number): KeyDecode {
  return {
    status: 'event',
    event: { type: 'key', key, ctrl: mods.ctrl, alt: mods.alt, shift: mods.shift },
    end,
  };
}
