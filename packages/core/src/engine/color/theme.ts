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
  /**
   * The active (focused) window chrome. `icon` is the close/zoom glyph accent — Turbo Vision draws
   * the inner `■`/`↑`/`↕` and the resize grips in a brighter color than the frame brackets (TV
   * `cpFrame` palette index 5 = brightGreen on blue; `tframe.cpp:27,55`).
   */
  readonly window: ThemeRole & { readonly border: Color; readonly title: Color; readonly icon: Color };
  /**
   * The **inactive** window chrome — a sibling of {@link window} mirroring its shape (fg/bg +
   * border/title + icon) so the UI layer's Frame can theme a background window distinctly from the
   * focused one. Additive, non-breaking (RD-05 AR-73 / the sole cross-package edit). `icon` is unused
   * (TV draws no title-bar icons on a passive window) but present for shape symmetry with {@link window}.
   */
  readonly windowInactive: ThemeRole & { readonly border: Color; readonly title: Color; readonly icon: Color };
  readonly dialog: ThemeRole & { readonly border: Color; readonly title: Color };
  readonly button: ThemeRole;
  readonly buttonFocused: ThemeRole;
  // --- jsvision-ui RD-06 essential-controls roles (the `cpGrayDialog` control palette) -----------
  // Faithful to Turbo Vision's gray-dialog palette: each role decodes `cpAppColor[cpGrayDialog[slot]]`
  // (`include/tvision/app.h:142`, `include/tvision/dialogs.h:80`). Buttons reuse {@link button} (slot
  // 10) / {@link buttonFocused} (slot 12); the bytes are pinned from source in the ST-02 spec oracle.
  /** Static text (TV gray-dialog slot 6, `0x70` black-on-lightGray). */
  readonly staticText: ThemeRole;
  /** Label normal text (slot 7, `0x70`). */
  readonly label: ThemeRole;
  /** Label when its linked control is focused (slot 8, `0x7F` white-on-lightGray). */
  readonly labelSelected: ThemeRole;
  /** Label `~hotkey~` accent (slot 9, `0x7E` yellow-on-lightGray). */
  readonly labelShortcut: ThemeRole;
  /** Default-button face when unfocused (slot 11, `0x2B` brightCyan-on-green). */
  readonly buttonDefault: ThemeRole;
  /** Disabled-button face (slot 13, `0x78` darkGray-on-lightGray). */
  readonly buttonDisabled: ThemeRole;
  /** Button `~hotkey~` accent (slot 14, `0x2E` yellow-on-green). */
  readonly buttonShortcut: ThemeRole;
  /** Cluster (check/radio) item normal (slot 16, `0x30` black-on-cyan). */
  readonly clusterNormal: ThemeRole;
  /** Cluster focused item (slot 17, `0x3F` white-on-cyan). */
  readonly clusterSelected: ThemeRole;
  /** Cluster `~hotkey~` accent (slot 18, `0x3E` yellow-on-cyan). */
  readonly clusterShortcut: ThemeRole;
  /** Cluster disabled item (slot 31, `0x38` darkGray-on-cyan). */
  readonly clusterDisabled: ThemeRole;
  /** Input-line field when unfocused (slot 19, `0x1F` white-on-blue). */
  readonly inputNormal: ThemeRole;
  /** Input-line field when focused (slot 20, `0x2F` white-on-green). */
  readonly inputSelected: ThemeRole;
  /** Input-line `◄`/`►` scroll arrows (slot 21, `0x1A` brightGreen-on-blue). */
  readonly inputArrows: ThemeRole;
  readonly statusBar: ThemeRole;
  /**
   * The status-line **pressed/selected** item (mouse-down feedback). Turbo Vision repaints the held
   * item in `cSelect` = black-on-green, with a red-on-green hotkey run (`tstatusl.cpp` `drawSelect`,
   * `0x20`/`0x24`). A sibling of {@link statusBar}, mirroring {@link menuSelected}'s relationship to
   * {@link menuBar}. (RD-10 AR-88)
   */
  readonly statusSelected: ThemeRole;
  readonly shadow: ThemeRole;
}

