/**
 * `@blendsdk/tui` — public entry point of the SDK foundation.
 *
 * During RD-01 (scaffolding) the only export is {@link VERSION}; the renderer,
 * input, host, and capability subsystems are added by later RDs (RD-02…RD-08),
 * each re-exported from here so consumers import everything from `@blendsdk/tui`.
 *
 * The `.js` extension in the import specifier is required by NodeNext ESM
 * resolution (it resolves to `version.ts` during development via tsx).
 */
export { VERSION } from './version.js';
