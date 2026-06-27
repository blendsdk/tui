/**
 * Color parsing, validation, and the typed color error (RD-05; AR-7, AR-8).
 *
 * `toRgb()` is the single validation boundary: it accepts only `default`, a named
 * ANSI-16 color, or a `#rgb`/`#rrggbb` hex string, and throws `InvalidColorError`
 * on anything malformed — never returning a partial value, so a bad color can
 * never leak arbitrary bytes into the SGR stream (RD-05 §Security; AC-6/AC-7).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution
 * (it resolves to the `.ts` source during development via tsx).
 */
import type { Color } from '../render/types.js';
import { TuiError } from '../safety/errors.js';

import { ANSI16_REFERENCE, isAnsi16Name } from './palette.js';

/** RGB components, each an integer 0–255. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Thrown when a color string is not a valid `#rgb`/`#rrggbb`/named/`default`
 * value. Extends the RD-08 `TuiError` so consumers catch all SDK errors uniformly.
 * [AR-8]
 */
export class InvalidColorError extends TuiError {}

/** A `#rgb` or `#rrggbb` hex color (case-insensitive). */
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Validate + parse a `Color` to RGB.
 *
 * @param color A `Color`: `'default'`, a named ANSI-16 color, or a hex string.
 * @returns The RGB components, or `null` for `'default'` (the terminal default).
 * @throws InvalidColorError when `color` is a malformed hex string or an unknown
 *         name — no partial value is ever returned (AC-6/AC-7).
 */
export function toRgb(color: Color): Rgb | null {
  if (color === 'default') return null;
  if (color.startsWith('#')) {
    if (!HEX_RE.test(color)) throw new InvalidColorError(`Invalid hex color: ${color}`);
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  if (isAnsi16Name(color)) return ANSI16_REFERENCE[color];
  throw new InvalidColorError(`Unknown color: ${color}`);
}
