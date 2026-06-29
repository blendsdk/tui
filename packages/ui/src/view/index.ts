/**
 * View/Group spine (RD-03) — public barrel.
 *
 * The retained `View`/`Group` widget tree on `@jsvision/core`: persistent nodes with identity
 * across frames, per-view RD-01 owner scopes + reactive `bind`, a stateless clipped `DrawContext`,
 * named theme-role resolution, the layout reflow pass, and a coalescing repaint pump. Re-exported
 * through the single `@jsvision/ui` entry point.
 *
 * Landed so far (Phase 2): geometry + the `View`/`Group` retained tree + owner-scope lifecycle.
 * The `DrawContext` implementation, reflow, render root, scheduler, and dynamic children follow in
 * later phases per `99-execution-plan.md`.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
export { View } from './view.js';
export type { ViewHost } from './view.js';
export { Group } from './group.js';
export { intersect, translate, contains } from './geometry.js';
export type { Point } from './geometry.js';
export type { ViewState, DrawContext, ThemeRoleName, RenderRootOptions } from './types.js';
// Internal paint seams (used by the Phase-5 render root + tests): the clipped DrawContext factory
// and the theme-role→Style adapter. Not part of the curated `@jsvision/ui` public surface.
export { makeDrawContext } from './draw-context.js';
export { themeRoleToStyle } from './theme-style.js';
export { reflow } from './reflow.js';
