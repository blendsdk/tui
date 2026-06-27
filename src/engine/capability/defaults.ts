/**
 * Layer-5 conservative defaults (RD-02, plan doc 03-02; PL-13).
 *
 * The lowest-precedence layer: every field a higher layer did not determine
 * falls back to a safe, minimal-assumption value. `colorDepth` is `'16'` (the
 * widely-safe baseline), all capability booleans are `false`, unicode width is
 * `wcwidth`, and `emoji` is `unknown`. `platform` here is a placeholder; the
 * resolver always replaces it with `options.platform ?? process.platform`.
 */
import type { CapabilityProfile } from './profile.js';

/** Conservative defaults used when no higher layer determines a field (PL-13). */
export const CONSERVATIVE_DEFAULTS: CapabilityProfile = {
  colorDepth: '16',
  mouse: { sgr: false, drag: false, wheel: false },
  unicode: { utf8: false, widthMode: 'wcwidth', emoji: 'unknown' },
  osc: {
    hyperlink8: false,
    clipboard52: false,
    title: false,
    notify9: false,
    notify777: false,
    notify99: false,
    progress9_4: false,
  },
  sync2026: false,
  altScreen: false,
  bracketedPaste: false,
  keyboard: { kittyFlags: false, modifyOtherKeys: false },
  glyphs: { boxDrawing: false, halfBlocks: false },
  // Overridden by options.platform / process.platform during resolve.
  platform: 'linux',
  multiplexer: false,
};
