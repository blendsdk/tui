/**
 * `Button` — a focusable command button (Turbo Vision `TButton`, RD-06 AC-3/PA-1/PA-7/PA-8).
 *
 * Draws the label with TV's block-glyph drop-shadow and activates on click / `Space` (focused) /
 * `Alt-<hotkey>`, and — when `default` — on `Enter` if unconsumed; activation emits a typed command
 * (`ev.emit`) and/or calls `onClick`. Faithful to `TButton::drawState` (`tbutton.cpp:102-165`): the
 * label is centered (no brackets — the `[ ]` `markers` only appear when `showMarkers` is on, i.e. the
 * monochrome palette, `tbutton.cpp:154-158`), with the `▄`(0xDC)/`█`(0xDB)/`▀`(0xDF) shadow
 * (`shadows = "\xDC\xDB\xDF"`, `tbutton.cpp:116/143-146`) drawn down the right column and across the
 * bottom row in the `buttonShadow` role — TV `cShadow = getColor(8)` = `cpButton[8]=0x0F` →
 * cpGrayDialog slot 15 → `cpAppColor[0x2E]=0x70` = black-on-lightGray, the dialog's own background with
 * black ink (NOT the window drop-shadow). The pressed state shifts the face right one cell and drops
 * the shadow (`down` branch, `tbutton.cpp:130-135`), and the state→role mapping is `tbutton.cpp:107-118`.
 * The hardware caret is deferred (DEF-19). The `.js` extension is required by NodeNext resolution.
 */
import { View } from '../view/index.js';
import type { DrawContext, DispatchEvent } from '../view/index.js';
import { parseTilde, tildeSegments } from '../menu/index.js';
import type { ParsedLabel } from '../menu/index.js';
import { stringWidth } from './measure.js';

/** Construction options for {@link Button}. */
export interface ButtonOptions {
  /** Command emitted via `ev.emit` on activation (PA-1). */
  command?: string;
  /** Called on activation, in addition to {@link command}. */
  onClick?: () => void;
  /** Also activate on `Enter` when the key is unconsumed by the focused chain (PA-7). */
  default?: boolean;
  /** Greyed + inert; a reactive getter re-greys/-enables when its signals change. */
  disabled?: boolean | (() => boolean);
}

/** A focusable command button with a TV block-glyph drop-shadow. */
export class Button extends View {
  /** `Space` activates when focused. */
  override focusable = true;
  /** Catch `Alt-<hotkey>` / (default) `Enter` after the focused chain (PA-7). */
  override postProcess = true;

  /** The original `~X~`-marked label. */
  protected readonly raw: string;
  /** Parsed hotkey (lowercase char + column) for `Alt-<hotkey>` matching. */
  protected readonly parsed: ParsedLabel;
  /** Command emitted on activation, if any. */
  protected readonly command?: string;
  /** Click callback fired on activation, if any. */
  protected readonly clickHandler?: () => void;
  /** Whether this is the dialog default (also activates on unconsumed `Enter`). */
  protected readonly isDefault: boolean;
  /** The disabled flag or reactive getter. */
  protected readonly disabledOpt: boolean | (() => boolean);
  /** Visual pressed state (mouse-down inside the face, before release). */
  protected pressed = false;

  /**
   * @param text The label, optionally marking its hotkey with `~X~` (e.g. `'~O~K'`).
   * @param opts `command` / `onClick` / `default` / `disabled` (see {@link ButtonOptions}).
   */
  constructor(text: string, opts: ButtonOptions = {}) {
    super();
    this.raw = text;
    this.parsed = parseTilde(text);
    this.command = opts.command;
    this.clickHandler = opts.onClick;
    this.isDefault = opts.default ?? false;
    this.disabledOpt = opts.disabled ?? false;
    this.state.disabled = this.resolveDisabled(); // initial value (drives focusability)
    if (typeof this.disabledOpt === 'function') {
      // Reflect a reactive disabled getter into `state.disabled` (focusability) + repaint (PA-1).
      this.onMount(() =>
        this.bind(
          () => this.resolveDisabled(),
          (v) => {
            this.state.disabled = v;
          },
        ),
      );
    }
  }

  /** Resolve the disabled flag (evaluating the getter if reactive). */
  protected resolveDisabled(): boolean {
    return typeof this.disabledOpt === 'function' ? this.disabledOpt() : this.disabledOpt;
  }

