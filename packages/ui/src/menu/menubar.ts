/**
 * `MenuBar` — the top menu row (RD-05 AR-68/AR-77).
 *
 * Phase 1 ships the **minimal constructable skeleton** PF-12 requires so Phase 2's
 * `createApplication` can compose and type it as an optional chrome child: a `View` with a no-op
 * `draw()`. The full nested-menu behavior — builders, the navigation controller, overlay-hosted
 * popups, F10/Alt-hotkey/click activation, and pre-process key interception — is added in Phase 4
 * (03-04), fleshing out this same class.
 */
import { View } from '../view/index.js';
import type { DrawContext } from '../view/index.js';

/** The application menu bar (Phase 1 skeleton; nested menus land in Phase 4). */
export class MenuBar extends View {
  /** No-op until Phase 4 wires the menu titles + hotkeys (PF-12). */
  draw(_ctx: DrawContext): void {
    // intentionally empty (the Phase-1 skeleton paints nothing; Phase 4 draws the titles)
  }
}
