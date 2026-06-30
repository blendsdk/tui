/**
 * `StatusLine` — the static bottom command row (RD-05 AR-72/AR-77).
 *
 * Phase 1 ships the **minimal constructable skeleton** PF-12 requires so Phase 2's
 * `createApplication` can compose and type it as an optional chrome child: a `View` with a no-op
 * `draw()`. The static command-row behavior — `statusLine`/`statusItem` builders, the loop-seam
 * attach, tilde-highlighted item drawing, click/accelerator command emit, and disabled greying — is
 * added in Phase 5 (03-05), fleshing out this same class.
 */
import { View } from '../view/index.js';
import type { DrawContext } from '../view/index.js';

/** The application status line (Phase 1 skeleton; the command row lands in Phase 5). */
export class StatusLine extends View {
  /** No-op until Phase 5 wires the status items + accelerators (PF-12). */
  draw(_ctx: DrawContext): void {
    // intentionally empty (the Phase-1 skeleton paints nothing; Phase 5 draws the items)
  }
}
