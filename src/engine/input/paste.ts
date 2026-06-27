/**
 * Bracketed-paste markers & assembly helpers (RD-06, plan doc 03-03, PL-5).
 *
 * Bracketed paste wraps pasted content between `ESC [ 200 ~` and `ESC [ 201 ~`.
 * Between the markers every byte is paste content — including bytes that would
 * otherwise be keys or escape sequences — so the decoder accumulates them and
 * emits a single {@link PasteEvent} (AC-5), never per-key events. This module
 * provides the marker matcher (chunk-boundary-safe) and the content decoder; the
 * accumulation, size cap, and state threading live in the decoder scan loop.
 *
 * Security: paste content is bounded by the size cap (PL-5) and is never logged
 * or retained beyond the emitted event (AC-8).
 */

/** The bracketed-paste start marker `ESC [ 200 ~`. */
export const PASTE_START = Uint8Array.from([0x1b, 0x5b, 0x32, 0x30, 0x30, 0x7e]);

/** The bracketed-paste end marker `ESC [ 201 ~`. */
export const PASTE_END = Uint8Array.from([0x1b, 0x5b, 0x32, 0x30, 0x31, 0x7e]);

/**
 * The outcome of matching a fixed marker at an offset: the index just past the
 * marker on a full match, `'incomplete'` when the buffer ends mid-marker (a
 * prefix matched — carry and retry), or `null` when the bytes are not the marker.
 */
export type MarkerMatch = number | 'incomplete' | null;

/** Reused decoder for paste content (UTF-8, lenient: invalid bytes → U+FFFD). */
const pasteTextDecoder = new TextDecoder();

/**
 * Try to match the fixed `marker` byte-for-byte at `buf[i]`.
 *
 * @param buf The working buffer.
 * @param i The offset to match at.
 * @param marker The fixed marker bytes.
 * @returns `i + marker.length` on a full match, `'incomplete'` when a prefix
 *   matched but the buffer ended, or `null` on a mismatch.
 */
export function matchMarker(buf: Uint8Array, i: number, marker: Uint8Array): MarkerMatch {
  for (let k = 0; k < marker.length; k += 1) {
    if (i + k >= buf.length) {
      return 'incomplete'; // the available prefix matched; need more bytes
    }
    if (buf[i + k] !== marker[k]) {
      return null;
    }
  }
  return i + marker.length;
}

/**
 * Decode accumulated paste content bytes to text (UTF-8, lenient).
 *
 * @param bytes The accumulated content bytes (already capped).
 * @returns The decoded paste text.
 */
export function decodePasteText(bytes: number[]): string {
  return pasteTextDecoder.decode(Uint8Array.from(bytes));
}
