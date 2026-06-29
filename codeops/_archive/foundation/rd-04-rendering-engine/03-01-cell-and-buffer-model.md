# 03-01: Cell & Buffer Model

> **Document**: 03-01-cell-and-buffer-model.md
> **Parent**: [Index](00-index.md)
> **Decisions**: PL-3, PL-7, PL-10, PL-15, PL-17

The typed cell model and the `ScreenBuffer` apps draw into. Files:
`src/engine/render/types.ts`, `src/engine/render/buffer.ts`,
`src/engine/render/width.ts`.

## Types (types.ts, PL-7, PL-15)

```ts
/** An app-specified color: a 24-bit hex, a named ANSI-16 color, or the terminal default. */
export type Color = `#${string}` | Ansi16Name | 'default';

/** The 16 named ANSI colors (the encoder maps these per depth in RD-05). */
export type Ansi16Name =
  | 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'
  | 'brightBlack' | 'brightRed' | 'brightGreen' | 'brightYellow'
  | 'brightBlue' | 'brightMagenta' | 'brightCyan' | 'brightWhite';

/** Text-attribute bitmask (PL-15). One bit per attribute; combinable with `|`. */
export type AttrMask = number;

/** Attribute bit constants (PL-15). RD-05 encodes these to SGR; RD-04 only stores them. */
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
```

> The `Color` string union keeps cells small and run-merge comparisons cheap
> (string equality). Encoding `Color`+`AttrMask`→SGR is the `StyleEncoder` seam's
> job (03-02), not the cell's.

## Character width (width.ts, PL-10)

```ts
/**
 * Display width of a Unicode code point.
 * @param codepoint The code point.
 * @param widthMode From `caps.unicode.widthMode`; 'ambiguous-wide' widens ambiguous chars.
 * @returns 0 (combining/zero-width), 2 (East-Asian wide/fullwidth or wide emoji), or 1.
 */
export function charWidth(codepoint: number, widthMode: WidthMode): 0 | 1 | 2;
```

Rules (the single source of width truth, documented ranges):
- **0** — C0/C1 controls, zero-width (`U+200B`, `U+FEFF`), combining marks
  (`U+0300–036F`, etc.). (Sanitized text won't contain controls, but width stays total.)
- **2** — Unicode **East-Asian Wide (W)** and **Fullwidth (F)** ranges (Hangul,
  CJK Unified `U+4E00–9FFF`, CJK punctuation, fullwidth forms `U+FF00–FF60`,
  `U+FFE0–FFE6`) plus wide emoji (`U+1F300–1FAFF`, `U+2600–26FF` emoji-presentation).
- **2 when `widthMode==='ambiguous-wide'`** — East-Asian **Ambiguous (A)** range
  (e.g. `U+2018`, `U+00A1`); otherwise these are **1**.
- **1** — everything else.

`世` (`U+4E16`) → 2 (proves AC-2). The exact range tables live in `width.ts` with a
comment citing Unicode East-Asian Width; impl tests pin boundary code points.

## ScreenBuffer (buffer.ts, PL-3, PL-17)

A per-cell-object 2-D grid (migrated + extended from the prototype `buffer.ts`).

```ts
export class ScreenBuffer {
  readonly width: number;
  readonly height: number;
  constructor(width: number, height: number, fill: Style & { char?: string });

  set(x: number, y: number, char: string, style: Style): void;
  get(x: number, y: number): Cell | undefined;
  fillRect(x: number, y: number, w: number, h: number, char: string, style: Style): void;
  text(x: number, y: number, str: string, style: Style, widthMode?: WidthMode): number;
  box(x: number, y: number, w: number, h: number, style: Style,
      variant?: 'single' | 'double', title?: string): void;
  shadow(x: number, y: number, w: number, h: number, style: Style): void;
  rows(): readonly Cell[][];
}
```

### Width-correct `set` / `text` (PL-17, AC-2)
- `set(x, y, char, style)` writes one code point. Its `charWidth` decides the cell:
  - width **1** → a single normal cell.
  - width **2** → the cell at `x` becomes the wide **lead** (`width:2`), and the cell
    at `x+1` becomes a **continuation** (`width:0`, `char:''`, same style) that emits
    no glyph. Writing a lead at the last column (no room for the continuation) clips to
    a space (defensive; never a half-painted wide glyph).
- `text(x, y, str, style, widthMode)` iterates code points, calling `set` and advancing
  the column by each glyph's **display width** (1 or 2), returning the column just past
  the text. This makes the cursor track display columns, not code-point count (AC-2).
- Overwriting one half of an existing wide glyph clears its orphaned partner to a space
  (no stale continuation). Out-of-bounds writes are silently clipped (prototype behavior).

### `box` / `shadow` (migrated)
- `box` draws a single/double frame with an opaque interior fill and an optional centered
  title (prototype behavior). The **glyphs** come from the box set (03-03), which the
  serializer substitutes to ASCII when `caps.glyphs.boxDrawing` is false (PL-9) — `box`
  always stores the real Unicode glyph; fallback is a serialize-time concern.
- `shadow` darkens the cells one column right and one row below the rectangle (prototype).

### `rows()`
Returns the grid as rows of cells for the serializer (read-only view).

## Why this layering
The buffer is pure data + geometry; it knows display width but **not** encoding or
capabilities. All capability-driven behavior (color depth, glyph fallback, sync) lives
in the serializer (03-02) and glyph layer (03-03), so the same buffer serializes
differently per terminal without copying — exactly the RD-02-driven adaptation goal.
