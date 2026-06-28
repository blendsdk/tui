/**
 * Public entry point of the RD-06 input subsystem (plan doc 03-04).
 *
 * Exposes the pure byte→event decoder ({@link decode}/{@link flush}/
 * {@link createDecoderState}), the pluggable keymap ({@link createKeymap}), and
 * the event/result/option types. The decoder is pure and host-agnostic: the
 * RD-07 host wires the real stdin stream, raw mode, mode-enable sequences, and
 * the lone-ESC `flush()` timer later.
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
export { createDecoderState, decode, flush } from './decoder.js';
export { createKeymap } from './keymap.js';
export type { Keymap } from './keymap.js';
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
} from './events.js';
export { ESC_TIMEOUT_MS, PASTE_CAP_BYTES } from './events.js';
