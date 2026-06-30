/**
 * `Label` — a single-line `~hotkey~` caption linked to a control (Turbo Vision `TLabel`,
 * RD-06 AR-103/PA-10).
 *
 * Clicking the label or pressing its `Alt-<hotkey>` focuses the linked control, and the label
 * highlights (`labelSelected`) while that control is focused. Faithful to `TLabel::draw`
 * (`tlabel.cpp:45-74` — `moveCStr` hotkey accenting, whole-label color swap on link focus) and
 * `focusLink` (`tlabel.cpp:76-81`, called from `handleEvent` `:91-98`).
 *
 * Two RD-06 primitives make this work on the spine: `ev.focusView` focuses the link from `onEvent`
 * (PA-10), and the per-view focus-change signal (PF-009) lets the label observe the *link's* focus —
 * a plain `link.state.focused` read would not subscribe, and the focus manager invalidates only the
 * link, not the label. The `.js` extension in import specifiers is required by NodeNext resolution.
 */
import { View } from '../view/index.js';
import type { DrawContext, DispatchEvent } from '../view/index.js';
import { parseTilde, tildeSegments } from '../menu/index.js';
import type { ParsedLabel } from '../menu/index.js';

/**
 * A focus-linking caption. Not focusable itself; `postProcess` so its `Alt-<hotkey>` is caught after
 * the focused chain (the label is never in the focus chain).
 */
export class Label extends View {
  /** Catch `Alt-<hotkey>` in the post-process sweep (the label is not focusable). */
  override postProcess = true;
  /** The original `~X~`-marked text (re-split per paint via {@link tildeSegments}). */
  protected readonly raw: string;
  /** The linked control focused on click / hotkey. */
  protected readonly link: View;
  /** Parsed hotkey (lowercase char + column), for `Alt-<hotkey>` matching. */
  protected readonly parsed: ParsedLabel;

  /**
   * @param text A caption, optionally marking its hotkey with `~X~` (e.g. `'~N~ame'`).
   * @param link The control focused when the label is clicked or its `Alt-<hotkey>` is pressed.
   */
  constructor(text: string, link: View) {
    super();
    this.raw = text;
    this.link = link;
    this.parsed = parseTilde(text);
    // Repaint when the LINK's focus flips (PF-009): read its focus-change signal so the bound effect
    // re-runs on every flip; `draw()` then re-reads `link.state.focused` to pick label/labelSelected.
    this.onMount(() => this.bind(() => this.link.focusSignal()()));
  }

  /**
   * Paint the caption: the base text in `label` (or `labelSelected` while the link is focused), the
   * `~hotkey~` run accented in `labelShortcut` — TV swaps the whole label color on link focus and
   * always accents the hotkey.
   *
   * @param ctx The clipped, view-local paint context.
   */
  override draw(ctx: DrawContext): void {
    const base = ctx.color(this.link.state.focused ? 'labelSelected' : 'label');
    const accent = ctx.color('labelShortcut');
    const { width, height } = ctx.size;
    ctx.fillRect(0, 0, width, height, ' ', base);
    for (const seg of tildeSegments(this.raw)) {
      ctx.text(seg.col, 0, seg.text, seg.hot ? accent : base);
    }
  }

  /**
   * Focus the link on a mouse-down (delivered by hit-test) or an `Alt-<hotkey>` key (caught in the
   * post-process phase). Mirrors `TLabel::handleEvent` (`tlabel.cpp:91-98`).
   *
   * @param ev The dispatch envelope (carries `focusView`/`local` during real dispatch).
   */
  override onEvent(ev: DispatchEvent): void {
    const inner = ev.event;
    if (inner.type === 'mouse' && inner.kind === 'down') {
      ev.focusView?.(this.link);
      ev.handled = true;
      return;
    }
    // Alt-<hotkey> → focus the link (single-char Alt match, mirroring menubar's Alt-hotkey logic).
    if (
      inner.type === 'key' &&
      inner.alt &&
      this.parsed.hotkey !== null &&
      inner.key.length === 1 &&
      inner.key.toLowerCase() === this.parsed.hotkey
    ) {
      ev.focusView?.(this.link);
      ev.handled = true;
    }
  }
}
