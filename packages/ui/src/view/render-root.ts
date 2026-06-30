/**
 * Render root + compose walker (RD-03, AR-32/AR-38/AR-42/AR-44). The `RenderRoot` owns the shared
 * `ScreenBuffer`, the viewport, the theme, the capabilities, the draw-error logger, and the
 * (injectable) flush scheduler. It mounts the view tree (scopes nested under a root scope via
 * `runWithOwner`/`createRoot`), runs the reflow pass, composes the tree into the buffer, and emits
 * a damage diff via core's `serialize()` against a `clone()` snapshot of the previous frame (PA-8).
 *
 * The compose walker draws each view through a clipped `DrawContext`, recurses into a `Group`'s
 * children back-to-front (array order, AR-38), and isolates a throwing `draw()` — logging it and
 * skipping that subtree so one crashing widget never blanks the app (AR-42).
 *
 * Phase 5 composes the **full** tree each flush; the dirty set + partial recompose land in Phase 6.
 */
import { ScreenBuffer, serialize, defaultTheme, createLogger, Attr } from '@jsvision/core';
import type { Theme, CapabilityProfile, Logger } from '@jsvision/core';
import { createRoot, getOwner } from '../reactive/index.js';
import type { Rect, Size2D } from '../layout/index.js';
import { View } from './view.js';
import type { ViewHost } from './view.js';
import { Group } from './group.js';
import type { Point } from './geometry.js';
import { intersect } from './geometry.js';
import { themeRoleToStyle } from './theme-style.js';
import { makeDrawContext } from './draw-context.js';
import { reflow } from './reflow.js';
import type { RenderRootOptions } from './types.js';

/** Blank fill for a fresh buffer (terminal default colors, space glyph). */
const BLANK = { fg: 'default', bg: 'default' } as const;

/**
 * Owns the buffer/viewport/theme/scheduler and makes the spine independently renderable (the
 * Phase-0 demo target) and the injection point RD-04/RD-05 wire to the host.
 */
export interface RenderRoot {
  /** Mount a view tree: wire scopes, run the first reflow, and compose the first frame. */
  mount(root: View): void;
  /** Resize the viewport (triggers a reflow + full recompose). */
  resize(size: Size2D): void;
  /** Force a synchronous frame now (drains any pending scheduled flush). */
  flush(): void;
  /** The last flushed frame's damage-diff bytes (core `serialize()`); forces a flush if one is pending. */
  serialize(): string;
  /** The live composed buffer — for host integration and tests. */
  buffer(): ScreenBuffer;
}

/**
 * Compose a view subtree into the buffer. `absOrigin` is the view's absolute top-left; `clip` is
 * the absolute clip rect (view rect ∩ ancestor clip). A throwing `draw()` is logged and its
 * subtree skipped (AR-42).
 */
/**
 * Per-view compose context cached on a full compose, reused by partial recompose. `order` is the
 * DFS pre-order paint index (back-to-front) — used to detect occlusion when deciding whether a
 * partial recompose is safe.
 */
type ComposeContext = { origin: Point; clip: Rect; order: number };

/**
 * Paint a Turbo Vision-style drop-shadow on the cells just below and to the right of `rect`
 * (absolute), clipped to `clip`. Only the cell colors change (the glyph + its width are preserved),
 * matching core's shadow. Drawn in z-order by the compose walker — a later sibling's shadow falls
 * over an earlier one — so a front window's shadow lands correctly on the windows behind it.
 *
 * @param buffer The shared compose buffer.
 * @param rect   The shadow-caster's absolute rect.
 * @param clip   The parent's absolute clip (the shadow never escapes the caster's container).
 * @param theme  The active theme (for the `shadow` role colors).
 */
function drawDropShadow(buffer: ScreenBuffer, rect: Rect, clip: Rect, theme: Theme): void {
  const style = themeRoleToStyle(theme.shadow);
  const attrs = style.attrs ?? Attr.none;
  const clipRight = clip.x + clip.width;
  const clipBottom = clip.y + clip.height;
  const darken = (absX: number, absY: number): void => {
    if (absX < clip.x || absX >= clipRight || absY < clip.y || absY >= clipBottom) return;
    const cell = buffer.get(absX, absY);
    if (cell) {
      cell.fg = style.fg;
      cell.bg = style.bg;
      cell.attrs = attrs;
    }
  };
  // Right edge (rows 0..h-1, offset down by 1) + bottom edge (cols 0..w-1, offset right by 1) — the
  // classic 1-cell L-shaped shadow. Matches the DrawContext.shadow geometry.
  for (let row = 0; row < rect.height; row += 1) darken(rect.x + rect.width, rect.y + row + 1);
  for (let col = 0; col < rect.width; col += 1) darken(rect.x + col + 1, rect.y + rect.height);
}

