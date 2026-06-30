/**
 * `Desktop` — the interactive window manager (RD-05 AR-67/AR-78/AR-87).
 *
 * A `Group` whose children are its windows in z-order (back-to-front), filling its area with the
 * `desktop` role + pattern (the bottom layer, AR-80). It implements raise-on-click (the piece RD-04
 * deferred), drag-move + free drag-resize (via the loop's pointer-capture seam, PA-5), zoom,
 * cascade/tile, and window switching. Gesture state lives here (PA-10); the WM `CommandEvent`s
 * (`zoom`/`next`/`prev`/`cascade`/`tile`) are handled in the post-process phase (PA-12), after the
 * focused window had its chance. `Window` is imported type-only (no runtime import cycle).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { Group } from '../view/index.js';
import type { DrawContext, DispatchEvent, View, Point } from '../view/index.js';
import { Window } from '../window/index.js';
import { Commands } from '../status/index.js';
import { applyMove, applyResize } from './gestures.js';
import type { Gesture } from './gestures.js';
import { cascade, tile, nextWindow, prevWindow, windowByNumber } from './arrange.js';

/**
 * The seam the Desktop needs from the composed `EventLoop` (injected by `createApplication`, PA-7).
 * A subset of the loop surface: pointer capture for drag/resize, command emit/enablement for the WM
 * commands, and focus for raise-on-click.
 */
export interface DesktopLoopSeam {
  /** Capture the pointer to a view for the duration of a drag/resize gesture (PA-5). */
  setCapture(view: View): void;
  /** Release the pointer capture (PA-5). */
  releaseCapture(): void;
  /** Emit a shell command through the loop. */
  emitCommand(command: string, arg?: unknown): void;
  /** Whether a command is currently enabled. */
  isCommandEnabled(command: string): boolean;
  /** Focus a view (raise-on-click focuses the raised window). */
  focusView(view: View): void;
}

/** Match an Alt-`N` window accelerator key (a single digit 1–9). */
const DIGIT_KEY = /^[1-9]$/;

/** The window manager + desktop background (AR-67). Child-array order is z-order; bottom layer. */
export class Desktop extends Group {
  /** Handle the WM `CommandEvent`s after the focused window's phase (PA-12). */
  override postProcess = true;

  /** @internal The injected loop seam; `null` until `attachLoop`. */
  protected loop: DesktopLoopSeam | null = null;
  /** @internal The active (top-most focused) window; tracked across raise/add/remove. */
  protected active: Window | null = null;
  /** @internal The in-flight drag/resize gesture, or `null` when none (PA-10). */
  protected gesture: Gesture | null = null;

  /** The desktop's windows in z-order (its children are all `Window`s; the guard keeps it type-safe). */
  protected windows(): Window[] {
    return this.children.filter((c): c is Window => c instanceof Window);
  }

  /** Fill the desktop with the `desktop` role + its repeating pattern glyph (AR-80 / PF-03). */
  override draw(ctx: DrawContext): void {
    const role = ctx.role('desktop');
    ctx.fill(role.pattern, ctx.color('desktop'));
  }

  /**
   * Inject the loop seam (PA-7). Called by `createApplication` after the loop exists.
   *
   * @param seam The loop seam (capture + command + focus).
   */
  attachLoop(seam: DesktopLoopSeam): void {
    this.loop = seam;
  }

  /** The active (top-most focused) window, or `null` (AR-78). */
  activeWindow(): Window | null {
    return this.active;
  }

  /** Add a window as a top-z `position:'absolute'` child, inject the WM seam, and activate it (AR-67/PA-15). */
  addWindow(w: Window): void {
    this.add(w);
    w.attachManager(this);
    this.raise(w);
  }

  /** Remove a window (disposes its scope → `onCleanup`, AR-71); the next top-most window becomes active. */
  removeWindow(w: Window): void {
    const wasActive = this.active === w;
    this.remove(w);
    if (wasActive) {
      const windows = this.windows();
      this.active = windows.length > 0 ? windows[windows.length - 1] : null;
      if (this.active !== null) this.loop?.focusView(this.active);
    }
  }

