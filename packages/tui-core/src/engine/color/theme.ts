/**
 * Semantic theme primitives (RD-05; AR-9).
 *
 * A typed {@link Theme} structure (named UI roles → colors) and the
 * {@link defaultTheme} — the classic Borland look migrated from the prototype
 * `theme.ts`. These are **data-only** primitives for the future UI layer, not the
 * UI itself: no view-tree mapping and no palette inheritance (RD-05 Won't-Have).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution
 * (it resolves to the `.ts` source during development via tsx).
 */
import type { Color } from '../render/types.js';

import { PALETTE } from './palette.js';

/** A foreground/background pair (+ optional hotkey accent) for a UI surface. */
export interface ThemeRole {
  readonly fg: Color;
  readonly bg: Color;
  /** Accent color for a highlighted hotkey character, when the role has one. */
  readonly hotkey?: Color;
}

/** Named semantic roles → colors. A data primitive for the future UI layer. */
export interface Theme {
  /** The desktop fill: a role plus the repeating pattern glyph. */
  readonly desktop: ThemeRole & { readonly pattern: string };
  readonly menuBar: ThemeRole;
  readonly menuSelected: ThemeRole;
  readonly window: ThemeRole & { readonly border: Color; readonly title: Color };
  readonly dialog: ThemeRole & { readonly border: Color; readonly title: Color };
  readonly button: ThemeRole;
  readonly buttonFocused: ThemeRole;
  readonly statusBar: ThemeRole;
  readonly shadow: ThemeRole;
}

/**
 * The classic Borland / Turbo Vision look, migrated verbatim from the prototype
 * `THEME` (a uniform blue desktop, light-grey chrome, green buttons). Roles are
 * plain data — no inheritance, no view mapping (AR-9).
 */
export const defaultTheme: Theme = {
  desktop: { pattern: '░', fg: PALETTE.lightGray, bg: '#0000a8' },
  menuBar: { fg: PALETTE.black, bg: PALETTE.lightGray, hotkey: PALETTE.red },
  menuSelected: { fg: PALETTE.white, bg: PALETTE.green, hotkey: PALETTE.yellow },
  window: { fg: PALETTE.black, bg: PALETTE.lightGray, border: PALETTE.black, title: PALETTE.black },
  dialog: { fg: PALETTE.black, bg: PALETTE.lightGray, border: PALETTE.black, title: PALETTE.black },
  button: { fg: PALETTE.black, bg: PALETTE.green },
  buttonFocused: { fg: PALETTE.white, bg: PALETTE.green, hotkey: PALETTE.yellow },
  statusBar: { fg: PALETTE.black, bg: PALETTE.lightGray, hotkey: PALETTE.red },
  shadow: { fg: PALETTE.darkGray, bg: PALETTE.black },
};
