/**
 * Public API of the low-level TUI toolkit: the cell buffer, the ANSI renderer,
 * the theme, and the screen-size hook. Application code imports from here
 * rather than reaching into individual modules.
 */

export { ScreenBuffer } from './buffer.js';
export type { Cell, Style } from './buffer.js';
export { serialize } from './serialize.js';
export { useScreenSize } from './useScreenSize.js';
export type { ScreenSize } from './useScreenSize.js';
export { THEME, PALETTE, BOX } from './theme.js';
