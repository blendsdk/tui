/**
 * Public entry point of the RD-04 rendering engine.
 *
 * Re-exports the rendering subsystem's public API so the SDK's top-level
 * `src/engine/index.ts` can surface it: the width-correct {@link ScreenBuffer}
 * and cell/style types, the pure damage-diff {@link serialize} with its
 * {@link StyleEncoder} seam, the capability-driven {@link fallbackGlyph}, the
 * OSC feature surface, the {@link cursor} controls, and {@link charWidth}. The
 * output sanitizer now lives in the RD-08 `safety/` subsystem (AR-3).
 *
 * The `.js` extension in the import specifiers is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */

// Cell & style model.
export { ScreenBuffer } from './buffer.js';
export { Attr } from './types.js';
export type { Cell, Style, Color, Ansi16Name, AttrMask } from './types.js';

// Character width.
export { charWidth } from './width.js';
export type { WidthMode } from './width.js';

// Damage-diff serializer + style seam.
export { serialize, defaultEncodeStyle } from './serialize.js';
export type { StyleEncoder, RenderOptions } from './serialize.js';

// Glyph fallback.
export { fallbackGlyph } from './glyphs.js';

// ANSI vocabulary (shared with the host).
export { CSI, SGR_RESET, SYNC_BEGIN, SYNC_END, cursorTo } from './ansi.js';

// OSC features + cursor.
export { hyperlink, setClipboard, setTitle, bell, notify, cursor } from './osc.js';
