/**
 * `ScrollBar` — a Turbo Vision `TScrollBar` (RD-11 AC-1, PA-14/PA-4/PA-10/PA-16).
 *
 * Faithful transcription of `source/tvision/tscrlbar.cpp` (decode recorded here per the fidelity
 * directive — GATE-1 verified against the source, GATE-2 diffed after):
 *
 *   • **Glyphs** `tvtext1.cpp:113-114` (`TScrollChars`, positional): vertical `{▲0x1E,▼0x1F,▒0xB1,
 *     ■0xFE,▓0xB2}`, horizontal `{◄0x11,►0x10,▒,■,▓}`. CP437 → unambiguous-narrow Unicode.
 *   • **`drawPos(pos)`** `:65` (from `draw()` `:60`): along the long axis, `s=getSize()-1`; col 0 =
 *     start arrow `getColor(2)`; cols `1..s-1` = track `▒` `getColor(1)` (or all `▓` `getColor(1)` when
 *     `maxVal==minVal`); thumb `■` `getColor(3)` overwrites the track at `pos`; col `s` = end arrow
 *     `getColor(2)`.
 *   • **`getSize()`** `:97` = `max(3, len)`; **`getPos()`** `:89` =
 *     `((value-min)*(getSize()-3) + (r>>1)) / r + 1`, `r=max-min` (`r==0 ⇒ 1`) ⇒ `pos ∈ [1,getSize()-2]`.
 *   • **`getPartCode()`** `:114` (extent grown by (1,1)): axis coord `mark` → `mark==pos` thumb;
 *     `mark<1` line-back arrow; `1≤mark<pos` page-back; `pos<mark<s` page-fwd; `mark≥s` line-fwd arrow;
 *     vertical adds 4 to non-indicator parts. **`scrollStep(part)`** `:283`: bit1 = page(`pgStep`) vs
 *     arrow(`arStep`), bit0 = fwd(+) vs back(−).
 *   • **Thumb drag** `:192-201`: `i=clamp(mark,1,s-1)`; if `s>2`,
 *     `value = ((i-1)*(max-min) + ((s-2)>>1)) / (s-2) + min`. **Wheel** `:148/:169`: `value ± 3·arStep`.
 *   • **Palette** `cpScrollBar="\x04\x05\x05"` `:37` → in a gray dialog all three resolve to `0x13`
 *     **cyan-on-blue**: track/disabled `getColor(1)` → `scrollBarPage`; arrows + thumb `getColor(2/3)`
 *     → `scrollBarControls`. Page == controls in colour; the glyph (`■` vs `▒`) is the distinction.
 *
 * The bar is passive chrome (`focusable=false`): a `Scroller`/`ListView` owns the keyboard and drives
 * `value`; the bar owns only mouse (arrow/page/thumb-drag/wheel).
 *
 * **GATE-2 (AFTER-diff, verified against `tscrlbar.cpp`):** every drawn fact matches cell-by-cell —
 * glyphs, the `drawPos` column math, the `getColor(1/2/3)` role resolution, `getPos`/`getSize`,
 * `getPartCode`, `scrollStep`, wheel `3·arStep`, and the thumb-drag mapping. Two **behavioral**
 * adaptations to our reactive event model (the gate governs drawing/geometry/colour, all matching):
 * TV's arrow **auto-repeat** (`while mouseEvent(event, evMouseAuto)`, `:190`) is one step per click
 * here (no `evMouseAuto` timer in our model); and TV's `cmScrollBarChanged` owner **broadcast**
 * (`scrollDraw`, `:279`) is replaced by the two-way `value` signal the owner observes (PA-8).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { View } from '../view/index.js';
import type { DrawContext, DispatchEvent } from '../view/index.js';
import type { Signal } from '../reactive/index.js';

/** Vertical scroll glyphs (`tvtext1.cpp:113`): start ▲, end ▼. */
const V_START = '▲';
const V_END = '▼';
/** Horizontal scroll glyphs (`tvtext1.cpp:114`): start ◄, end ►. */
const H_START = '◄';
const H_END = '►';
/** Shared track/thumb/disabled glyphs. */
const TRACK = '▒';
const THUMB = '■';
const DISABLED = '▓';

/** TV `TScrollBar` part codes (`views.h:119-127`). Vertical adds 4 to non-indicator parts. */
const SB_LINE_BACK = 0; // sbLeftArrow / +4 sbUpArrow
const SB_PAGE_BACK = 2; // sbPageLeft / +4 sbPageUp
const SB_PAGE_FWD = 3; // sbPageRight / +4 sbPageDown
const SB_INDICATOR = 8;

