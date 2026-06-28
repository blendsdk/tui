/**
 * Cursor control sequences (RD-04, M7, plan doc 03-04, PL-8).
 *
 * Show/hide and absolute move are capability-independent and always safe.
 * Cursor **shape** (DECSCUSR) is deferred (DEF-1) — no capability field gates
 * it — so it is intentionally absent here.
 */

import { CSI, cursorTo } from './ansi.js';

/** Capability-independent cursor controls (show/hide/absolute move). */
export const cursor = {
  /** Show the text cursor (`CSI ?25 h`). */
  show(): string {
    return `${CSI}?25h`;
  },
  /** Hide the text cursor (`CSI ?25 l`). */
  hide(): string {
    return `${CSI}?25l`;
  },
  /**
   * Move the cursor to a **1-based** (row, col) (`CSI row;col H`).
   *
   * @param row 1-based row (top is 1).
   * @param col 1-based column (left is 1).
   */
  to(row: number, col: number): string {
    return cursorTo(row, col);
  },
} as const;