  /**
   * Paint the centered label with the state face role + the TV block-glyph drop-shadow, mirroring
   * `TButton::drawState` for the color palette (`showMarkers` off → no `[ ]` brackets).
   *
   * @param ctx The clipped, view-local paint context.
   */
  override draw(ctx: DrawContext): void {
    const disabled = this.state.disabled;
    const faceRole = disabled
      ? 'buttonDisabled'
      : this.state.focused
        ? 'buttonFocused' // TV "selected" (sfActive + sfSelected)
        : this.isDefault
          ? 'buttonDefault'
          : 'button'; // TV "normal"
    const face = ctx.color(faceRole);
    const accent = ctx.color('buttonShortcut');
    const shadow = ctx.color('buttonShadow'); // TV cShadow = getColor(8) = 0x70 (black-on-lightGray)
    const down = this.pressed;
    const { width: w, height: h } = ctx.size;
    if (w < 2 || h < 2) return; // TV needs ≥2 rows: content row(s) + the bottom shadow row
    const s = w - 1; // last column index
    const titleRow = Math.floor(h / 2) - 1; // TV T = size.y/2 - 1
    const bottomFill = down ? ' ' : '▀'; // shadows[2] up; blank when pressed (no shadow)

    // Content rows y = 0..h-2 (all but the bottom shadow row).
    for (let y = 0; y <= h - 2; y += 1) {
      ctx.fillRect(0, y, w, 1, ' ', face); // moveChar(0,' ',cButton,size.x)
      ctx.text(0, y, ' ', shadow); // putAttribute(0,cShadow): col 0 → shadow (grey on a grey dialog)
      let titleIndent: number;
      if (down) {
        ctx.text(1, y, ' ', shadow); // putAttribute(1,cShadow): pressed shifts the face right one cell
        titleIndent = 2;
      } else {
        ctx.text(s, y, y === 0 ? '▄' : '█', shadow); // shadows[0]/[1] down the right column
        titleIndent = 1;
      }
      if (y === titleRow) this.drawTitle(ctx, y, s, titleIndent, face, accent);
    }
    // Bottom shadow row: two leading spaces then the fill across cols 2..s (tbutton.cpp:162-163).
    const by = h - 1;
    ctx.fillRect(0, by, Math.min(2, w), 1, ' ', shadow);
    if (s - 1 > 0) ctx.fillRect(2, by, s - 1, 1, bottomFill, shadow);
  }

  /**
   * Draw the centered label on `row` (TV `drawTitle`, `tbutton.cpp:71-99`): with `l =
   * (s - textWidth - 1) / 2` clamped to ≥ 1, place the `~hotkey~`-accented runs starting at column
   * `indent + l`. No brackets — TV's `[ ]` markers are `showMarkers`-only (monochrome).
   *
   * @param ctx    The clipped, view-local paint context.
   * @param row    The title row (view-local y).
   * @param s      The last column index (`width - 1`).
   * @param indent TV's `i` — 1 normally, 2 when pressed (the face shifts right).
   * @param face   The resolved face style for non-hotkey glyphs.
   * @param accent The resolved `buttonShortcut` style for the `~hotkey~` glyph.
   */
  protected drawTitle(
    ctx: DrawContext,
    row: number,
    s: number,
    indent: number,
    face: ReturnType<DrawContext['color']>,
    accent: ReturnType<DrawContext['color']>,
  ): void {
    const textW = stringWidth(this.parsed.text);
    const l = Math.max(1, Math.floor((s - textW - 1) / 2));
    for (const seg of tildeSegments(this.raw)) {
      ctx.text(indent + l + seg.col, row, seg.text, seg.hot ? accent : face);
    }
  }

  /**
   * Handle activation: click (down-then-up inside the face), `Space` (focused), `Alt-<hotkey>`, and
   * (default) unconsumed `Enter`. A disabled button is fully inert. Mirrors `TButton::handleEvent`.
   *
   * @param ev The dispatch envelope (carries `emit`/`local` during real dispatch).
   */
  override onEvent(ev: DispatchEvent): void {
    if (this.state.disabled) return; // greyed + inert (PA-1; also non-focusable)
    const inner = ev.event;

    if (inner.type === 'mouse') {
      if (inner.kind === 'down' && this.inFace(ev.local)) {
        this.pressed = true;
        this.invalidate();
        ev.handled = true;
      } else if (inner.kind === 'up' && this.pressed) {
        this.pressed = false;
        this.invalidate();
        if (this.inFace(ev.local)) this.activate(ev); // release inside ⇒ activate; outside ⇒ cancel
        ev.handled = true;
      }
      return;
    }

    if (inner.type === 'key') {
      const isHotkey =
        inner.alt &&
        this.parsed.hotkey !== null &&
        inner.key.length === 1 &&
        inner.key.toLowerCase() === this.parsed.hotkey;
      if ((inner.key === 'space' && this.state.focused) || isHotkey || (inner.key === 'enter' && this.isDefault)) {
        this.activate(ev);
        ev.handled = true;
      }
    }
  }

  /** Whether a view-local point lies in the clickable face (excludes the shadow column + row). */
  protected inFace(local: DispatchEvent['local']): boolean {
    if (local === undefined) return false;
    return local.x >= 0 && local.y >= 0 && local.x < this.bounds.width - 1 && local.y < this.bounds.height - 1;
  }

  /** Emit the command (if any) and fire `onClick` (PA-1). A no-op when disabled (guarded by caller). */
  protected activate(ev: DispatchEvent): void {
    if (this.command !== undefined) ev.emit?.(this.command);
    this.clickHandler?.();
  }
}
