/**
 * OSC (Operating System Command) feature surface (RD-04, AC-5/AC-7/AC-8, plan
 * doc 03-04, PL-11/PL-12).
 *
 * Hyperlinks, clipboard, window title, bell, and desktop notifications. Each
 * function is pure (returns the ANSI string for the host to write, like
 * `serialize`) and routes every text/url argument through {@link sanitize}
 * first, so embedded escape/OSC sequences cannot break out (SEC-1, AC-8). Each
 * feature is gated on the relevant RD-02 `osc` capability; unsupported features
 * degrade gracefully (plain text or empty string).
 *
 * Security: this module never logs app-provided clipboard/notify/title text
 * (SEC-2). Bell/notification rate-limiting is the app's concern (SEC-3).
 */

import { sanitize } from '../safety/sanitize.js';
import type { CapabilityProfile } from '../capability/index.js';

/** BEL terminator (`\x07`) used by several OSC sequences. */
const BEL = '\x07';
/** String Terminator (`ESC \`) used by OSC 8 and the Kitty OSC 99 form. */
const ST = '\x1b\\';

/**
 * Emit an OSC 8 hyperlink wrapping `text` with `url` (PL-12). When the terminal
 * lacks hyperlink support, returns the sanitized text as plain text.
 *
 * @param text Visible link text (sanitized).
 * @param url Target URL (sanitized).
 * @param caps Resolved terminal capabilities.
 */
export function hyperlink(text: string, url: string, caps: CapabilityProfile): string {
  const t = sanitize(text);
  if (!caps.osc.hyperlink8) return t;
  const u = sanitize(url);
  return `\x1b]8;;${u}${ST}${t}\x1b]8;;${ST}`;
}

/**
 * Emit an OSC 52 clipboard-write of `text` (PL-12). The text is sanitized and
 * then base64-encoded (sanitize first, then encode). Returns `''` when the
 * terminal lacks clipboard support.
 *
 * @param text Text to place on the clipboard.
 * @param caps Resolved terminal capabilities.
 */
export function setClipboard(text: string, caps: CapabilityProfile): string {
  if (!caps.osc.clipboard52) return '';
  const b64 = Buffer.from(sanitize(text), 'utf8').toString('base64');
  return `\x1b]52;c;${b64}${BEL}`;
}

/**
 * Emit an OSC 0/2 window-title set (PL-12). Returns `''` when unsupported.
 *
 * @param text New window title (sanitized).
 * @param caps Resolved terminal capabilities.
 */
export function setTitle(text: string, caps: CapabilityProfile): string {
  if (!caps.osc.title) return '';
  return `\x1b]0;${sanitize(text)}${BEL}`;
}

/** Emit a literal bell (`\x07`). The app owns debounce/rate-limit policy (SEC-3). */
export function bell(): string {
  return BEL;
}

/**
 * Emit a desktop notification via the first supported protocol (the capability
 * ladder, PL-11, AC-5): Kitty OSC 99 → iTerm2 OSC 9 → urxvt OSC 777 → WT/ConEmu
 * progress OSC 9;4 → a single BEL fallback. Title and body are sanitized, so an
 * embedded escape cannot open a second sequence (AC-7). Payloads are minimal
 * (title + body only).
 *
 * @param title Notification title (sanitized).
 * @param body Notification body (sanitized).
 * @param caps Resolved terminal capabilities.
 */
export function notify(title: string, body: string, caps: CapabilityProfile): string {
  const t = sanitize(title);
  const b = sanitize(body);
  if (caps.osc.notify99) return `\x1b]99;;${t} — ${b}${ST}`;
  if (caps.osc.notify9) return `\x1b]9;${t} — ${b}${BEL}`;
  if (caps.osc.notify777) return `\x1b]777;notify;${t};${b}${BEL}`;
  if (caps.osc.progress9_4) return `\x1b]9;4;1;0${BEL}`;
  return BEL;
}

export { cursor } from './cursor.js';
