/**
 * `Window` — a titled, framed, movable/resizable/zoomable/closable container (RD-05 AR-67/AR-74).
 *
 * A `Group` placed `position:'absolute'` (the WM mutates `layout.rect`) with `padding:1` so content
 * children inset inside the 1-cell border. `draw` paints the frame chrome via the `frame.ts` helper,
 * choosing the active (`window`) or inactive (`windowInactive`) role per `manager.activeWindow()`.
 * `onEvent` raises the window on a mouse-down and maps the frame hit-zone to move/resize/close/zoom.
 *
 * The Window talks to its desktop through the injected {@link WindowManager} back-reference (set by
 * `Desktop.addWindow`), not by importing `Desktop` — so there is no `window`↔`desktop` import cycle.
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { Group } from '../view/index.js';
import type { DrawContext, DispatchEvent, Point } from '../view/index.js';
import { signal } from '../reactive/index.js';
import type { Signal } from '../reactive/index.js';
import type { Rect, LayoutProps } from '../layout/index.js';
import { drawFrame, frameZoneAt } from './frame.js';

/**
 * The window-manager seam a {@link Window} needs from its `Desktop` (injected by `addWindow`). A
 * structural subset of `Desktop`, so no `Window`→`Desktop` import is needed (avoids a cycle).
 */
export interface WindowManager {
  /** Raise the window to the top of z-order + focus it (AR-78). */
  raise(w: Window): void;
  /** Remove the window from the desktop (disposes its scope, AR-71). */
  removeWindow(w: Window): void;
  /** The active (top-most focused) window, or `null` (AR-78). */
  activeWindow(): Window | null;
  /** Begin a drag-move gesture (PA-5/PA-10). */
  beginMove(w: Window, grabLocal: Point): void;
  /** Begin a drag-resize gesture from the SE corner (PA-5/PA-10). */
  beginResize(w: Window): void;
  /** Begin a left-grow resize gesture from the SW grip — right edge anchored (RD-10 AR-91). */
  beginResizeLeft(w: Window): void;
}

/** Default restored size for a window with no explicit rect (degenerate guard). */
const FALLBACK_RECT: Rect = { x: 0, y: 0, width: 10, height: 3 };

/** A titled, framed container; content children compose in the interior inset (AR-67, AR-74). */
export class Window extends Group {
  /** A window is a focus target so `raise → focusView(w)` works and `activeWindow()` resolves (PF-05). */
  override focusable = true;
  /** Free-floating placement; the WM mutates `layout.rect` (PA-15 / PF-01). `padding:1` insets content. */
  override layout: LayoutProps = { position: 'absolute', padding: 1 };
  /** Reactive title centered in the top border (repaints on change). */
  readonly title: Signal<string>;
  /** 1–9, shown in the frame for Alt-N; `undefined` = no accelerator. */
  number?: number;
  movable = true;
  resizable = true;
  zoomable = true;
  closable = true;

  /** @internal The desktop seam, injected by `Desktop.addWindow`; `null` before placement. */
  protected manager: WindowManager | null = null;
  /** @internal The restored rect saved while zoomed; `null` when not zoomed (PA-10/PA-15). */
  protected restoredRect: Rect | null = null;

  /**
   * @param title Initial window title (default empty).
   */
  constructor(title?: string) {
    super();
    this.title = signal(title ?? '');
    // Repaint when the reactive title changes (bound on mount, when the scope exists — PA-2).
    this.onMount(() => this.bind(() => this.title()));
  }

  /** @internal Inject the desktop seam (called by `Desktop.addWindow`). */
  attachManager(manager: WindowManager): void {
    this.manager = manager;
  }

  /** The window's current WM rect (the layout rect, or a degenerate fallback before placement). */
  protected currentRect(): Rect {
    return this.layout.rect ?? FALLBACK_RECT;
  }

  /** Whether the window is currently zoomed (maximized). */
  isZoomed(): boolean {
    return this.restoredRect !== null;
  }

  /** Clear the zoom bookkeeping without restoring the rect (used by cascade/tile un-zoom — AR-87). */
  resetZoom(): void {
    this.restoredRect = null;
  }

  /**
   * Toggle maximized ↔ restored (AR-67). Maximizing saves the current rect and fills the desktop;
   * restoring re-applies the exact saved rect. No-op if `!zoomable` or not parented to a desktop.
   */
  zoom(): void {
    if (!this.zoomable || this.parent === null) return;
    if (this.restoredRect === null) {
      this.restoredRect = { ...this.currentRect() };
      this.layout.rect = { x: 0, y: 0, width: this.parent.bounds.width, height: this.parent.bounds.height };
    } else {
      this.layout.rect = { ...this.restoredRect };
      this.restoredRect = null;
    }
    this.invalidateLayout();
  }

  /** Close the window: remove it from the desktop (disposes its scope → `onCleanup`, AR-71). No-op if `!closable`. */
  close(): void {
    if (!this.closable) return;
    this.manager?.removeWindow(this);
  }

  /** Paint the frame chrome in the active (`window`) or inactive (`windowInactive`) role. */
  override draw(ctx: DrawContext): void {
    const active = this.manager?.activeWindow() === this;
    const role = active ? 'window' : 'windowInactive';
    drawFrame(
      ctx,
      ctx.size,
      {
        title: this.title(),
        number: this.number,
        active,
        zoomed: this.isZoomed(),
        resizable: this.resizable,
        closable: this.closable,
        zoomable: this.zoomable,
      },
      role,
    );
  }

  /**
   * Raise the window on a mouse-down and map the frame hit-zone to move/resize/close/zoom (AR-67/78).
   * Non-down mouse events and non-mouse events are ignored (the captured drag is handled by the Desktop).
   */
  override onEvent(ev: DispatchEvent): void {
    const inner = ev.event;
    if (inner.type !== 'mouse' || inner.kind !== 'down' || this.manager === null) return;
    this.manager.raise(this); // AR-78: raise-on-click (z + focus)

    const local = ev.local;
    if (local !== undefined) {
      const size = { width: this.bounds.width, height: this.bounds.height };
      const flags = {
        movable: this.movable,
        resizable: this.resizable,
        zoomable: this.zoomable,
        closable: this.closable,
      };
      const zone = frameZoneAt(size, local, flags);
      if (zone === 'close') this.close();
      else if (zone === 'zoom') this.zoom();
      else if (zone === 'title' && this.movable) this.manager.beginMove(this, local);
      else if (zone === 'resize' && this.resizable) this.manager.beginResize(this);
      else if (zone === 'resize-left' && this.resizable) this.manager.beginResizeLeft(this);
    }
    ev.handled = true;
  }
}