function composeView(
  buffer: ScreenBuffer,
  view: View,
  absOrigin: Point,
  clip: Rect,
  theme: Theme,
  logger: Logger,
  cache: Map<View, ComposeContext>,
  counter: { n: number } | null,
): void {
  if (!view.state.visible) return;
  // Assign a fresh paint index on a full compose (`counter` set); preserve the existing one on a
  // partial recompose (`counter` null) so the cross-frame occlusion test stays stable — z-order only
  // changes via reflow, which always does a full compose.
  const order = counter !== null ? counter.n++ : (cache.get(view)?.order ?? 0);
  cache.set(view, { origin: absOrigin, clip, order }); // where + when this view composed

  const viewRect: Rect = {
    x: absOrigin.x,
    y: absOrigin.y,
    width: view.bounds.width,
    height: view.bounds.height,
  };
  const ctx = makeDrawContext(buffer, viewRect, clip, theme);
  try {
    view.draw(ctx);
  } catch (error) {
    logger.error('view', 'draw() threw', { error: String(error) });
    return; // isolate + skip this subtree (AR-42)
  }

  if (view instanceof Group) {
    for (const child of view.children) {
      if (!child.state.visible) continue; // display:none (AR-41)
      const childOrigin: Point = { x: absOrigin.x + child.bounds.x, y: absOrigin.y + child.bounds.y };
      const childRect: Rect = {
        x: childOrigin.x,
        y: childOrigin.y,
        width: child.bounds.width,
        height: child.bounds.height,
      };
      // Cast the child's shadow (in z-order, under the parent's clip) before painting the child, so a
      // later (front) sibling's shadow falls over the earlier (back) siblings already composed.
      if (child.castsShadow) drawDropShadow(buffer, childRect, clip, theme);
      composeView(buffer, child, childOrigin, intersect(clip, childRect), theme, logger, cache, counter);
    }
  }
}

