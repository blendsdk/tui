/**
 * SGR (1006) mouse & wheel decoding (RD-06, plan doc 03-03, PL-11).
 *
 * Decodes one SGR mouse report `ESC [ < b ; x ; y (M|m)` at a byte offset:
 * - `b` low two bits select the button (0/1/2 = left/middle/right);
 * - bit 5 (0x20) marks motion (drag/move);
 * - bit 6 (0x40) marks a wheel report (low two bits = direction 64–67);
 * - final `M` = press/motion, `m` = release.
 *
 * Coordinates `x`,`y` are kept **1-based exactly as received** (AC-3) — no
 * 0-based conversion (this differs from the archived prototype). A wheel report
 * never produces a {@link MouseEvent} (AC-4).
 *
 * The `.js` extension in the import specifier is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
import type { MouseEvent, WheelEvent } from './events.js';

/** Outcome of attempting to decode an SGR mouse report at an offset. */
export type MouseDecode =
  | { readonly status: 'event'; readonly event: MouseEvent | WheelEvent; readonly end: number }
  | { readonly status: 'incomplete' }
  | { readonly status: 'none' };

const ESC = 0x1b;
const CSI_INTRODUCER = 0x5b; // '['
const SGR_PRIVATE = 0x3c; // '<'
const FINAL_PRESS = 0x4d; // 'M'
const FINAL_RELEASE = 0x6d; // 'm'

const MOTION_BIT = 0x20;
const WHEEL_MASK = 0xc0; // bits 6+7; a wheel report has exactly bit 6 set
const WHEEL_FLAG = 0x40;
const BUTTON_BITS = 0x03;
const NO_BUTTON = 0x03; // low two bits = 3 → motion with no button held

/** Wheel direction by the low two bits of a wheel `b` value (64–67). */
const WHEEL_DIRS = ['up', 'down', 'left', 'right'] as const;

/**
 * Attempt to decode an SGR mouse report at `buf[i]`.
 *
 * @param buf The working buffer.
 * @param i The offset to decode at.
 * @returns An `event` (mouse or wheel), `incomplete` when the report is truncated
 *   at the buffer end (carry it forward), or `none` when this is not an SGR
 *   mouse report (the decoder then tries the next token type).
 */
export function decodeMouse(buf: Uint8Array, i: number): MouseDecode {
  if (buf[i] !== ESC || buf[i + 1] !== CSI_INTRODUCER || buf[i + 2] !== SGR_PRIVATE) {
    return { status: 'none' };
  }

  // Parse `b ; x ; y` then a final M/m, starting just past `ESC [ <`.
  const b = readNumber(buf, i + 3);
  if (b === null) {
    return boundsOrNone(buf, i + 3);
  }
  const x = readNumber(buf, b.next, ';');
  if (x === null) {
    return boundsOrNone(buf, b.next);
  }
  const y = readNumber(buf, x.next, ';');
  if (y === null) {
    return boundsOrNone(buf, x.next);
  }

  const finalIndex = y.next;
  if (finalIndex >= buf.length) {
    return { status: 'incomplete' };
  }
  const final = buf[finalIndex];
  if (final !== FINAL_PRESS && final !== FINAL_RELEASE) {
    return { status: 'none' }; // not a valid SGR final — let the CSI fallback drop it
  }

  const event = buildEvent(b.value, x.value, y.value, final);
  return { status: 'event', event, end: finalIndex + 1 };
}

/** Build the mouse/wheel event from the parsed button byte, coords, and final. */
function buildEvent(b: number, x: number, y: number, final: number): MouseEvent | WheelEvent {
  if ((b & WHEEL_MASK) === WHEEL_FLAG) {
    return { type: 'wheel', dir: WHEEL_DIRS[b & BUTTON_BITS], x, y };
  }

  const button = b & BUTTON_BITS;
  const motion = (b & MOTION_BIT) !== 0;
  let kind: MouseEvent['kind'];
  if (final === FINAL_RELEASE) {
    kind = 'up';
  } else if (motion && button === NO_BUTTON) {
    kind = 'move';
  } else if (motion) {
    kind = 'drag';
  } else {
    kind = 'down';
  }
  return { type: 'mouse', kind, button, x, y };
}

/** A parsed unsigned integer field plus the index just past it. */
interface NumberField {
  readonly value: number;
  readonly next: number;
}

/**
 * Read an unsigned decimal field at `start`. When `sep` is given, `start` must be
 * that separator byte (skipped before the digits). Returns the value and the
 * index of the byte after the digits, or `null` if the field is absent/malformed.
 */
function readNumber(buf: Uint8Array, start: number, sep?: string): NumberField | null {
  let j = start;
  if (sep !== undefined) {
    if (j >= buf.length) {
      return null;
    }
    if (buf[j] !== sep.charCodeAt(0)) {
      return null;
    }
    j += 1;
  }
  let value = 0;
  let seen = false;
  while (j < buf.length && buf[j] >= 0x30 && buf[j] <= 0x39) {
    value = value * 10 + (buf[j] - 0x30);
    seen = true;
    j += 1;
  }
  return seen ? { value, next: j } : null;
}

/**
 * Disambiguate a `null` field read: if the parse ran off the end of the buffer
 * the report is merely truncated (`incomplete`, carry it); otherwise the bytes
 * are not a valid SGR report (`none`, fall through to the next token type).
 */
function boundsOrNone(buf: Uint8Array, at: number): MouseDecode {
  return at >= buf.length ? { status: 'incomplete' } : { status: 'none' };
}
