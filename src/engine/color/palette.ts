/**
 * Color reference tables for depth-aware encoding (RD-05; AR-5, AR-6).
 *
 * Holds the ANSI-16 reference RGB (shared by nearest-16 and the 256 base colors)
 * and the xterm-256 reference (`rgb256`). The app-facing DOS-16 `PALETTE` and the
 * `Theme` constants are added by Phase 2 (see 03-02). All values here are encoding
 * internals, not app colors.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution
 * (it resolves to the `.ts` source during development via tsx).
 */
import type { Ansi16Name } from '../render/types.js';
import type { Rgb } from './color.js';

/**
 * The 16 named ANSI colors as 24-bit reference RGB (the common xterm palette).
 * Identical to the values RD-04 shipped, so nearest-16 and the 256 base colors
 * (indices 0–15) agree with the truecolor path.
 */
export const ANSI16_REFERENCE: Record<Ansi16Name, Rgb> = {
  black: { r: 0, g: 0, b: 0 },
  red: { r: 205, g: 0, b: 0 },
  green: { r: 0, g: 205, b: 0 },
  yellow: { r: 205, g: 205, b: 0 },
  blue: { r: 0, g: 0, b: 238 },
  magenta: { r: 205, g: 0, b: 205 },
  cyan: { r: 0, g: 205, b: 205 },
  white: { r: 229, g: 229, b: 229 },
  brightBlack: { r: 127, g: 127, b: 127 },
  brightRed: { r: 255, g: 0, b: 0 },
  brightGreen: { r: 0, g: 255, b: 0 },
  brightYellow: { r: 255, g: 255, b: 0 },
  brightBlue: { r: 92, g: 92, b: 255 },
  brightMagenta: { r: 255, g: 0, b: 255 },
  brightCyan: { r: 0, g: 255, b: 255 },
  brightWhite: { r: 255, g: 255, b: 255 },
};

/**
 * The 16 ANSI names in palette-index order: 0–7 normal, 8–15 bright. `nearest16`
 * returns an index into this list, which maps to the SGR codes 30–37/90–97.
 */
export const ANSI16_ORDER: readonly Ansi16Name[] = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
];

const NAME_SET: ReadonlySet<string> = new Set(ANSI16_ORDER);

/** Type guard: whether `value` is one of the 16 named ANSI colors. */
export function isAnsi16Name(value: string): value is Ansi16Name {
  return NAME_SET.has(value);
}

/** The six per-channel levels of the xterm 6×6×6 color cube. */
const CUBE_LEVELS: readonly number[] = [0, 95, 135, 175, 215, 255];

/**
 * Reference RGB for xterm-256 palette index `n` (0–255): the 16 base colors
 * (0–15), the 6×6×6 cube (16–231), then the 24-step gray ramp (232–255).
 *
 * @param index An integer 0–255.
 * @returns The reference RGB for that palette entry.
 */
export function rgb256(index: number): Rgb {
  if (index < 16) return ANSI16_REFERENCE[ANSI16_ORDER[index]];
  if (index < 232) {
    const i = index - 16;
    return {
      r: CUBE_LEVELS[Math.floor(i / 36) % 6],
      g: CUBE_LEVELS[Math.floor(i / 6) % 6],
      b: CUBE_LEVELS[i % 6],
    };
  }
  const level = 8 + (index - 232) * 10;
  return { r: level, g: level, b: level };
}
