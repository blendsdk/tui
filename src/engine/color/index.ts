/**
 * Public entry point of the RD-05 color & styling subsystem.
 *
 * Re-exports the subsystem's public API so the SDK's top-level
 * `src/engine/index.ts` can surface it: depth-aware SGR encoding
 * ({@link encode}/{@link encodeStyle}), the nearest-color primitives
 * ({@link nearest256}/{@link nearest16}), the {@link styleKey} run-merge key, and
 * the {@link InvalidColorError}. The DOS-16 `PALETTE` and `Theme` constants are
 * added by Phase 2.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution
 * (it resolves to the `.ts` source during development via tsx).
 */

// SGR encoding (the StyleEncoder seam + the granular per-color encoder).
export { encode, encodeStyle, styleKey } from './encode.js';
export type { ColorRole } from './encode.js';

// Nearest-color downsampling primitives.
export { nearest256, nearest16 } from './downsample.js';

// Color validation + typed error.
export { InvalidColorError } from './color.js';
export type { Rgb } from './color.js';
