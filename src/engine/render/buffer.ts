/**
 * The width-correct cell buffer apps draw into (RD-04, plan doc 03-01).
 *
 * A per-cell-object 2-D grid (migrated and extended from the archived prototype
 * `tui/buffer.ts`): each {@link Cell} now carries an attribute mask and a
 * display `width` (PL-3, PL-17). Drawing helpers (`set`/`text`/`fillRect`/`box`/
 * `shadow`) keep wide glyphs (CJK/emoji) occupying two columns — a lead cell
 * (`width: 2`) plus a continuation cell (`width: 0`, empty char) — so the
 * serializer paints them correctly (AC-2).
 *
 * The buffer is pure data + geometry: it knows display width but not terminal
 * capabilities. Capability-driven behavior (color depth, glyph fallback, sync)
 * lives in the serializer (03-02) and glyph layer (03-03).
 */

import { Attr } from './types.js';
import type { Cell, Style } from './types.js';
import { charWidth } from './width.js';
import type { WidthMode } from './width.js';

/** The box-drawing glyph set per variant (real Unicode; fallback is serialize-time). */
const BOX = {
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
} as const;

/**
 * Default width-resolution mode for writes that do not specify one. Matches
 * RD-02's default `unicode.widthMode`; `text()` threads the caller's mode in.
 */
const DEFAULT_WIDTH_MODE: WidthMode = 'wcwidth';

/** A mutable 2-D grid of styled cells. */
export class ScreenBuffer {
  public readonly width: number;
  public readonly height: number;
  /** Row-major cell storage; index `y * width + x`. */
  protected readonly cells: Cell[];

