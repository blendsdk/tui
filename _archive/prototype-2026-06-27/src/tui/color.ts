/**
 * Colour parsing for `#rrggbb` strings. Kept in one place so the ANSI
 * serialiser has a single source of truth for turning theme colours into
 * 24-bit terminal sequences.
 */

/** Red/green/blue components, each 0–255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse a `#rrggbb` string into its red/green/blue components. */
export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}
