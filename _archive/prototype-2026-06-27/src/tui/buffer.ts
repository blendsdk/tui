/**
 * A simple 2D character buffer with per-cell foreground/background colours.
 *
 * Ink lays children out with flexbox and has no concept of z-index or absolute
 * overlays, so we cannot float a dialog (with a drop shadow) on top of the
 * patterned desktop using components alone. Instead the whole screen is painted
 * into this buffer each frame and rendered as coloured text. This is exactly
 * how Turbo Vision itself composited its "draw buffers".
 */

import { BOX } from './theme.js';

/** A single screen cell: one glyph plus its colours. */
export interface Cell {
  char: string;
  fg: string;
  bg: string;
}

/** A foreground/background colour pair, used by all drawing helpers. */
export interface Style {
  fg: string;
  bg: string;
}

export class ScreenBuffer {
  public readonly width: number;
  public readonly height: number;
  protected readonly cells: Cell[];

  /**
   * Create a buffer pre-filled with a background style.
   *
   * @param width  Buffer width in columns (clamped to at least 1).
   * @param height Buffer height in rows (clamped to at least 1).
   * @param fill   The glyph/colours every cell starts with.
   */
  constructor(width: number, height: number, fill: Cell) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.cells = new Array(this.width * this.height);
    for (let i = 0; i < this.cells.length; i += 1) {
      this.cells[i] = { ...fill };
    }
  }

  /** True when (x, y) lies inside the buffer bounds. */
  protected inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /** Write a single cell, silently ignoring out-of-bounds writes. */
  public set(x: number, y: number, char: string, style: Style): void {
    if (!this.inBounds(x, y)) return;
    const cell = this.cells[y * this.width + x];
    cell.char = char;
    cell.fg = style.fg;
    cell.bg = style.bg;
  }

  /** Read a cell, or `undefined` when out of bounds. */
  public get(x: number, y: number): Cell | undefined {
    if (!this.inBounds(x, y)) return undefined;
    return this.cells[y * this.width + x];
  }

  /** Fill a rectangle with a single glyph and style. */
  public fillRect(x: number, y: number, w: number, h: number, char: string, style: Style): void {
    for (let row = 0; row < h; row += 1) {
      for (let col = 0; col < w; col += 1) {
        this.set(x + col, y + row, char, style);
      }
    }
  }

  /**
   * Draw a left-aligned string starting at (x, y). Characters that fall outside
   * the buffer are clipped. Returns the column just past the written text.
   */
  public text(x: number, y: number, str: string, style: Style): number {
    const chars = [...str];
    for (let i = 0; i < chars.length; i += 1) {
      this.set(x + i, y, chars[i], style);
    }
    return x + chars.length;
  }

  /**
   * Draw a framed box. The interior is filled with the box style so it reads as
   * an opaque panel. An optional centred title is drawn into the top border.
   *
   * @param variant 'double' for ╔═╗ frames (windows/dialogs) or 'single' for ┌─┐.
   */
  public box(
    x: number,
    y: number,
    w: number,
    h: number,
    style: Style,
    variant: 'double' | 'single' = 'double',
    title?: string,
  ): void {
    if (w < 2 || h < 2) return;
    const g = BOX[variant];

    // Opaque interior first, so we never see the desktop pattern through it.
    this.fillRect(x, y, w, h, ' ', style);

    // Corners and edges.
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
   * Cast a drop shadow for a rectangle by darkening the cells one column to the
   * right and one row below it — the hallmark of a Turbo Vision window.
   */
  public shadow(x: number, y: number, w: number, h: number, style: Style): void {
    for (let row = 0; row < h; row += 1) {
      const cell = this.get(x + w, y + row + 1);
      if (cell) {
        cell.fg = style.fg;
        cell.bg = style.bg;
      }
    }
    for (let col = 0; col < w; col += 1) {
      const cell = this.get(x + col + 1, y + h);
      if (cell) {
        cell.fg = style.fg;
        cell.bg = style.bg;
      }
    }
  }

  /** Expose rows for the renderer. Each row is a left-to-right array of cells. */
  public rows(): Cell[][] {
    const out: Cell[][] = [];
    for (let y = 0; y < this.height; y += 1) {
      out.push(this.cells.slice(y * this.width, y * this.width + this.width));
    }
    return out;
  }
}
