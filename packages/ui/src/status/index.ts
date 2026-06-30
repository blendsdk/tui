/**
 * Status subsystem barrel (RD-05) — the static StatusLine + the standard command constants.
 *
 * Phase 1 exposes the `Commands` constants + the constructable `StatusLine` skeleton; Phase 5
 * fleshes out the builders + the command-row behavior on the same class. Re-exported through
 * `@jsvision/ui`'s entry point.
 */
export { Commands } from './commands.js';
export type { CommandName } from './commands.js';
export { StatusLine } from './statusline.js';