/** Construction options for {@link ScrollBar}. */
export interface ScrollBarOptions {
  /** Two-way position binding (AR-111); reading renders, gestures write back, clamped to `[min,max]`. */
  value: Signal<number>;
  /** Range minimum (default 0). */
  min?: number;
  /** Range maximum (default 0 ⇒ disabled, whole track drawn `▓`). */
  max?: number;
  /** Page-click step (default: the axis length − 1). */
  pageStep?: number;
  /** Arrow-click step (default 1); wheel steps `3·arrowStep`. */
  arrowStep?: number;
  /** Long axis (default `'vertical'`). */
  orientation?: 'vertical' | 'horizontal';
}

/** A Turbo Vision scroll bar: arrows + a page track + a proportional thumb, driven by mouse. */
export class ScrollBar extends View {
  override focusable = false; // passive chrome — the owning viewer drives the keys (PA-2/PA-8)
  /** The two-way bound position (source of truth). */
  protected readonly value: Signal<number>;
  /** Range minimum (mutable — an owner `Scroller`/`ListView` re-limits via {@link setRange}, TV `setLimit`). */
  protected min: number;
  /** Range maximum (mutable — see {@link setRange}). */
  protected max: number;
  /** Explicit page step, or `undefined` for the axis-length default (mutable via {@link setRange}). */
  protected pageStepOpt?: number;
  protected readonly arrowStep: number;
  protected readonly vertical: boolean;
  /** True while a thumb-drag gesture holds the pointer capture. */
  protected dragging = false;

  /**
   * @param opts `value` (two-way signal) + optional `min`/`max`/`pageStep`/`arrowStep`/`orientation`.
   */
  constructor(opts: ScrollBarOptions) {
    super();
    this.value = opts.value;
    this.min = opts.min ?? 0;
    this.max = opts.max ?? 0;
    this.pageStepOpt = opts.pageStep;
    this.arrowStep = opts.arrowStep ?? 1;
    this.vertical = (opts.orientation ?? 'vertical') === 'vertical';
    // Repaint when the position changes externally (the owner scrolls, or a bound signal write).
    this.onMount(() =>
      this.bind(
        () => this.value(),
        () => undefined,
      ),
    );
  }

  /**
   * Re-limit the bar at runtime (TV `TScrollBar::setParams`/`setLimit`, `tscrlbar.cpp:305`) — an
   * owning `Scroller`/`ListView` calls this when its viewport or content extent changes. The bound
   * `value` is not written here; `readValue()` clamps it into the new range on read, matching the
   * getPos/setValue clamp (so a shrunk range never over-scrolls or throws).
   *
   * @param min      New range minimum.
   * @param max      New range maximum (raised to `min` if smaller).
   * @param pageStep New page step, or `undefined` to keep the axis-length default.
   */
  setRange(min: number, max: number, pageStep?: number): void {
    this.min = min;
    this.max = Math.max(min, max);
    this.pageStepOpt = pageStep;
  }

  /** The drawn/measured long-axis length in cells (height when vertical, else width). */
  protected axisLen(): number {
    return this.vertical ? this.bounds.height : this.bounds.width;
  }

  /** TV `getSize()` — the effective bar length, never below 3 (`tscrlbar.cpp:97`). */
  protected getSize(len: number): number {
    return Math.max(3, len);
  }

  /** The current position clamped into `[min,max]` (a stray owner write can't index out of range). */
  protected readValue(): number {
    return Math.min(this.max, Math.max(this.min, this.value()));
  }

  /**
   * TV `getPos()` (`tscrlbar.cpp:89`) — the thumb cell along the axis, in `[1, getSize()-2]`.
   *
   * @param len The long-axis length in cells.
   * @returns The 0-based thumb index.
   */
  protected getPos(len: number): number {
    const r = this.max - this.min;
    const size = this.getSize(len);
    if (r === 0) return 1;
    const pos = Math.floor(((this.readValue() - this.min) * (size - 3) + (r >> 1)) / r) + 1;
    return Math.min(size - 2, Math.max(1, pos));
  }

  /** The effective page step (option, else the axis length − 1; TV owners set `size-1`). */
  protected pageStep(): number {
    return this.pageStepOpt ?? Math.max(1, this.axisLen() - 1);
  }

  /**
   * Paint the bar exactly as TV `drawPos` (`tscrlbar.cpp:65`): arrows at the two ends in
   * `scrollBarControls`, a `▒` track (or full `▓` when disabled) in `scrollBarPage`, and the `■` thumb
   * in `scrollBarControls` at `getPos()`.
   *
   * @param ctx The clipped, view-local paint context.
   */
  override draw(ctx: DrawContext): void {
    const len = this.vertical ? ctx.size.height : ctx.size.width;
    const s = this.getSize(len) - 1; // last drawn index
    const controls = ctx.color('scrollBarControls');
    const page = ctx.color('scrollBarPage');
    const startGlyph = this.vertical ? V_START : H_START;
    const endGlyph = this.vertical ? V_END : H_END;

    this.put(ctx, 0, startGlyph, controls); // start arrow (getColor 2)
    if (this.max === this.min) {
      for (let i = 1; i < s; i += 1) this.put(ctx, i, DISABLED, page); // disabled fill (getColor 1)
    } else {
      for (let i = 1; i < s; i += 1) this.put(ctx, i, TRACK, page); // track (getColor 1)
      this.put(ctx, this.getPos(len), THUMB, controls); // thumb (getColor 3)
    }
    this.put(ctx, s, endGlyph, controls); // end arrow (getColor 2)
  }