/**
 * The classic Borland / Turbo Vision look, mapped from the original `cpAppColor` palette
 * (`magiblot/tvision` `include/tvision/app.h:142` — the source-of-truth per the project's fidelity
 * directive). Each role's (fg, bg) pair is the decode of the corresponding `cpAppColor` attribute
 * byte (`0xHL`: high nibble = bg, low nibble = fg). Roles are plain data — no inheritance, no view
 * mapping (AR-9).
 *
 * Key bytes: desktop `0x71` = blue ░ on lightGray (a muted steel field); the default window is the
 * **blue** `cpBlueWindow` — active frame/title `0x1F` white-on-blue, passive `0x17` lightGray-on-blue,
 * icon accent `0x1A` brightGreen-on-blue; menu/status selected `0x20`/`0x24` black & red on green. The
 * gray `dialog` palette (`cpGrayDialog`, black-on-lightGray) is distinct from the blue window.
 */
export const defaultTheme: Theme = {
  desktop: { pattern: '░', fg: PALETTE.blue, bg: PALETTE.lightGray },
  menuBar: { fg: PALETTE.black, bg: PALETTE.lightGray, hotkey: PALETTE.red },
  menuSelected: { fg: PALETTE.black, bg: PALETTE.green, hotkey: PALETTE.red },
  window: {
    fg: PALETTE.white,
    bg: PALETTE.blue,
    border: PALETTE.white,
    title: PALETTE.white,
    icon: PALETTE.brightGreen,
  },
  windowInactive: {
    fg: PALETTE.lightGray,
    bg: PALETTE.blue,
    border: PALETTE.lightGray,
    title: PALETTE.lightGray,
    icon: PALETTE.lightGray,
  },
  dialog: { fg: PALETTE.black, bg: PALETTE.lightGray, border: PALETTE.black, title: PALETTE.black },
  button: { fg: PALETTE.black, bg: PALETTE.green },
  buttonFocused: { fg: PALETTE.white, bg: PALETTE.green, hotkey: PALETTE.yellow },
  // RD-06 control roles — decoded from `cpAppColor[cpGrayDialog[slot]]` (app.h:142 / dialogs.h:80).
  staticText: { fg: PALETTE.black, bg: PALETTE.lightGray },
  label: { fg: PALETTE.black, bg: PALETTE.lightGray },
  labelSelected: { fg: PALETTE.white, bg: PALETTE.lightGray },
  labelShortcut: { fg: PALETTE.yellow, bg: PALETTE.lightGray },
  buttonDefault: { fg: PALETTE.brightCyan, bg: PALETTE.green },
  buttonDisabled: { fg: PALETTE.darkGray, bg: PALETTE.lightGray },
  buttonShortcut: { fg: PALETTE.yellow, bg: PALETTE.green },
  clusterNormal: { fg: PALETTE.black, bg: PALETTE.cyan },
  clusterSelected: { fg: PALETTE.white, bg: PALETTE.cyan },
  clusterShortcut: { fg: PALETTE.yellow, bg: PALETTE.cyan },
  clusterDisabled: { fg: PALETTE.darkGray, bg: PALETTE.cyan },
  inputNormal: { fg: PALETTE.white, bg: PALETTE.blue },
  inputSelected: { fg: PALETTE.white, bg: PALETTE.green },
  inputArrows: { fg: PALETTE.brightGreen, bg: PALETTE.blue },
  statusBar: { fg: PALETTE.black, bg: PALETTE.lightGray, hotkey: PALETTE.red },
  statusSelected: { fg: PALETTE.black, bg: PALETTE.green, hotkey: PALETTE.red },
  shadow: { fg: PALETTE.darkGray, bg: PALETTE.black },
};
