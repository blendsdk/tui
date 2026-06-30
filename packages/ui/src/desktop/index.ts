/**
 * Desktop subsystem barrel (RD-05) — the window-manager surface.
 *
 * Phase 1 exposes the constructable `Desktop` skeleton + its loop-seam contract; Phase 3 fleshes out
 * the window-manager behavior on the same class. Re-exported through `@jsvision/ui`'s entry point.
 */
export { Desktop } from './desktop.js';
export type { DesktopLoopSeam } from './desktop.js';
