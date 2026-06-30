/**
 * `MenuPopup` — a presentational dropdown (RD-05 AR-68).
 *
 * A `View` rendered from the controller's per-level state: a bordered list of item rows where the
 * highlighted row uses the `menuSelected` role, a disabled item is greyed, a `sub` item shows a `▸`,
 * and a separator is a horizontal rule. It owns no navigation state — the `MenuBar`-owned controller
 * (controller.ts) drives `items`/`highlight` and positions it (`layout.rect`) in the overlay.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { View } from '../view/index.js';
import type { DrawContext, DispatchEvent } from '../view/index.js';
import type { Style } from '@jsvision/core';
import type { LayoutProps } from '../layout/index.js';
import type { MenuItem } from './builders.js';
import { parseTilde } from './builders.js';

/** The sub-menu indicator glyph drawn at the right of a `sub` row. */
const SUB_ARROW = '▸';

/** A presentational dropdown driven by the controller (mounted into the overlay). */
export class MenuPopup extends View {
  /** The level's items. */
  items: readonly MenuItem[] = [];
  /** The highlighted row index. */
  highlight = 0;
  /** Whether a command is currently enabled (for greying). */
  isEnabled: (command: string) => boolean = () => true;
  /** Controller callback for a mouse-down on a content row (0-based item index). */
  onPick?: (row: number) => void;
  /** Free-floating placement in the overlay; the controller sets `rect`. */
  override layout: LayoutProps = { position: 'absolute' };

  /**
   * Route a mouse-down on an item row to the controller (AR-68). The border occupies row/col 0 and
   * the last row/col; an interior `y` maps to item index `y - 1`. Out-of-range clicks are ignored.
   *
   * @param ev The dispatch envelope (mouse coords are view-local in `ev.local`).
   */
  override onEvent(ev: DispatchEvent): void {
    const inner = ev.event;
    if (inner.type !== 'mouse' || inner.kind !== 'down' || ev.local === undefined) return;
    const row = ev.local.y - 1; // skip the top border row
    if (row >= 0 && row < this.items.length) {
      this.onPick?.(row);
      ev.handled = true;
    }
  }

  /** Draw the bordered item list (highlighted = `menuSelected`; disabled greyed; `sub` shows `▸`). */
  draw(ctx: DrawContext): void {
    const w = ctx.size.width;
    const base = ctx.color('menuBar');
    const selected = ctx.color('menuSelected');
    const disabled: Style = { fg: ctx.role('shadow').fg, bg: base.bg };

    ctx.box(0, 0, w, ctx.size.height, base); // border + opaque interior

    for (let i = 0; i < this.items.length; i += 1) {
      const node = this.items[i];
      const y = i + 1;
      if (node.kind === 'separator') {
        ctx.fillRect(1, y, w - 2, 1, '─', base);
        continue;
      }
      const enabled = node.kind === 'item' ? this.isEnabled(node.command) : true;
      const style = i === this.highlight ? selected : enabled ? base : disabled;
      if (i === this.highlight) ctx.fillRect(1, y, w - 2, 1, ' ', selected); // highlight bar
      const label = parseTilde(node.title);
      ctx.text(1, y, label.text, style);
      if (node.kind === 'sub') ctx.text(w - 2, y, SUB_ARROW, style);
    }
  }
}
