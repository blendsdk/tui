# 07: Testing Strategy

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

Specification test cases (ST-*) are **immutable oracles** derived from RD-04's
acceptance criteria and plan decisions — never from reading the implementation.
If an ST-* fails after implementation, the implementation is wrong.

Conventions (inherited): `node:test` + `node:assert/strict` via `tsx`; tests under
`test/` only; `*.spec.test.ts` = oracle, `*.impl.test.ts` = edge cases. Capabilities
are supplied via `resolveCapabilities({ override })` or hand-built profile fixtures so
no real terminal is needed. ANSI assertions match exact byte substrings.

> Notation: `ESC` = `\x1b`, `CSI` = `ESC [`, `BEL` = `\x07`.

## Specification Test Cases

### ST-1 — Damage diff: one changed cell (AC-1)
**File**: `test/render-serialize.spec.test.ts`.
Two 80×24 buffers identical except cell (col 5, row 2) differs. `serialize(current,
previous, { caps })` → output contains exactly one `cursorTo(3, 6)` (1-based), one
glyph, and **< 32 bytes** total; no other cursor move appears. Bytes ∝ damage.

### ST-2 — Zero-cost unchanged frame (AC-6)
**File**: `test/render-serialize.spec.test.ts`.
Two identical 80×24 buffers → `serialize()` returns `''` (no cell output, no sync
wrappers) regardless of `caps.sync2026`.

### ST-3 — Width-correct wide glyph (AC-2)
**File**: `test/render-buffer.spec.test.ts`.
`buf.text(0, 0, '世', style)` → `buf.get(0,0).width === 2`, `buf.get(1,0).width === 0`
and its `char === ''`; `text()` returns column **2** (next write starts at col 2).

### ST-4 — Synchronized output wrap (AC-3)
**File**: `test/render-serialize.spec.test.ts`.
With a non-empty change and `caps.sync2026 === true`, the frame **begins** with
`ESC[?2026h` and **ends** with `ESC[?2026l`. With `caps.sync2026 === false`, neither
sequence appears anywhere in the output.

### ST-5 — Box glyph fallback (AC-4)
**File**: `test/render-glyphs.spec.test.ts`.
`box()` then serialize: with `caps.glyphs.boxDrawing === false`, the emitted frame
contains `+`, `-`, `|` and **none** of `┌ ─ ┐ │`; with `boxDrawing === true`, it
contains the Unicode box glyphs and none of the ASCII substitutes for the frame.

### ST-6 — `notify()` capability ladder (AC-5)
**File**: `test/render-osc.spec.test.ts`.
`notify('t','b', caps)` emits: `ESC]99` on a Kitty profile (`osc.notify99`),
`ESC]9` on an iTerm2 profile (`osc.notify9`), `ESC]777` on a urxvt profile
(`osc.notify777`), and **exactly** `BEL` (`\x07`, length 1) on a profile with no
notification support.

### ST-7 — Notify injection neutralized (AC-7)
**File**: `test/render-security.spec.test.ts`.
`notify('t', 'evil\x1b]0;pwned\x07', caps)` → the emitted string contains **no**
`\x1b` or `\x07` from the body (the embedded sequence is stripped), so no second OSC
is introduced; parsing the output finds exactly one notification sequence.

### ST-8 — All text paths sanitized (AC-8)
**File**: `test/render-security.spec.test.ts`.
For each of `text`(via buffer+serialize), `notify`, `setTitle`, `hyperlink`,
`setClipboard`: feeding `"a\x1b]0;x\x07b"` yields output whose payload contains no
`ESC`/`BEL`/`ST`/C0/C1 byte from the untrusted argument (control codes cannot pass).

### ST-9 — Style run-merge within damage (AC-1 detail)
**File**: `test/render-serialize.spec.test.ts`.
A row with three adjacent changed cells of the **same** style emits **one** style SGR
for the run (not three); a style change mid-run emits a new SGR + reset at the break.