  /**
   * Create a buffer with every cell pre-filled with a background style.
   *
   * @param width  Buffer width in columns (clamped to at least 1).
   * @param height Buffer height in rows (clamped to at least 1).
   * @param fill   The style (and optional single narrow glyph, default space)
   *   every cell starts with.
   */
  constructor(width: number, height: number, fill: Style & { char?: string }) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    const char = fill.char ?? ' ';
    const attrs = fill.attrs ?? Attr.none;
    this.cells = new Array(this.width * this.height);
    for (let i = 0; i < this.cells.length; i += 1) {
      this.cells[i] = { char, fg: fill.fg, bg: fill.bg, attrs, width: 1 };
    }
  }

  /** True when (x, y) lies inside the buffer bounds. */
  protected inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /** The cell at (x, y); caller must have bounds-checked. */
  protected cellAt(x: number, y: number): Cell {
    return this.cells[y * this.width + x];
  }

  /** Overwrite a cell's contents in place. */
  protected write(cell: Cell, char: string, style: Style, cellWidth: 0 | 1 | 2): void {
    cell.char = char;
    cell.fg = style.fg;
    cell.bg = style.bg;
    cell.attrs = style.attrs ?? Attr.none;
    cell.width = cellWidth;
  }

  /** Reduce a cell to a width-1 space, keeping its colors (clears a wide orphan). */
  protected blank(cell: Cell): void {
    cell.char = ' ';
    cell.width = 1;
  }

  /**
   * Before overwriting (x, y), repair any wide glyph this write would split: if
   * the existing cell is a wide lead, blank its continuation; if it is a
   * continuation, blank its lead. Prevents a stale half-glyph (PL-17).
   */
  protected clearOrphan(x: number, y: number): void {
    const cell = this.cellAt(x, y);
    if (cell.width === 2 && this.inBounds(x + 1, y)) {
      const cont = this.cellAt(x + 1, y);
      if (cont.width === 0) this.blank(cont);
    } else if (cell.width === 0 && this.inBounds(x - 1, y)) {
      const lead = this.cellAt(x - 1, y);
      if (lead.width === 2) this.blank(lead);
    }
  }

  /**
   * Write a single glyph at (x, y); out-of-bounds writes are silently clipped.
   * A wide glyph (display width 2) occupies (x, y) as a `width: 2` lead and
   * (x+1, y) as a `width: 0` continuation; a wide glyph in the last column has
   * no room for its continuation and clips to a space (never a half glyph).
   *
   * @param widthMode Width-resolution mode; defaults to RD-02's `'wcwidth'`.
   */
  public set(x: number, y: number, char: string, style: Style, widthMode: WidthMode = DEFAULT_WIDTH_MODE): void {
    if (!this.inBounds(x, y)) return;
    this.clearOrphan(x, y);
    const cp = char.codePointAt(0) ?? 0x20;
    const w = charWidth(cp, widthMode);
    if (w === 2) {
      if (this.inBounds(x + 1, y)) {
        this.clearOrphan(x + 1, y);
        this.write(this.cellAt(x, y), char, style, 2);
        this.write(this.cellAt(x + 1, y), '', style, 0);
      } else {
        // No room for the continuation in the last column: clip to a space.
        this.write(this.cellAt(x, y), ' ', style, 1);
      }
    } else {
      // Normal and zero-width inputs both occupy one cell here; a standalone
      // zero-width glyph via set() is degenerate, so store it as a width-1 cell.
      this.write(this.cellAt(x, y), char, style, 1);
    }
  }

  /** Read a cell, or `undefined` when out of bounds. */
  public get(x: number, y: number): Cell | undefined {
    if (!this.inBounds(x, y)) return undefined;
    return this.cellAt(x, y);
  }

  /** Fill a rectangle with a single glyph and style (width-correct via `set`). */
  public fillRect(x: number, y: number, w: number, h: number, char: string, style: Style): void {
    for (let row = 0; row < h; row += 1) {
      for (let col = 0; col < w; col += 1) {
        this.set(x + col, y + row, char, style);
      }
    }
  }

  /**
   * Draw a left-aligned string starting at (x, y), advancing by each glyph's
   * **display width** (wide glyphs advance 2 columns, AC-2). Glyphs outside the
   * buffer are clipped.
   *
   * @param widthMode Width-resolution mode; defaults to RD-02's `'wcwidth'`.
   * @returns The column just past the written text (display columns, not
   *   code-point count).
   */
  public text(x: number, y: number, str: string, style: Style, widthMode: WidthMode = DEFAULT_WIDTH_MODE): number {
    let col = x;
    for (const glyph of str) {
      this.set(col, y, glyph, style, widthMode);
      const cp = glyph.codePointAt(0) ?? 0x20;
      col += charWidth(cp, widthMode);
    }
    return col;
  }

  /**
   * Draw a framed box with an opaque interior fill and an optional centered
   * title. The real Unicode box glyphs are stored; the serializer substitutes
   * ASCII when `caps.glyphs.boxDrawing` is false (PL-9).
   *
   * @param variant `'double'` for ╔═╗ frames or `'single'` for ┌─┐.
   */
  public box(
    x: number,
    y: number,
    w: number,
    h: number,
    style: Style,
    variant: 'single' | 'double' = 'single',
    title?: string,
  ): void {
    if (w < 2 || h < 2) return;
    const g = BOX[variant];
    this.fillRect(x, y, w, h, ' ', style);
    this.set(x, y, g.tl, style);
    this.set(x + w - 1, y, g.tr, style);
    this.set(x, y + h - 1, g.bl, style);
    this.set(x + w - 1, y + h - 1, g.br, style);
    for (let col = 1; col < w - 1; col += 1) {
      this.set(x + col, y, g.h, style);
      this.set(x + col, y + h - 1, g.h, style);
    }
    for (let row = 1; row < h - 1; row += 1) {
      this.set(x, y + row, g.v, style);
      this.set(x + w - 1, y + row, g.v, style);
    }
    if (title) {
      const label = ` ${title} `;
      const tx = x + Math.max(1, Math.floor((w - [...label].length) / 2));
      this.text(tx, y, label, style);
    }
  }

  /**
   * Cast a drop shadow by darkening the cells one column right and one row below
   * the rectangle (Turbo Vision style). Only the colors change; glyphs stay.
   */
  public shadow(x: number, y: number, w: number, h: number, style: Style): void {
    const attrs = style.attrs ?? Attr.none;
    for (let row = 0; row < h; row += 1) {
      const cell = this.get(x + w, y + row + 1);
      if (cell) {
        cell.fg = style.fg;
        cell.bg = style.bg;
        cell.attrs = attrs;
      }
    }
    for (let col = 0; col < w; col += 1) {
      const cell = this.get(x + col + 1, y + h);
      if (cell) {
        cell.fg = style.fg;
        cell.bg = style.bg;
        cell.attrs = attrs;
      }
    }
  }

  /** Expose the grid as rows of cells for the serializer (read-only view). */
  public rows(): readonly Cell[][] {
    const out: Cell[][] = [];
    for (let y = 0; y < this.height; y += 1) {
      out.push(this.cells.slice(y * this.width, y * this.width + this.width));
    }
    return out;
  }
}
