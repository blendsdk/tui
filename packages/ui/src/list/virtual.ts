/**
 * Virtual-scroll geometry for the list widgets (RD-11) — pure helpers decoded from Turbo Vision
 * `TListViewer::focusItem` (`source/tvision/tlstview.cpp:159`) + `focusItemNum` (`:175`).
 *
 * A single-column list shows `viewportRows` items starting at `topItem`; row `i` shows item
 * `topItem + i`. These helpers keep the focused item visible and clamp indices into range — the
 * only math the rows-renderer needs, kept pure + separately testable (no view state). `.js`
 * specifiers per NodeNext.
 */

/** Clamp an item index into `[0, range-1]` (TV `focusItemNum`: `<0 ⇒ 0`, `≥range ⇒ range-1`). */
export function clampIndex(index: number, range: number): number {
  if (range <= 0) return 0;
  return Math.min(range - 1, Math.max(0, index));
}

/**
 * The `topItem` that keeps `focused` visible in a `viewportRows`-tall single-column window (TV
 * `focusItem`, `tlstview.cpp:164-173`): scroll up if the focused item is above the window, down if it
 * is at/below the bottom, else leave `topItem` unchanged. The result is additionally clamped so the
 * window never scrolls past the end (`[0, max(0, range − viewportRows)]`).
 *
 * @param focused      The focused item index (assumed already clamped into range).
 * @param topItem      The current top item index.
 * @param viewportRows The number of visible rows.
 * @param range        The total item count.
 * @returns The adjusted `topItem`.
 */
export function keepVisible(focused: number, topItem: number, viewportRows: number, range: number): number {
  if (viewportRows <= 0) return 0;
  let top = topItem;
  if (focused < top)
    top = focused; // TV: item < topItem ⇒ topItem = item
  else if (focused >= top + viewportRows) top = focused - viewportRows + 1; // ⇒ topItem = item - size.y + 1
  const maxTop = Math.max(0, range - viewportRows);
  return Math.min(maxTop, Math.max(0, top));
}
