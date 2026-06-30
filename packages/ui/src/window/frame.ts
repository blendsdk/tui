/**
 * Window frame — drawing + hit-zone geometry (RD-05 AR-67/AR-74, PA-8).
 *
 * A Window-internal helper (not a `View`): `drawFrame` paints the border, centered title, window
 * number, close box `[×]`, zoom box `[↑]`/`[↕]`, and — on the active resizable window — the SE drag
 * grip `─┘` over a window-local rect; `frameZoneAt` classifies a window-local point into the zone its
 * mouse-down means. Border + title colors come from `ctx.role(role).border`/`.title` (the Phase-0
 * raw-role accessor), so the active (`window`) and inactive (`windowInactive`) frames differ in
 * border/title — not just fg (AR-73/PA-1).
 *
 * The chrome glyphs and their columns replicate Turbo Vision's `TFrame::draw` exactly (`tframe.cpp:
 * 35-124`, icon bytes `tvtext1.cpp:77-81`): close/zoom/unzoom icons `[■]`/`[↑]`/`[↕]`, the bottom-right
 * `dragIcon = "─┘"` and bottom-left `dragLeftIcon = "└─"` grips. TV draws the close/zoom boxes and
 * both grips ONLY on the active window (`sfActive`); the number is drawn for active and passive alike.
 * The `~..~` markers in TV's icon strings toggle each icon's inner glyph (and the grip glyphs) to
 * `cFrame`'s high byte — a brighter accent (`window.icon`, brightGreen on blue) — while the `[ ]`
 * brackets keep the frame color. Close uses `×` rather than TV's CP437 `■`, a deliberate exception:
 * `■` is East-Asian ambiguous-width and misaligns (see CLAUDE.md).
 *
 * Chrome layout (window-local, size w×h): close `[×]` at cols 2–4, zoom `[↑]`/`[↕]` at cols w-5…w-3,
 * number at col w-7, title centered + truncated to ≤ w-10 (−6 for the boxes, −4 for the number), grips
 * `└─` at cols (0,1) and `─┘` at cols (w-2, w-1) of row h-1. Boxes are drawn last so they overlay the
 * title. Both grips are live: the SE corner (`resize`) grows the bottom-right (TV `dmDragGrow`), the
 * SW grip cells (`resize-left`) grow the bottom-left with the right edge anchored (TV `dmDragGrowLeft`,
 * RD-10 AR-91). The `.js` extension is required by NodeNext ESM resolution.
 */
import type { Style } from '@jsvision/core';
import type { DrawContext, Point } from '../view/index.js';
import type { Size2D } from '../layout/index.js';

/** A frame hit-zone — what a mouse-down at a window-local point means. */
export type FrameZone = 'close' | 'zoom' | 'resize' | 'resize-left' | 'title' | 'interior' | 'border';

/** The window flags that gate which affordances exist (a disabled affordance is not a hit-zone). */
export interface WindowFlags {
  movable: boolean;
  resizable: boolean;
  zoomable: boolean;
  closable: boolean;
}

/** The window state the frame draws. */
export interface FrameState {
  title: string;
  number?: number;
  active: boolean;
  zoomed: boolean;
  /** Whether the window can be resized — gates the SE drag grip (TV draws it only for `wfGrow`). */
  resizable: boolean;
}

/** The theme role the frame is drawn in. */
export type FrameRole = 'window' | 'windowInactive';

/** Glyphs of the chrome affordances (stored verbatim in the buffer; serialize handles fallback). */
const CLOSE_GLYPH = '×';
const MAXIMIZE_GLYPH = '↑'; // TV zoomIcon (CP437 0x18)
const RESTORE_GLYPH = '↕'; // TV unZoomIcon (CP437 0x12 / U+2195) — the restore (un-maximize) arrow

/** A rectangular-border glyph set (corners + horizontal/vertical edges). */
interface BorderGlyphs {
  readonly tl: string;
  readonly tr: string;
  readonly bl: string;
  readonly br: string;
  readonly h: string;
  readonly v: string;
}