  /** Raise `w` to the top of z-order, focus it, and re-theme the active/inactive frames (AR-78). */
  raise(w: Window): void {
    const i = this.children.indexOf(w);
    if (i === -1) return;
    this.children.splice(i, 1);
    this.children.push(w);
    this.active = w;
    this.loop?.focusView(w);
    this.invalidateLayout(); // z-order changed → full recompose (re-themes the two frames, ST-15)
  }

  /** Cascade all windows from the top-left (AR-87). */
  cascade(): void {
    cascade(this.windows(), this.bounds.width, this.bounds.height);
    this.invalidateLayout();
  }

  /** Tile all windows into a near-square grid (AR-87). */
  tile(): void {
    tile(this.windows(), this.bounds.width, this.bounds.height);
    this.invalidateLayout();
  }

  /** Activate the next window in z-order, raising it (`next` command, AR-67). */
  focusNextWindow(): void {
    const w = nextWindow(this.windows(), this.active);
    if (w !== null) this.raise(w);
  }

  /** Activate the previous window in z-order, raising it (`prev` command, AR-67). */
  focusPrevWindow(): void {
    const w = prevWindow(this.windows(), this.active);
    if (w !== null) this.raise(w);
  }

  /** Focus + raise the window whose `number === n` (Alt-N, AR-67); a no-match is a no-op. */
  focusWindowNumber(n: number): void {
    const w = windowByNumber(this.windows(), n);
    if (w !== null) this.raise(w);
  }

  /** Begin a drag-move gesture: record the grab offset and capture the pointer (PA-5/PA-10). */
  beginMove(w: Window, grabLocal: Point): void {
    if (!w.movable) return;
    this.gesture = { kind: 'move', target: w, grabDX: grabLocal.x, grabDY: grabLocal.y };
    this.loop?.setCapture(this);
  }

  /** Begin a drag-resize gesture: fix the window top-left and capture the pointer (PA-5/PA-10). */
  beginResize(w: Window): void {
    if (!w.resizable) return;
    const rect = w.layout.rect ?? { x: 0, y: 0, width: 0, height: 0 };
    this.gesture = { kind: 'resize', target: w, originX: rect.x, originY: rect.y };
    this.loop?.setCapture(this);
  }

  /**
   * Handle a captured gesture move/up (drag-move / drag-resize) and the WM `CommandEvent`s + Alt-N
   * key (post-process). A captured event is delivered directly to this view with desktop-local coords.
   */
  override onEvent(ev: DispatchEvent): void {
    const inner = ev.event;

    if (this.gesture !== null && inner.type === 'mouse') {
      if ((inner.kind === 'move' || inner.kind === 'drag') && ev.local !== undefined) {
        if (this.gesture.kind === 'move') applyMove(this.gesture, ev.local, this.bounds.width, this.bounds.height);
        else applyResize(this.gesture, ev.local);
        ev.handled = true;
        return;
      }
      if (inner.kind === 'up') {
        this.gesture = null;
        this.loop?.releaseCapture();
        ev.handled = true;
        return;
      }
    }

    if (inner.type === 'command') {
      // Mark a handled WM command consumed: the Desktop is the focused window's ancestor, so it is
      // visited in BOTH the Phase-2 focus-chain bubble and the Phase-3 post-process sweep — without
      // this short-circuit the action would run twice (PA-12).
      if (this.handleCommand(inner.command)) ev.handled = true;
      return;
    }

    if (inner.type === 'key' && inner.alt && DIGIT_KEY.test(inner.key)) {
      this.focusWindowNumber(Number(inner.key));
      ev.handled = true;
    }
  }

  /**
   * Dispatch a WM `CommandEvent` to its action (a disabled command never reaches here — RD-04 drops
   * it). Returns `true` when the command was a recognized WM command (so the caller consumes it).
   */
  protected handleCommand(command: string): boolean {
    if (command === Commands.zoom) this.active?.zoom();
    else if (command === Commands.next) this.focusNextWindow();
    else if (command === Commands.prev) this.focusPrevWindow();
    else if (command === Commands.cascade) this.cascade();
    else if (command === Commands.tile) this.tile();
    else return false;
    return true;
  }
}
