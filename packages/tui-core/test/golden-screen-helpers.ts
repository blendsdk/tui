/**
 * Shared golden-screen emulator adapter (RD-09 FR-2, plan doc 03-02).
 *
 * The one place that touches the `@xterm/headless` API: build a headless
 * emulator, feed bytes, and read back normalized cells (char + width + colour
 * mode). Isolating it here means an emulator API change is a one-file fix, and
 * importing it from both the spec and impl tests does not re-register the spec.
 *
 * `@xterm/headless` is a CommonJS package whose `.d.ts` exposes named exports but
 * whose runtime requires a default import; the test runner is tsx (esbuild),
 * which resolves this correctly. The `.js` extension on the engine import is
 * required by NodeNext ESM resolution (it resolves to the `.ts` source under tsx).
 */
import xtermHeadless from '@xterm/headless';
import type { Terminal as XTerm } from '@xterm/headless';

const { Terminal } = xtermHeadless;

/** A normalized colour read from one emulator cell channel. */
export interface CellColor {
  readonly mode: 'rgb' | 'palette' | 'default';
  readonly value: number;
}

/** A normalized emulator cell (the adapter's output). */
export interface GoldenCell {
  readonly char: string;
  readonly width: number;
  readonly fg: CellColor;
  readonly bg: CellColor;
}

/** Build a headless emulator of the given size with proposed (cell-reading) API on. */
export function makeTerm(cols: number, rows: number): XTerm {
  return new Terminal({ cols, rows, allowProposedApi: true });
}

/** Write bytes to the emulator and resolve once the parser has applied them. */
export function feed(term: XTerm, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, () => resolve()));
}

/** Normalize one emulator cell channel into a {@link CellColor} (mode + raw value). */
function colorOf(isDefault: boolean, isRgb: boolean, value: number): CellColor {
  const mode = isDefault ? 'default' : isRgb ? 'rgb' : 'palette';
  return { mode, value };
}

/** Fetch the raw emulator cell at (col, row), throwing if it is out of range. */
function rawCell(term: XTerm, col: number, row: number) {
  const line = term.buffer.active.getLine(row);
  if (!line) throw new Error(`golden: no line at row ${row}`);
  const cell = line.getCell(col);
  if (!cell) throw new Error(`golden: no cell at (${col}, ${row})`);
  return cell;
}

/**
 * Read and normalize one grid cell. `getChars()` returns `''` for an empty cell
 * and for the trailing continuation of a wide glyph; `getWidth()` distinguishes
 * 1 (normal), 2 (wide lead), and 0 (continuation).
 *
 * @param term The emulator.
 * @param col Zero-based column.
 * @param row Zero-based row.
 * @returns The normalized cell.
 */
export function readCell(term: XTerm, col: number, row: number): GoldenCell {
  const cell = rawCell(term, col, row);
  return {
    char: cell.getChars(),
    width: cell.getWidth(),
    fg: colorOf(cell.isFgDefault(), cell.isFgRGB(), cell.getFgColor()),
    bg: colorOf(cell.isBgDefault(), cell.isBgRGB(), cell.getBgColor()),
  };
}

/**
 * Whether the cell at (col, row) carries the inverse (reverse) attribute.
 * `@xterm/headless` exposes `isInverse()` as 0/1 on the proposed cell API; this
 * normalizes it to a boolean. Used by the a11y golden tests to prove focus is
 * conveyed by a non-colour attribute under NO_COLOR/mono (RD-10 AC-5).
 *
 * @param term The emulator.
 * @param col Zero-based column.
 * @param row Zero-based row.
 * @returns `true` when the cell is rendered inverse/reverse.
 */
export function reverseState(term: XTerm, col: number, row: number): boolean {
  return rawCell(term, col, row).isInverse() !== 0;
}