/** Single-line border (CP437 0xDA/C4/BF/B3/C0/D9) — the inactive/passive window, as in Turbo Vision. */
const SINGLE_BORDER: BorderGlyphs = { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' };
/** Double-line border (CP437 0xC9/CD/BB/BA/C8/BC) — the active (focused) window, as in Turbo Vision. */
const DOUBLE_BORDER: BorderGlyphs = { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' };

/**
 * Draw a rectangular border with `glyphs` over a `w×h` window-local rect, filling the interior
 * opaquely first so content children inset over a solid field.
 *
 * @param ctx    The window's clipped draw context.
 * @param w      Full width (border included).
 * @param h      Full height (border included).
 * @param glyphs The corner/edge glyph set (single- or double-line).
 * @param style  The border fg/bg style.
 */
function drawBorder(ctx: DrawContext, w: number, h: number, glyphs: BorderGlyphs, style: Style): void {
  ctx.fillRect(0, 0, w, h, ' ', style); // opaque interior
  ctx.text(0, 0, glyphs.tl, style);
  ctx.text(w - 1, 0, glyphs.tr, style);
  ctx.text(0, h - 1, glyphs.bl, style);
  ctx.text(w - 1, h - 1, glyphs.br, style);
  for (let col = 1; col < w - 1; col += 1) {
    ctx.text(col, 0, glyphs.h, style);
    ctx.text(col, h - 1, glyphs.h, style);
  }
  for (let row = 1; row < h - 1; row += 1) {
    ctx.text(0, row, glyphs.v, style);
    ctx.text(w - 1, row, glyphs.v, style);
  }
}

/**
 * Draw the window frame chrome over its window-local rect (AR-67/AR-74). The border box also fills
 * the interior with the role background; the content children compose over that inset (PA-8).
 *
 * @param ctx   The window's clipped draw context (view-local origin).
 * @param size  The window's full rect size (border included).
 * @param state The title/number/active/zoomed state to render.
 * @param role  The theme role (`window` active / `windowInactive` background) for border + title colors.
 */
export function drawFrame(ctx: DrawContext, size: Size2D, state: FrameState, role: FrameRole): void {
  const { width: w, height: h } = size;
  if (w < 2 || h < 2) return; // too small for a frame — degrade to nothing (PA-4)
  const theme = ctx.role(role);
  const borderStyle = { fg: theme.border, bg: theme.bg };
  const titleStyle = { fg: theme.title, bg: theme.bg };
  // The icon accent — TV's `cFrame` high byte (`cpFrame` palette idx 5). The `[ ]` brackets keep the
  // frame color; the inner glyph and the resize grips take this brighter color (brightGreen on blue).
  const iconStyle = { fg: theme.icon, bg: theme.bg };

  // Border: a double line for the active (focused) window, single for an inactive one — the classic
  // Turbo Vision active/passive frame. Also fills the interior so content insets over an opaque field.
  drawBorder(ctx, w, h, state.active ? DOUBLE_BORDER : SINGLE_BORDER, borderStyle);

  // Window number (1–9) at col w-7, in the FRAME color — drawn for both active and passive windows
  // (TV draws the number outside the `sfActive` gate, via `putChar` which keeps the frame attribute).
  if (state.number !== undefined && state.number >= 1 && state.number <= 9 && w >= 8) {
    ctx.text(w - 7, 0, String(state.number), borderStyle);
  }

  // Centered title, truncated so it can never overrun the icon/number zones (TV: l = width-10, then
  // −6 for the close/zoom boxes our windows always reserve, then −4 when a number is shown). The
  // truncated title is centered with a one-space pad on each side (TV putChar(i-1,' ')/(i+l,' ')).
  if (state.title.length > 0) {
    let max = w - 10 - 6; // −6: close + zoom boxes
    if (state.number !== undefined) max -= 4; // −4: window number
    const titleText = max > 0 ? [...state.title].slice(0, max).join('') : '';
    if (titleText.length > 0) {
      const i = Math.max(1, Math.floor((w - titleText.length) / 2));
      ctx.text(i - 1, 0, ` ${titleText} `, titleStyle);
    }
  }

  // Close box [×] (cols 2–4) and zoom box [↑]/[↕] (cols w-5…w-3) — ONLY on the active window (TV gates
  // both on `sfActive`). The brackets are frame-colored; the inner glyph takes the icon accent.
  if (state.active && w >= 8) {
    ctx.text(2, 0, '[', borderStyle);
    ctx.text(3, 0, CLOSE_GLYPH, iconStyle);
    ctx.text(4, 0, ']', borderStyle);
    ctx.text(w - 5, 0, '[', borderStyle);
    ctx.text(w - 4, 0, state.zoomed ? RESTORE_GLYPH : MAXIMIZE_GLYPH, iconStyle);
    ctx.text(w - 3, 0, ']', borderStyle);
  }

  // Drag grips (TV `dragLeftIcon`/`dragIcon`): only on the active, resizable window, overlay both
  // bottom corners with the single-line `└─` (cols 0,1) and `─┘` (cols w-2,w-1) in the icon accent —
  // they stand out against the double-line active border. TV gates on `sfActive` + `wfGrow`.
  if (state.active && state.resizable && w >= 4) {
    ctx.text(0, h - 1, SINGLE_BORDER.bl, iconStyle); // └
    ctx.text(1, h - 1, SINGLE_BORDER.h, iconStyle); // ─
    ctx.text(w - 2, h - 1, SINGLE_BORDER.h, iconStyle); // ─
    ctx.text(w - 1, h - 1, SINGLE_BORDER.br, iconStyle); // ┘
  }
}

/**
 * Classify a window-local point into its frame hit-zone (AR-67/AR-74). Disabled affordances
 * (`!closable`/`!zoomable`/`!resizable`) never return their zone — they fall through to title/border.
 *
 * @param size  The window's full rect size.
 * @param local The window-local point of the mouse-down.
 * @param flags The window's movable/resizable/zoomable/closable flags.
 * @returns The hit-zone the point lands in.
 */
export function frameZoneAt(size: Size2D, local: Point, flags: WindowFlags): FrameZone {
  const { width: w, height: h } = size;
  const { x, y } = local;

  // Bottom-row resize grips take precedence over the border. The SW grip cells (0,1) grow the
  // left+bottom edges (TV `dmDragGrowLeft`, `mouse.x <= 1`); the SE corner grows the bottom-right (TV
  // `dmDragGrow`). Both gate on `resizable`, so a fixed window's bottom row falls through to `border`.
  if (flags.resizable && y === h - 1 && x <= 1) return 'resize-left';
  if (flags.resizable && x === w - 1 && y === h - 1) return 'resize';

  // The top border row: close box (cols 2–4), zoom box (cols w-5…w-3), else the draggable title.
  if (y === 0) {
    if (flags.closable && x >= 2 && x <= 4) return 'close';
    if (flags.zoomable && x >= w - 5 && x <= w - 3) return 'zoom';
    return 'title';
  }

  if (x === 0 || x === w - 1 || y === h - 1) return 'border';
  return 'interior';
}
