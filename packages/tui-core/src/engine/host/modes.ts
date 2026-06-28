/**
 * Enter/leave TUI-mode sequence builders (RD-07, plan doc 03-02).
 *
 * Pure string builders driven by `caps` (no I/O): they emit the private-mode
 * `?…h`/`?…l` pairs that take the terminal into and out of full-screen TUI mode,
 * gating each on the detected capability. `leaveMode` is the **strict inverse**
 * of `enterMode` — same toggles, opposite value, reverse order — so the terminal
 * unwinds exactly as it was set up (AC-1). They reuse RD-04's `CSI` vocabulary
 * (`?25h`/`?25l` are RD-04's `cursor.show()`/`cursor.hide()`).
 *
 * Step 9 of the 03-02 table (the Kitty / `modifyOtherKeys` keyboard protocol) is
 * **deferred** (DEF-2, RT-1): enabling it would make a capable terminal emit
 * CSI-u key encodings that RD-06's decoder cannot yet parse (RD-06 DEF-1), so no
 * keyboard-protocol bytes are emitted regardless of `caps.keyboard`. Re-enable
 * here once RD-06 Phase B lands CSI-u decoding.
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import { CSI } from '../render/ansi.js';
import type { CapabilityProfile } from '../capability/profile.js';

/** Options shaping the host-policy modes (those no capability models). */
export interface ModeOptions {
  /** Enable focus reporting (`?1004h`). Host policy, default on. [PF-006] */
  readonly focus?: boolean;
}

/**
 * One private-mode toggle. `enter` is the value written on enter (`h` or `l`);
 * leave writes the opposite. `on` decides whether this toggle is emitted at all.
 */
interface ModeToggle {
  readonly code: number;
  readonly on: boolean;
  readonly enter: 'h' | 'l';
}

/**
 * The ordered mode table (03-02). Cursor (25) and line-wrap (7) are toggled
 * **off** on enter (`enter: 'l'`); every other mode is toggled **on** (`'h'`).
 * Order matters: leave replays this list reversed so it is the strict inverse.
 */
function modeTable(caps: CapabilityProfile, options: ModeOptions): readonly ModeToggle[] {
  return [
    { code: 1049, on: caps.altScreen, enter: 'h' }, // alternate screen
    { code: 25, on: true, enter: 'l' }, // hide cursor (RD-04 cursor.hide)
    { code: 7, on: true, enter: 'l' }, // line wrap off
    { code: 1006, on: caps.mouse.sgr, enter: 'h' }, // SGR mouse encoding
    { code: 1000, on: caps.mouse.sgr, enter: 'h' }, // basic button tracking
    { code: 1002, on: caps.mouse.sgr && caps.mouse.drag, enter: 'h' }, // button-event (drag)
    { code: 2004, on: caps.bracketedPaste, enter: 'h' }, // bracketed paste
    { code: 1004, on: options.focus !== false, enter: 'h' }, // focus reporting (host policy, PF-006)
  ];
}

/** The opposite private-mode value (`h`↔`l`). */
function invert(value: 'h' | 'l'): 'h' | 'l' {
  return value === 'h' ? 'l' : 'h';
}

/**
 * Build the enter-TUI-mode byte string, gating each mode on `caps`.
 *
 * @param caps - the detected capability profile (gates each mode).
 * @param options - host-policy toggles; `focus` defaults to on (PF-006).
 * @returns the concatenated private-mode enable sequence. [PF-006]
 */
export function enterMode(caps: CapabilityProfile, options: ModeOptions = {}): string {
  let out = '';
  for (const { code, on, enter } of modeTable(caps, options)) {
    if (on) out += `${CSI}?${code}${enter}`;
  }
  return out;
}

/**
 * Build the exact inverse leave-TUI-mode string: every enabled mode toggled the
 * opposite way, in reverse order, so the terminal returns to its prior state.
 *
 * @param caps - the same capability profile passed to {@link enterMode}.
 * @param options - the same host-policy toggles passed to {@link enterMode}.
 * @returns the concatenated private-mode disable sequence (strict inverse). [PF-006]
 */
export function leaveMode(caps: CapabilityProfile, options: ModeOptions = {}): string {
  let out = '';
  const table = modeTable(caps, options);
  for (let i = table.length - 1; i >= 0; i -= 1) {
    const { code, on, enter } = table[i];
    if (on) out += `${CSI}?${code}${invert(enter)}`;
  }
  return out;
}
