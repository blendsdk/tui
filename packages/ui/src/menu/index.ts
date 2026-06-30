/**
 * Menu subsystem barrel (RD-05) — the nested MenuBar/MenuPopup menus.
 *
 * Phase 1 exposes the constructable `MenuBar` skeleton; Phase 4 fleshes out the builders, the
 * navigation controller, and the overlay-hosted popups on the same class. Re-exported through
 * `@jsvision/ui`'s entry point.
 */
export { MenuBar, menuBar } from './menubar.js';
export { MenuPopup } from './popup.js';
export { subMenu, item, separator, parseTilde, layoutTitles, titleIndexAt } from './builders.js';
export type { MenuItem, ParsedLabel, TitleLayout } from './builders.js';
export type { MenuController, MenuLoopSeam } from './controller.js';
