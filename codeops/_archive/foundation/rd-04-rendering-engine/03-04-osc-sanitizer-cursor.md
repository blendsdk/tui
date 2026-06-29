# 03-04: OSC Features, Sanitizer & Cursor

> **Document**: 03-04-osc-sanitizer-cursor.md
> **Parent**: [Index](00-index.md)
> **Decisions**: PL-2, PL-8, PL-11, PL-12, PL-14, PL-16

The OSC feature surface, the provisional shared sanitizer (the security boundary),
and cursor control. Files: `src/engine/render/sanitize.ts`,
`src/engine/render/osc.ts`, `src/engine/render/cursor.ts`.

## Sanitizer (sanitize.ts, PL-2, PL-16) — the security boundary

```ts
/**
 * Strip terminal-control bytes from untrusted text before it reaches the stream.
 * The project's primary injection control (RD-08 owns the canonical version later).
 * @returns `text` with ESC/BEL/ST and C0/C1 control codes removed.
 */
export function sanitize(text: string): string;
```

Rule table (from RD-08 §Sanitizer rule; AC-7/AC-8):

| Input byte / range | Action |
| ------------------ | ------ |
| `ESC` (0x1b) | strip |
| `BEL` (0x07) | strip |
| `ST` (0x9c, and the `ESC \` form) | strip |
| C0 (0x00–0x1f) **except** `\t` (0x09) and `\n` (0x0a) | strip |
| C1 (0x80–0x9f) | strip |
| valid printable / UTF-8 | pass |

> **Provisional (PL-16):** documented in the file header as the RD-04-shipped sanitizer
> that RD-08 will own/relocate. It is **real**, not a stub — every text path routes
> through it from the first line (AC-8), so the injection boundary exists now.

## OSC features (osc.ts, PL-11, PL-12)

Every text/url argument is `sanitize()`d before emission (SEC-1, AC-8). Each function
returns the ANSI string for the host to write (pure, like `serialize`).

```ts
export function hyperlink(text: string, url: string, caps: CapabilityProfile): string;     // OSC 8
export function setClipboard(text: string, caps: CapabilityProfile): string;               // OSC 52
export function setTitle(text: string, caps: CapabilityProfile): string;                    // OSC 0/2
export function bell(): string;                                                             // BEL
export function notify(title: string, body: string, caps: CapabilityProfile): string;      // ladder
```

### `hyperlink` (OSC 8, PL-12)
`caps.osc.hyperlink8` → `\x1b]8;;<sanitize(url)>\x1b\\<sanitize(text)>\x1b]8;;\x1b\\`.
When unsupported → just `sanitize(text)` (plain text, no escape).

### `setClipboard` (OSC 52, PL-12)
`caps.osc.clipboard52` → `\x1b]52;c;<base64(sanitize(text))>\x07`. Base64 of the
**sanitized** text (sanitize first, then encode). When unsupported → emit nothing (`''`).

### `setTitle` (OSC 0/2, PL-12)
`caps.osc.title` → `\x1b]0;<sanitize(text)>\x07`. When unsupported → `''`.

### `bell`
Returns the literal `\x07`. (The app owns debounce/rate-limit policy, SEC-3.)

### `notify(title, body)` — capability ladder (PL-11, AC-5)
Select the **first** supported protocol, in this priority order, with sanitized
title/body:

| Priority | Capability flag | Sequence |
| -------- | --------------- | -------- |
| 1 | `osc.notify99` | `\x1b]99;;<title>\x1b\\` then body chunk (Kitty OSC 99, minimal) |
| 2 | `osc.notify9` | `\x1b]9;<title> — <body>\x07` (iTerm2 OSC 9) |
| 3 | `osc.notify777` | `\x1b]777;notify;<title>;<body>\x07` (urxvt OSC 777) |
| 4 | `osc.progress9_4` | `\x1b]9;4;1;0\x07` (WT/ConEmu attention/progress) |
| 5 | *(none)* | `\x07` (BEL fallback — exactly one byte, AC-5) |

`title`/`body` are sanitized, so an embedded `ESC`/`BEL` (`"evil\x1b]0;pwned\x07"`)
cannot open a second OSC (AC-7) — the stripped payload yields a single well-formed
sequence. Payloads are minimal (title + body only), not full Kitty metadata (PL-11).

## Cursor control (cursor.ts, PL-8)

```ts
export const cursor = {
  show(): string;            // CSI ?25h
  hide(): string;            // CSI ?25l
  to(row: number, col: number): string; // 1-based absolute move (CSI row;col H)
} as const;
```

Cursor **shape** (DECSCUSR) is deferred (DEF-1) — no capability gates it. Show/hide/move
are capability-independent and always safe.

## Security posture (AC-7, AC-8) — from the first line of output

| Concern | Control | Ref |
| ------- | ------- | --- |
| ANSI/OSC injection via untrusted text | Mandatory `sanitize()` on every text/url arg | AC-7, AC-8 |
| Second-OSC breakout (`\x1b]…`) | `ESC`/`BEL`/`ST` stripped before emission | AC-7 |
| App data leakage | No logging of clipboard/notify/title/draw text (SEC-2) | RD-04 §Security |
| Notification/bell spam | Pure functions; app owns debounce (SEC-3) | RD-04 §Security |
| Code execution | No `eval`; pure string building only | — |
