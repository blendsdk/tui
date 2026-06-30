/**
 * Window frame — drawing + hit-zone geometry (RD-05 AR-67/AR-74, PA-8).
 *
 * A Window-internal helper (not a `View`): `drawFrame` paints the border, centered title, window
 * number, close box `[×]`, zoom box `[↑]`/`[↓]`, and SE resize corner over a window-local rect;
 * `frameZoneAt` classifies a window-local point into the zone its mouse-down means. Border + title
 * colors come from `ctx.role(role).border`/`.title` (the Phase-0 raw-role accessor), so the active
 * (`window`) and inactive (`windowInactive`) frames differ in border/title — not just fg (AR-73/PA-1).
 *
 * Chrome layout (window-local, size w×h): close `[×]` at cols 1–3, zoom `[↑]`/`[↓]` at cols w-4…w-2,
 * number at col w-6, title centered, SE corner at (w-1, h-1). Boxes are drawn last so they overlay
 * the title; absent flags omit their box. The `.js` extension is required by NodeNext ESM resolution.
 */
import type { Style } from '@jsvision/core';
import type { DrawContext, Point } from '../view/index.js';
import type { Size2D } from '../layout/index.js';

/** A frame hit-zone — what a mouse-down at a window-local point means. */
export type FrameZone = 'close' | 'zoom' | 'resize' | 'title' | 'interior' | 'border';

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
}

/** The theme role the frame is drawn in. */
export type FrameRole = 'window' | 'windowInactive';

/** Glyphs of the chrome affordances (stored verbatim in the buffer; serialize handles fallback). */
const CLOSE_GLYPH = '×';
const MAXIMIZE_GLYPH = '↑';
const RESTORE_GLYPH = '↓';
const RESIZE_GLYPH = '◢';

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

  // Border: a double line for the active (focused) window, single for an inactive one — the classic
  // Turbo Vision active/passive frame. Also fills the interior so content insets over an opaque field.
  drawBorder(ctx, w, h, state.active ? DOUBLE_BORDER : SINGLE_BORDER, borderStyle);

  // Centered title on the top border (drawn before the boxes so the boxes overlay it).
  if (state.title.length > 0) {
    const label = ` ${state.title} `;
    const tx = Math.max(1, Math.floor((w - label.length) / 2));
    ctx.text(tx, 0, label, titleStyle);
  }

  // Window number (1–9) in the top border, left of the zoom box.
  if (state.number !== undefined && state.number >= 1 && state.number <= 9 && w >= 8) {
    ctx.text(w - 6, 0, String(state.number), titleStyle);
  }

  // Close box [×] top-left and zoom box [↑]/[↓] top-right (only when the affordance exists).
  if (w >= 8) {
    ctx.text(1, 0, `[${CLOSE_GLYPH}]`, borderStyle);
    ctx.text(w - 4, 0, `[${state.zoomed ? RESTORE_GLYPH : MAXIMIZE_GLYPH}]`, borderStyle);
  }

  // SE resize corner.
  ctx.text(w - 1, h - 1, RESIZE_GLYPH, borderStyle);
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

  // SE resize corner takes precedence over the bottom-right border.
  if (flags.resizable && x === w - 1 && y === h - 1) return 'resize';

  // The top border row: close box, zoom box, else the draggable title.
  if (y === 0) {
    if (flags.closable && x >= 1 && x <= 3) return 'close';
    if (flags.zoomable && x >= w - 4 && x <= w - 2) return 'zoom';
    return 'title';
  }

  if (x === 0 || x === w - 1 || y === h - 1) return 'border';
  return 'interior';
}
