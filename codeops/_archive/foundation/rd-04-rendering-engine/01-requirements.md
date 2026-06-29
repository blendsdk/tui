# 01: Requirements & Scope

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-04](../../requirements/RD-04-rendering-engine.md)

## Feature

The terminal **output engine** for `@blendsdk/tui`: a width-correct cell buffer,
a damage-diffing serializer (emits only changed cells), synchronized output,
capability-driven glyph fallback, cursor control, and the OSC feature surface
(hyperlink, clipboard, title, bell, `notify()`). Every adaptive behavior is
driven by RD-02's `CapabilityProfile`. Color encoding and text sanitization are
provided via **seams** with minimal built-in defaults until RD-05/RD-08 land
(PL-1, PL-2, PL-14).

## In Scope (Must-Have, per RD-04)

- **M1** — `ScreenBuffer`: a 2-D grid of `Cell { char, fg, bg, attrs, width }` with
  `set/get/fillRect/text/box/shadow/rows`, migrated + extended from the prototype (PL-3, PL-17).
- **M2** — Width-correct cell model: an East-Asian-width-2 glyph occupies two cells;
  the trailing cell is a `width:0` continuation that emits no glyph; `text()` advances
  by display width (PL-10, PL-17). [AC-2]
- **M3** — Damage diffing: `serialize()` compares current vs previous and emits ANSI
  only for changed cells/runs; bytes ∝ damage (PL-5). [AC-1, AC-6]
- **M4** — Flicker-free in-place paint: absolute cursor positioning per changed run,
  no full-screen erase.
- **M5** — Synchronized output: wrap each frame in `?2026h`/`?2026l` when
  `caps.sync2026`, else unwrapped. [AC-3]
- **M6** — Glyph fallback: ASCII substitution for box-drawing / half-blocks when
  `caps.glyphs.*` is false or non-UTF-8 (PL-9). [AC-4]
- **M7** — Cursor control: show/hide + absolute move (shape deferred, PL-8/DEF-1).
- **M8** — OSC features: `hyperlink` (OSC 8), `setClipboard` (OSC 52), `setTitle`
  (OSC 0/2), `bell`, and `notify(title, body)` with the capability-driven ladder
  (PL-11, PL-12). [AC-5]
- **M9** — All colors/attributes encoded via the `StyleEncoder` seam honoring the
  detected depth (PL-1, PL-14); RD-04 ships the minimal default encoder.

## In Scope (Should-Have)

- **S1** — A single coalesced frame string per `serialize()` (one host `write()`), PL-6.

## Out of Scope

- Widgets / layout / windows / focus — UI layer (RD-04 §Won't-Have).
- Image protocols (Sixel/Kitty graphics) — not in foundation.
- **Full** depth-aware color downsampling (256/16 nearest-color tables, attribute
  encoding internals) — **RD-05** fills the `StyleEncoder` seam (PL-1).
- **Canonical** sanitizer ownership, logging, essentials gate — **RD-08**; RD-04
  ships a provisional shared `sanitize()` (PL-2, PL-16).
- Typed-array buffer backing — **DEF-2** (perf optimization, deferred).
- Cursor **shape** (DECSCUSR) — **DEF-1** (no capability gates it).
- DOS palette / semantic theme constants — **RD-05** owns the palette.

## Security Requirements (RD-04 §Security, mandatory)

- **SEC-1** — Every externally-sourced string passed to `text()`, `notify()`,
  `setTitle()`, `setClipboard()`, `hyperlink()` is sanitized (strip `ESC`/`BEL`/`ST`/
  C0/C1) before emission — prevents ANSI/OSC injection (PL-2, PL-12). [AC-7, AC-8]
- **SEC-2** — The engine never logs app-provided text (clipboard/notify/draw content).
- **SEC-3** — `notify`/`bell` expose a hook the app can debounce; rate-limit policy
  is the app's (the engine provides the mechanism only).

## Acceptance Criteria → Spec Tests

| AC | Summary | ST |
| -- | ------- | -- |
| AC-1 | One changed cell in 80×24 → ANSI positions to it + one glyph, payload < 32 bytes, others nothing | ST-1 |
| AC-2 | Wide CJK at col 0 → `get(0).width===2`, `get(1).width===0` (no glyph), next `text()` at col 2 | ST-3 |
| AC-3 | `sync2026` true → frame begins `ESC[?2026h`, ends `ESC[?2026l`; false → neither | ST-4 |
| AC-4 | `glyphs.boxDrawing` false → `box()` uses `+ - |`; true → Unicode box-drawing | ST-5 |
| AC-5 | `notify` → OSC 99 (Kitty) / OSC 9 (iTerm2) / OSC 777 (urxvt) / exactly `BEL` when no support | ST-6 |
| AC-6 | Two identical frames → zero cell-output bytes (only optional sync wrappers) | ST-2 |
| AC-7 | `notify("t","evil\x1b]0;pwned\x07")` → embedded `ESC`/`BEL` stripped, no injected OSC | ST-7 |
| AC-8 | Every text-accepting method routes through `sanitize`; control codes cannot pass | ST-8, ST-14 |

## Definition of Done

- All Must-Have + S1 implemented; AC-1…AC-8 covered by passing ST-*.
- `npm run verify` green; `npm run lint` + `npm run check:deps` clean; `npm audit` clean;
  **zero new runtime dependencies**.
- Public API re-exported from `src/engine/index.ts`; README section added.
- RD-02 / RD-06 suites still green; no dead code; register fully traced.