  /** Write one glyph at axis index `i` (col 0 / row 0 on the cross axis). */
  protected put(ctx: DrawContext, i: number, char: string, style: ReturnType<DrawContext['color']>): void {
    if (this.vertical) ctx.text(0, i, char, style);
    else ctx.text(i, 0, char, style);
  }

  /**
   * Route mouse gestures (the bar owns no keys). Arrow/page click steps once; a thumb click captures
   * the pointer and maps subsequent moves to `value`; wheel steps `3·arrowStep`.
   *
   * @param ev The dispatch envelope (carries `local` + the `setCapture`/`releaseCapture` seams).
   */
  override onEvent(ev: DispatchEvent): void {
    const inner = ev.event;
    if (inner.type === 'wheel') {
      const back = this.vertical ? inner.dir === 'up' : inner.dir === 'left';
      const fwd = this.vertical ? inner.dir === 'down' : inner.dir === 'right';
      if (back || fwd) {
        this.setValue(this.readValue() + 3 * (back ? -this.arrowStep : this.arrowStep));
        ev.handled = true;
      }
      return;
    }
    if (inner.type !== 'mouse') return;
    const local = ev.local;
    if (local === undefined) return;
    const mark = this.vertical ? local.y : local.x;
    if (inner.kind === 'down') this.handleDown(ev, mark);
    else if (inner.kind === 'move' || inner.kind === 'drag') this.handleDrag(ev, mark);
    else if (inner.kind === 'up') this.handleUp(ev);
  }

  /** Mouse-down: thumb ⇒ start a captured drag; arrow/page ⇒ step once (TV `scrollStep`). */
  protected handleDown(ev: DispatchEvent, mark: number): void {
    const len = this.axisLen();
    const s = this.getSize(len) - 1;
    const pos = this.getPos(len);
    if (mark === pos) {
      this.dragging = true;
      ev.setCapture?.(this); // PA-16 — capture so the drag tracks off the 1-cell column
    } else {
      this.setValue(this.readValue() + this.scrollStep(this.partCode(mark, pos, s)));
    }
    ev.handled = true;
  }

  /** Captured drag: map the axis position back to a proportional `value` (TV `:192-201`). */
  protected handleDrag(ev: DispatchEvent, mark: number): void {
    if (!this.dragging) return;
    const len = this.axisLen();
    const s = this.getSize(len) - 1;
    const i = Math.min(s - 1, Math.max(1, mark)); // keep the thumb between the arrows
    if (s > 2) {
      const span = this.max - this.min;
      this.setValue(Math.floor(((i - 1) * span + ((s - 2) >> 1)) / (s - 2)) + this.min);
    }
    ev.handled = true;
  }

  /** Mouse-up: end a drag + release the capture. */
  protected handleUp(ev: DispatchEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    ev.releaseCapture?.();
    ev.handled = true;
  }

  /**
   * TV `getPartCode` (`tscrlbar.cpp:114`) — the axis coord `mark` → a part code, vertical parts +4.
   *
   * @param mark The along-axis click cell.
   * @param pos  The current thumb cell.
   * @param s    `getSize()-1` (the last cell index).
   */
  protected partCode(mark: number, pos: number, s: number): number {
    if (mark === pos) return SB_INDICATOR;
    let part: number;
    if (mark < 1) part = SB_LINE_BACK;
    else if (mark < pos) part = SB_PAGE_BACK;
    else if (mark < s) part = SB_PAGE_FWD;
    else part = SB_LINE_BACK + 1; // line-fwd (sbRightArrow/+4 sbDownArrow)
    return this.vertical ? part + 4 : part;
  }

  /** TV `scrollStep` (`tscrlbar.cpp:283`): bit1 ⇒ page vs arrow, bit0 ⇒ forward vs back. */
  protected scrollStep(part: number): number {
    const step = part & 2 ? this.pageStep() : this.arrowStep;
    return part & 1 ? step : -step;
  }

  /** Write the bound position, clamped to `[min,max]`. */
  protected setValue(next: number): void {
    const clamped = Math.min(this.max, Math.max(this.min, next));
    if (clamped !== this.value()) this.value.set(clamped);
  }
}
