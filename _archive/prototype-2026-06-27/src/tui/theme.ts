/**
 * Turbo Vision-inspired colour palette and glyphs.
 *
 * Colours are expressed as hex strings so they render identically across
 * terminals that support 24-bit colour. They mirror the classic Borland
 * 16-colour DOS palette (blue desktop, light-grey chrome, green buttons).
 */

/** The 16 classic DOS/Turbo Vision colours, by hex value. */
export const PALETTE = {
  black: '#000000',
  blue: '#0000aa',
  green: '#00aa00',
  cyan: '#00aaaa',
  red: '#aa0000',
  magenta: '#aa00aa',
  brown: '#aa5500',
  lightGray: '#aaaaaa',
  darkGray: '#555555',
  brightBlue: '#5555ff',
  brightGreen: '#55ff55',
  brightCyan: '#55ffff',
  brightRed: '#ff5555',
  yellow: '#ffff55',
  white: '#ffffff',
} as const;

/**
 * Semantic colour roles. Components reference these rather than raw palette
 * entries so the whole look can be retuned in one place.
 */
export const THEME = {
  /**
   * The desktop, exactly as Turbo Vision's TBackground drew it: a uniform fill
   * of the `░` light-shade glyph in light grey over a blue background (the
   * classic `0x17` desktop attribute). Same glyph and colour everywhere — the
   * sparse grey dots give the textured "grey-blue" surface, with no gradient.
   */
  desktop: {
    pattern: '░',
    fg: PALETTE.lightGray,
    bg: '#0000a8',
  },
  menuBar: { fg: PALETTE.black, bg: PALETTE.lightGray, hotkey: PALETTE.red },
  menuBarActive: { fg: PALETTE.white, bg: PALETTE.green },
  menuDropdown: { fg: PALETTE.black, bg: PALETTE.lightGray, hotkey: PALETTE.red },
  menuSelected: { fg: PALETTE.white, bg: PALETTE.green, hotkey: PALETTE.yellow },
  window: { fg: PALETTE.black, bg: PALETTE.lightGray, border: PALETTE.black, title: PALETTE.black },
  dialog: { fg: PALETTE.black, bg: PALETTE.lightGray, border: PALETTE.black, title: PALETTE.black },
  button: { fg: PALETTE.black, bg: PALETTE.green },
  buttonFocused: { fg: PALETTE.white, bg: PALETTE.green, hotkey: PALETTE.yellow },
  /** Colour of the thin half-block shadow hugging a button's edges. */
  buttonShadow: '#3a3a3a',
  statusBar: { fg: PALETTE.black, bg: PALETTE.lightGray, hotkey: PALETTE.red },
  shadow: { fg: PALETTE.darkGray, bg: PALETTE.black },
} as const;

/** Box-drawing glyphs for single- and double-line frames. */
export const BOX = {
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
} as const;

/**
 * Half-cell block glyphs. A half block fills only one edge of its cell, so it
 * draws a shadow "rectangle" thinner than a full cell. Turbo Vision's button
 * shadow used exactly these: `▀` (0xDF) along the bottom and `▄` (0xDC) at the
 * lower-right corner, so the shadow hugs the bottom-right and leaves the lit
 * top-right corner clear.
 */
export const BLOCK = {
  upperHalf: '▀',
  lowerHalf: '▄',
} as const;