/** Whether `ancestor` is `node` itself or an ancestor of it (walks the parent chain). */
function isAncestor(ancestor: View, node: View): boolean {
  let cursor: View | null = node;
  while (cursor !== null) {
    if (cursor === ancestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

/**
 * The dirty views with no dirty ancestor — an ancestor's subtree recompose already covers its
 * dirty descendants, so they are dropped to avoid redundant work.
 */
function topmostDirty(dirty: Set<View>): View[] {
  const out: View[] = [];
  for (const view of dirty) {
    let ancestor = view.parent;
    let covered = false;
    while (ancestor !== null) {
      if (dirty.has(ancestor)) {
        covered = true;
        break;
      }
      ancestor = ancestor.parent;
    }
    if (!covered) out.push(view);
  }
  return out;
}

/** Concrete render root. Implements `ViewHost` so views can schedule repaint/reflow through it. */
class RenderRootImpl implements RenderRoot, ViewHost {
  private current: ScreenBuffer;
  private viewport: Size2D;
  private readonly theme: Theme;
  private readonly caps: CapabilityProfile;
  private readonly logger: Logger;
  private readonly scheduler: (flush: () => void) => void;

  private rootView: View | null = null;
  private disposeRoot: (() => void) | null = null;
  private needsReflow = false;
  private scheduled = false;
  private lastFrame = '';
  private readonly dirty = new Set<View>();
  private readonly cache = new Map<View, ComposeContext>();

  constructor(size: Size2D, opts: RenderRootOptions) {
    this.viewport = size;
    this.caps = opts.caps;
    this.theme = opts.theme ?? defaultTheme;
    this.logger = opts.logger ?? createLogger();
    this.scheduler = opts.schedule ?? ((flush): void => queueMicrotask(flush));
    this.current = new ScreenBuffer(size.width, size.height, BLANK);
  }

  mount(root: View): void {
    this.disposeRoot?.(); // re-mount safe: dispose a previously-mounted tree first
    this.rootView = root;
    createRoot((dispose) => {
      this.disposeRoot = dispose;
      root.mount(this, getOwner()); // scopes nest under the root scope; this is the ViewHost
    });
    this.needsReflow = true;
    this.flush(); // first reflow + full compose
  }

  resize(size: Size2D): void {
    this.viewport = size;
    this.current = new ScreenBuffer(size.width, size.height, BLANK);
    this.needsReflow = true;
    this.scheduleFlush();
  }

  /** @internal ViewHost — mark a view's subtree for repaint and schedule a coalesced flush (AR-32). */
  markRepaint(view: View): void {
    this.dirty.add(view);
    this.scheduleFlush();
  }

  /** @internal ViewHost — schedule a reflow + recompose. */
  markRelayout(): void {
    this.needsReflow = true;
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.scheduled) return; // coalesce — one flush per tick (AR-32)
    this.scheduled = true;
    this.scheduler(() => this.flush());
  }

  flush(): void {
    this.scheduled = false;
    if (this.rootView === null) return;

    const previous = this.current.clone(); // faithful snapshot for the damage diff (PA-8)
    if (this.needsReflow) {
      // Relayout phase: reflow moves bounds, so the cached compose contexts are stale → full compose.
      reflow(this.rootView, this.viewport);
      this.needsReflow = false;
      this.fullCompose();
    } else {
      // Repaint phase: recompose only the dirty subtrees from their cached contexts (AC-7) — but
      // partial recompose draws a subtree in isolation, which is only correct when nothing paints
      // over it. If a dirty view is occluded by a later-painted view outside its subtree (overlapping
      // windows), redrawing just that subtree would bleed it over its occluder, so escalate to a full
      // z-ordered recompose for this frame. The fast-path holds for non-overlapping UIs.
      const dirtyViews = topmostDirty(this.dirty);
      if (this.anyOccluded(dirtyViews)) {
        this.fullCompose();
      } else {
        for (const view of dirtyViews) {
          const ctx = this.cache.get(view);
          if (ctx !== undefined) {
            composeView(this.current, view, ctx.origin, ctx.clip, this.theme, this.logger, this.cache, null);
          }
        }
      }
    }
    this.dirty.clear();
    this.lastFrame = serialize(this.current, previous, { caps: this.caps });
  }

  /** Compose the whole tree from the root in z-order, refreshing the per-view context cache. */
  private fullCompose(): void {
    if (this.rootView === null) return;
    this.cache.clear();
    const origin: Point = { x: this.rootView.bounds.x, y: this.rootView.bounds.y };
    composeView(this.current, this.rootView, origin, { ...this.rootView.bounds }, this.theme, this.logger, this.cache, {
      n: 0,
    });
  }

  /**
   * Whether any dirty view is overlapped by a view painted after it (and outside its own subtree) —
   * an occluder a partial recompose would wrongly draw under. Uses the cached paint order + origins
   * from the last full compose; geometry and z-order are stable between reflows.
   */
  private anyOccluded(dirtyViews: View[]): boolean {
    for (const view of dirtyViews) {
      const cv = this.cache.get(view);
      if (cv === undefined) continue;
      const rv: Rect = { x: cv.origin.x, y: cv.origin.y, width: view.bounds.width, height: view.bounds.height };
      for (const [other, co] of this.cache) {
        if (other === view || co.order <= cv.order) continue; // same view, or painted before it
        if (isAncestor(view, other)) continue; // inside the dirty subtree — recomposing `view` covers it
        const ro: Rect = { x: co.origin.x, y: co.origin.y, width: other.bounds.width, height: other.bounds.height };
        const overlap = intersect(rv, ro);
        if (overlap.width > 0 && overlap.height > 0) return true;
      }
    }
    return false;
  }

  serialize(): string {
    if (this.scheduled) this.flush(); // force the pending frame
    return this.lastFrame;
  }

  buffer(): ScreenBuffer {
    return this.current;
  }
}

/**
 * Create a render root over a `size`-cell buffer.
 *
 * @param size The viewport size in cells.
 * @param opts Required `caps` (depth-aware encoding) + optional `theme`/`schedule`/`logger`.
 * @returns A `RenderRoot` ready to `mount` a view tree.
 */
export function createRenderRoot(size: Size2D, opts: RenderRootOptions): RenderRoot {
  return new RenderRootImpl(size, opts);
}
