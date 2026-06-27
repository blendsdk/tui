/**
 * Cell and style types for the rendering engine (RD-04, plan doc 03-01).
 *
 * The buffer stores app-specified colors and an attribute bitmask per cell;
 * encoding `Color` + `AttrMask` to an SGR sequence is the `StyleEncoder` seam's
 * job (03-02 / RD-05), not the cell's. Keeping `Color` a string union keeps
 * cells small and makes run-merge comparisons cheap (string equality).
 *
 * Decisions: PL-7 (`Color` string union), PL-15 (`AttrMask` ownership),
 * PL-17 (`Cell.width` semantics).
 */

/** The 16 named ANSI colors (the encoder maps these per depth in RD-05). */
export type Ansi16Name =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'brightBlack'
  | 'brightRed'
  | 'brightGreen'
  | 'brightYellow'
  | 'brightBlue'
  | 'brightMagenta'
  | 'brightCyan'
  | 'brightWhite';

/** An app-specified color: a 24-bit hex, a named ANSI-16 color, or the terminal default. */
export type Color = `#${string}` | Ansi16Name | 'default';

/** Text-attribute bitmask (PL-15). One bit per attribute; combinable with `|`. */
export type AttrMask = number;

/**
 * Attribute bit constants (PL-15). RD-05 encodes these to SGR; RD-04 only
 * stores them. One bit per attribute so they combine with bitwise OR.
 */
export const Attr = {
  none: 0,
  bold: 1 << 0,
  dim: 1 << 1,
  italic: 1 << 2,
  underline: 1 << 3,
  blink: 1 << 4,
  reverse: 1 << 5,
  strike: 1 << 6,
} as const;

/** A foreground/background/attribute style; used by every drawing helper. */
export interface Style {
  readonly fg: Color;
  readonly bg: Color;
  /** Attribute bitmask; defaults to `Attr.none`. */
  readonly attrs?: AttrMask;
}

/**
 * A single screen cell. `width` distinguishes normal (1), wide-lead (2), and
 * continuation (0) cells (PL-17). A continuation cell emits no glyph.
 */
export interface Cell {
  char: string;
  fg: Color;
  bg: Color;
  attrs: AttrMask;
  /** Display width: 1 = normal, 2 = lead of a wide glyph, 0 = trailing continuation. */
  width: 0 | 1 | 2;
}
