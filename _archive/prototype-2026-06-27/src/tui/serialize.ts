/**
 * Serialise a {@link ScreenBuffer} into a single ANSI string that paints the
 * whole frame in place.
 *
 * Each row is positioned absolutely with a cursor move and never erased first;
 * because the buffer is opaque (every cell is painted, full width), overwriting
 * leaves no stale characters and produces no flicker. Adjacent cells sharing a
 * colour are merged so we emit one SGR sequence per run rather than per cell.
 */

import type { Cell, ScreenBuffer } from './buffer.js';
import { RESET, bg, cursorTo, fg } from './ansi.js';

/** Build the in-place ANSI frame for a buffer (cursor starts at home). */
export function serialize(buffer: ScreenBuffer): string {
  const rows = buffer.rows();
  const out: string[] = [];

  for (let y = 0; y < rows.length; y += 1) {
    out.push(cursorTo(y + 1, 1));
    out.push(serializeRow(rows[y]));
    out.push(RESET);
  }

  return out.join('');
}

/** Serialise one row, merging runs of identical-coloured cells. */
function serializeRow(row: Cell[]): string {
  let result = '';
  let runText = '';
  let runFg = '';
  let runBg = '';

  const flush = (): void => {
    if (runText === '') return;
    result += fg(runFg) + bg(runBg) + runText;
    runText = '';
  };

  for (const cell of row) {
    if (cell.fg !== runFg || cell.bg !== runBg) {
      flush();
      runFg = cell.fg;
      runBg = cell.bg;
    }
    runText += cell.char;
  }
  flush();

  return result;
}
