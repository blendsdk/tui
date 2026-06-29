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
import { ScreenBuffer, serialize, defaultTheme, createLogger } from '@jsvision/core';
import type { Theme, CapabilityProfile, Logger } from '@jsvision/core';
import { createRoot, getOwner } from '../reactive/index.js';
import type { Rect, Size2D } from '../layout/index.js';
import { View } from './view.js';
import type { ViewHost } from './view.js';
import { Group } from './group.js';
import type { Point } from './geometry.js';
import { intersect } from './geometry.js';
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
/** Per-view compose context cached on a full compose, reused by partial recompose. */
type ComposeContext = { origin: Point; clip: Rect };

function composeView(
  buffer: ScreenBuffer,
  view: View,
  absOrigin: Point,
  clip: Rect,
  theme: Theme,
  logger: Logger,
  cache: Map<View, ComposeContext>,
): void {
  if (!view.state.visible) return;
  cache.set(view, { origin: absOrigin, clip }); // remember where this view composed (for partial recompose)

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
      composeView(buffer, child, childOrigin, intersect(clip, childRect), theme, logger, cache);
    }
  }
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
      this.cache.clear();
      const origin: Point = { x: this.rootView.bounds.x, y: this.rootView.bounds.y };
      composeView(
        this.current,
        this.rootView,
        origin,
        { ...this.rootView.bounds },
        this.theme,
        this.logger,
        this.cache,
      );
    } else {
      // Repaint phase: recompose only the dirty subtrees from their cached compose contexts (AC-7).
      for (const view of topmostDirty(this.dirty)) {
        const ctx = this.cache.get(view);
        if (ctx !== undefined) {
          composeView(this.current, view, ctx.origin, ctx.clip, this.theme, this.logger, this.cache);
        }
      }
    }
    this.dirty.clear();
    this.lastFrame = serialize(this.current, previous, { caps: this.caps });
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