### ST-10 — Cursor control (M7)
**File**: `test/render-osc.spec.test.ts`.
`cursor.hide()` === `ESC[?25l`; `cursor.show()` === `ESC[?25h`;
`cursor.to(3, 6)` === `ESC[3;6H` (1-based).

### ST-11 — Half-block & non-UTF-8 fallback (AC-4 detail, PL-9)
**File**: `test/render-glyphs.spec.test.ts`.
With `caps.glyphs.halfBlocks === false`, `█`/`░` serialize to `#`. With
`caps.unicode.utf8 === false`, a non-ASCII non-box glyph (e.g. `é`) serializes to `?`;
an ASCII glyph passes unchanged.

### ST-12 — Clipboard base64 of sanitized text (PL-12)
**File**: `test/render-osc.spec.test.ts`.
`setClipboard('hi', caps)` (with `osc.clipboard52`) === `ESC]52;c;aGk=\x07`
(`base64('hi') === 'aGk='`); the payload between `;c;` and `BEL` is valid base64 and
decodes to the sanitized input.

### ST-13 — Resize forces full repaint (PL-13)
**File**: `test/render-serialize.spec.test.ts`.
`serialize(current, previous, opts)` where `previous` has different dimensions than
`current` → every cell of `current` is emitted (full paint), not a partial diff.

### ST-14 — Sanitizer unit (AC-8, security)
**File**: `test/render-security.spec.test.ts`.
`sanitize("a\x1b]0;x\x07b")` contains neither `\x1b` nor `\x07`; `sanitize` of a
plain UTF-8 string with `\n`/`\t` passes those through unchanged; each of ESC/BEL/ST/
a C0 sample/a C1 sample is individually stripped.

## Implementation Test Cases (impl)

Edge/internal coverage in `*.impl.test.ts`:
- **Buffer**: out-of-bounds `set`/`get` clipped; overwriting half a wide glyph clears
  the orphan partner; `fillRect`/`shadow` geometry; wide glyph at the last column clips
  to a space; `rows()` shape.
- **Width**: boundary code points (`U+4DFF`/`U+4E00`, `U+FF00`, emoji `U+1F600`,
  combining `U+0301`, ambiguous `U+00A1` under both `widthMode`s).
- **Serialize**: multi-row diffs; a run broken by an unchanged cell; full first paint
  (`previous === null`); default encoder mono (no color SGR) vs truecolor; an injected
  custom `encodeStyle` is used instead of the default.
- **Glyphs**: every box glyph (single + double) → fallback; tee/cross glyphs; a glyph
  that needs no fallback under full capabilities.
- **OSC**: each feature's unsupported-capability path (`hyperlink` → plain text,
  `setClipboard`/`setTitle` → `''`); `notify` priority when several flags are set
  (highest wins); base64 of multibyte text.
- **Sanitize**: `ST` in both `\x9c` and `ESC \` forms; tab/newline preserved; empty string.

## Verification Gate

Per task: `npm run verify` (typecheck + test + build). Per phase: `npm run verify &&
npm run lint`. Final: `npm run verify && npm run lint && npm run check:deps && npm
audit` — zero new runtime deps; RD-02/RD-06 suites still green; AC-1…AC-8 all covered
by passing ST-*.

## Traceability

| AC | ST | | Decision | ST |
| -- | -- |-| -------- | -- |
| AC-1 | ST-1, ST-9 | | PL-9 (glyph fallback) | ST-5, ST-11 |
| AC-2 | ST-3 | | PL-12 (clipboard b64) | ST-12 |
| AC-3 | ST-4 | | PL-13 (resize) | ST-13 |
| AC-4 | ST-5, ST-11 | | PL-8 (cursor) | ST-10 |
| AC-5 | ST-6 | | PL-2 (sanitizer) | ST-14 |
| AC-6 | ST-2 | | PL-1 (encoder seam) | ST-9 (impl: default/injected) |
| AC-7 | ST-7 | | | |
| AC-8 | ST-8, ST-14 | | | |
