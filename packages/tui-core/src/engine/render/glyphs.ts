/**
 * Capability-driven ASCII glyph fallback (RD-04, AC-4, plan doc 03-03, PL-9).
 *
 * The `ScreenBuffer` always stores the real Unicode glyph; the serializer passes
 * each emitted glyph through {@link fallbackGlyph} so the same buffer renders
 * Unicode on a capable terminal and ASCII on a minimal one — no second buffer.
 * Substitution is a serialize-time concern, driven entirely by RD-02's
 * `glyphs`/`unicode` capability fields.
 */

import type { CapabilityProfile } from '../capability/index.js';

/**
 * Unicode box-drawing glyphs → their ASCII substitute when `boxDrawing` is off.
 * Corners and tees/cross collapse to `+`, horizontals to `-`, verticals to `|`
 * (single and double variants alike).
 */
const BOX_FALLBACK: ReadonlyMap<string, string> = new Map([
  // Corners (single + double).
  ['┌', '+'],
  ['┐', '+'],
  ['└', '+'],
  ['┘', '+'],
  ['╔', '+'],
  ['╗', '+'],
  ['╚', '+'],
  ['╝', '+'],
  // Horizontals.
  ['─', '-'],
  ['═', '-'],
  // Verticals.
  ['│', '|'],
  ['║', '|'],
  // Tees / cross.
  ['├', '+'],
  ['┤', '+'],
  ['┬', '+'],
  ['┴', '+'],
  ['┼', '+'],
]);

/** Block and shade glyphs that collapse to `#` when `halfBlocks` is off. */
const BLOCK_SHADE: ReadonlySet<string> = new Set(['█', '▀', '▄', '▌', '▐', '░', '▒', '▓']);

/**
 * Substitute a glyph for the terminal's capabilities (PL-9).
 *
 * Resolution order: ASCII box fallback (when `boxDrawing` is off) → `#` for
 * block/shade glyphs (when `halfBlocks` is off) → `?` for any other code point
 * above U+007F (when `utf8` is off) → the glyph unchanged.
 *
 * @param char A single buffer glyph (a continuation cell's empty string passes
 *   straight through).
 * @param caps The resolved terminal capabilities.
 * @returns The original glyph when supported, else its ASCII fallback.
 */
export function fallbackGlyph(char: string, caps: CapabilityProfile): string {
  if (char === '') return char;

  if (!caps.glyphs.boxDrawing) {
    const ascii = BOX_FALLBACK.get(char);
    if (ascii !== undefined) return ascii;
  }
  if (!caps.glyphs.halfBlocks && BLOCK_SHADE.has(char)) {
    return '#';
  }
  if (!caps.unicode.utf8) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp > 0x7f) return '?';
  }
  return char;
}
