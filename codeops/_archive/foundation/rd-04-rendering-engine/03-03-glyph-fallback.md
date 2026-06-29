# 03-03: Glyph Fallback

> **Document**: 03-03-glyph-fallback.md
> **Parent**: [Index](00-index.md)
> **Decisions**: PL-9

Capability-driven ASCII substitution so output stays legible on terminals without
box-drawing, half-blocks, or UTF-8. File: `src/engine/render/glyphs.ts`.

## Where it runs (PL-9)
Substitution happens at **serialize time**, not when cells are written. The
`ScreenBuffer` always stores the real Unicode glyph (e.g. `┌`); `serialize()` (03-02)
passes each emitted glyph through `fallbackGlyph(char, caps)` so the same buffer renders
Unicode on a capable terminal and ASCII on a minimal one — no second buffer.

```ts
/**
 * Substitute a glyph for the terminal's capabilities (PL-9).
 * @returns The original glyph when supported, else its ASCII fallback.
 */
export function fallbackGlyph(char: string, caps: CapabilityProfile): string;
```

## Box-drawing set & fallback (AC-4)
The Unicode box glyphs (from the prototype `theme.ts` `BOX`):

| Role | single | double | ASCII fallback (`boxDrawing===false`) |
| ---- | ------ | ------ | ------------------------------------- |
| corners | `┌ ┐ └ ┘` | `╔ ╗ ╚ ╝` | `+` |
| horizontal | `─` | `═` | `-` |
| vertical | `│` | `║` | `|` |
| tees/cross (if used) | `├ ┤ ┬ ┴ ┼` | — | `+` |

When `caps.glyphs.boxDrawing === false`, `box()`'s frame renders with `+ - |`
(AC-4); when `true`, the Unicode glyphs pass through unchanged.

## Half-block & shade fallback (PL-9)
When `caps.glyphs.halfBlocks === false`, block/shade glyphs map to `#`:

| Glyphs | Fallback |
| ------ | -------- |
| `█ ▀ ▄ ▌ ▐` (full/half blocks) | `#` |
| `░ ▒ ▓` (shades) | `#` |

## Non-UTF-8 fallback (PL-9)
When `caps.unicode.utf8 === false`, the terminal cannot render multi-byte glyphs at all.
Any glyph whose code point is **> 127** that is not already covered above falls back to
`?`. ASCII glyphs (≤ 127) pass through unchanged.

## Resolution order
`fallbackGlyph(char, caps)`:
1. If `char` is in the box set and `!caps.glyphs.boxDrawing` → ASCII box fallback.
2. Else if `char` is a block/shade and `!caps.glyphs.halfBlocks` → `#`.
3. Else if `!caps.unicode.utf8` and `char.codePointAt(0)! > 127` → `?`.
4. Else → `char` unchanged.

The mapping tables are module constants with a comment tying each to RD-02's
`glyphs`/`unicode` capability fields, so the fallback is fully capability-driven and
deterministic.
