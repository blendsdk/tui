/**
 * `@blendsdk/tui` — public entry point of the SDK foundation.
 *
 * Re-exports the public API of each landed subsystem so consumers import
 * everything from `@blendsdk/tui`. Currently: the package {@link VERSION}
 * (RD-01), the capability detection core (RD-02), the input decoder
 * (RD-06), and the rendering engine (RD-04). The host subsystem is added by
 * a later RD.
 *
 * The `.js` extension in the import specifiers is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
export { VERSION } from './version.js';

// RD-02 — capability detection core.
export { resolveCapabilities, resolveCapabilitiesAsync } from './capability/index.js';
export type {
  CapabilityProfile,
  CapabilityReasons,
  CapabilityResolution,
  ColorDepth,
  DeepPartial,
  GlyphCaps,
  KeyboardCaps,
  MouseCaps,
  OscCaps,
  Platform,
  ReasonLayer,
  ResolveOptions,
  SyncResolveOptions,
  TerminalQuery,
  UnicodeCaps,
} from './capability/index.js';

// RD-06 — input decoder.
export { createDecoderState, decode, flush, createKeymap } from './input/index.js';
export type {
  KeyEvent,
  MouseEvent,
  WheelEvent,
  PasteEvent,
  FocusEvent,
  InputEvent,
  QueryResponse,
  DecodeResult,
  DecoderState,
  DecodeOptions,
  Keymap,
} from './input/index.js';
export { ESC_TIMEOUT_MS, PASTE_CAP_BYTES } from './input/index.js';

// RD-04 — rendering engine.
export {
  ScreenBuffer,
  Attr,
  charWidth,
  serialize,
  defaultEncodeStyle,
  fallbackGlyph,
  sanitize,
  hyperlink,
  setClipboard,
  setTitle,
  bell,
  notify,
  cursor,
  CSI,
  SGR_RESET,
  SYNC_BEGIN,
  SYNC_END,
  cursorTo,
} from './render/index.js';
export type {
  Cell,
  Style,
  Color,
  Ansi16Name,
  AttrMask,
  WidthMode,
  StyleEncoder,
  RenderOptions,
} from './render/index.js';
