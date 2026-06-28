/**
 * The canonical output sanitizer — the project's primary injection boundary
 * (RD-08 §Sanitizer rule; AC-3/AC-8). Strips terminal-control bytes from
 * untrusted text before it reaches the stream, so app- or network-supplied
 * strings cannot open or close escape or OSC sequences.
 *
 * Every text-accepting output path routes through this: the RD-04 buffer
 * `text()`, the OSC features (`hyperlink`/`setClipboard`/`setTitle`/`notify`),
 * and the window title. Strip-only and behavior-identical to the RD-04
 * provisional version it replaces (RD-08 AR-13).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */

/**
 * Remove ESC/BEL/ST and C0/C1 control codes from untrusted text.
 *
 * Rule table (RD-08 §Sanitizer rule; AC-3/AC-8): strip `ESC` (0x1b) — and the
 * two-byte `ESC \` String Terminator — `BEL` (0x07), the single-byte `ST`
 * (0x9c), all C0 controls (0x00–0x1f) **except** tab (0x09) and newline (0x0a),
 * and all C1 controls (0x80–0x9f). Printable and valid UTF-8 text (incl. astral)
 * passes through unchanged.
 *
 * @param text Untrusted input (app- or network-supplied).
 * @returns `text` with ESC/BEL/ST and C0/C1 control bytes removed (tab/newline
 *          kept). Pure; never logs its input.
 */
export function sanitize(text: string): string {
  // Iterate by code point so astral characters (emoji, CJK ext) stay intact.
  const chars = Array.from(text);
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x1b) {
      // ESC: drop it, and the following backslash too when it forms `ESC \` (ST).
      if (chars[i + 1] === '\\') i += 1;
      continue;
    }
    if (cp === 0x09 || cp === 0x0a) {
      out += ch; // keep tab and newline
      continue;
    }
    if (cp < 0x20) continue; // other C0 controls (incl. BEL 0x07)
    if (cp >= 0x80 && cp <= 0x9f) continue; // C1 controls (incl. ST 0x9c)
    out += ch;
  }
  return out;
}
