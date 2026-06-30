/**
 * `Desktop` — the window-manager surface (RD-05 AR-67/AR-80).
 *
 * Phase 1 ships the **minimal constructable skeleton** PF-12 requires so Phase 2's
 * `createApplication` can compose and type it: a `Group` whose `draw()` fills the desktop pattern
 * (the classic Borland `░` field) and an `attachLoop` seam stub. The window-manager behavior —
 * `addWindow`/`removeWindow`, z-order `raise`, `activeWindow`, drag/resize gestures, and the
 * cascade/tile/switch commands — is added in Phase 3 (03-02), extending this same class.
 */
import { Group } from '../view/index.js';
import type { DrawContext, View } from '../view/index.js';

/**
 * The seam the Desktop needs from the composed `EventLoop` (injected by `createApplication`, PA-7).
 * A subset of the loop surface: pointer capture for drag/resize, command emit/enablement for the WM
 * commands, and focus for raise-on-click. Phase 3 consumes it.
 */
export interface DesktopLoopSeam {
  /** Capture the pointer to a view for the duration of a drag/resize gesture (PA-5). */
  setCapture(view: View): void;
  /** Release the pointer capture (PA-5). */
  releaseCapture(): void;
  /** Emit a shell command through the loop (e.g. on a WM affordance). */
  emitCommand(command: string, arg?: unknown): void;
  /** Whether a command is currently enabled. */
  isCommandEnabled(command: string): boolean;
  /** Focus a view (raise-on-click focuses the raised window). */
  focusView(view: View): void;
}

/** The desktop background + window host (Phase 1 skeleton; the WM lands in Phase 3). */
export class Desktop extends Group {
  /** @internal The injected loop seam; `null` until `attachLoop`. Consumed by the Phase-3 WM. */
  protected loop: DesktopLoopSeam | null = null;

  /**
   * Fill the desktop field with the `desktop` role's repeating pattern glyph (AR-80 / PF-03). The
   * raw role access (`ctx.role`) is the Phase-0 addition that exposes the `pattern` extra `color`
   * drops.
   */
  override draw(ctx: DrawContext): void {
    const role = ctx.role('desktop');
    ctx.fill(role.pattern, ctx.color('desktop'));
  }

  /**
   * Inject the loop seam (PA-7). Called by `createApplication` after the loop exists; the seam is
   * consumed by the Phase-3 window-manager behavior.
   *
   * @param seam The loop seam (capture + command + focus).
   */
  attachLoop(seam: DesktopLoopSeam): void {
    this.loop = seam;
  }
}
