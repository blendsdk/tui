# RD-04: Rendering Engine

> **Document**: RD-04-rendering-engine.md
> **Status**: Draft
> **Created**: 2026-06-27
> **Project**: @blendsdk/tui (Foundation)
> **Depends On**: RD-01, RD-02
> **CodeOps Skills Version**: 2.0.0

---

## Feature Overview

The output engine: a cell buffer apps draw into, a width-correct cell model, a
damage-diffing serializer that emits **only changed cells**, synchronized output to
prevent tearing, glyph fallback for terminals without box-drawing/UTF-8, and the OSC
feature surface (hyperlinks, clipboard, title, bell, and the capability-driven
`notify()`). It evolves the prototype's proven `ScreenBuffer` and flicker-free
serializer (which already use absolute positioning and run-merged color) rather than
starting over. Everything here is **capability-driven** from RD-02's profile.

---

## Functional Requirements

### Must Have
- [ ] `ScreenBuffer`: a 2-D grid of cells `{ char, fg, bg, attrs, width }` with `set/get/fillRect/text/box/shadow/rows` (migrated + extended from the prototype).
- [ ] **Width-correct cell model**: a wide character (East-Asian width 2, per RD-02 `unicode.widthMode`) occupies two cells; the trailing cell is a continuation that emits no glyph; `text()` advances the cursor by display width, not codepoint count.
- [ ] **Damage diffing**: the serializer compares the new frame to the previous frame and emits ANSI only for changed cells/runs; output byte count is proportional to the number of changed cells, not screen area.
- [ ] **Flicker-free in-place paint**: absolute cursor positioning per changed run, no full-screen erase (preserve the prototype's behavior).
- [ ] **Synchronized output**: when `caps.sync2026`, wrap each frame in begin/end synchronized-update (`?2026h`/`?2026l`); otherwise emit unwrapped.
- [ ] **Glyph fallback**: when `caps.glyphs.boxDrawing/halfBlocks` is false (or non-UTF-8), substitute ASCII equivalents for box-drawing and half-block glyphs (e.g. `+ - |` for frames) so output stays legible.
- [ ] **Cursor control**: show/hide, absolute move, and (where supported) cursor shape.
- [ ] **OSC features**: `hyperlink(text, url)` (OSC 8), `setClipboard(text)` (OSC 52), `setTitle(text)` (OSC 0/2), `bell()`, and **`notify(title, body)`** that auto-selects OSC 99 → 9 → 777 → 9;4 → bell based on `caps.osc`.
- [ ] All glyphs/colors are encoded via the color layer (RD-05) honoring the detected depth.

### Should Have
- [ ] Typed-array backing for the buffer (parallel `Uint32` arrays for char/fg/bg/attrs) for large-screen performance (a perf optimization over per-cell objects).
- [ ] A single coalesced `write()` per frame (one syscall) to reduce partial-frame risk.

### Won't Have (Out of Scope)
- Widgets, layout, windows, focus — UI layer, out of phase (AR-26).
- Image protocols (Sixel/Kitty) — Skip (RD-03 records availability only).
- Color encoding internals — RD-05.

---

## Technical Requirements

### Cell & frame model
```
Cell = { char: string, fg: Color, bg: Color, attrs: AttrMask, width: 0|1|2 }
       width 2 = lead of a wide glyph; width 0 = trailing continuation (no output)
Frame = ScreenBuffer (current) + previous ScreenBuffer (for diffing)
```

### Serialize (diff) algorithm
```
for each row:
  walk cells; for each maximal run where (current != previous) and same style:
     move cursor to run start (absolute), emit SGR for style, emit run glyphs
  unchanged cells emit nothing
wrap whole frame in ?2026 begin/end if caps.sync2026
emit one coalesced write
```

### `notify()` selection
| Priority | Protocol | Sequence (sanitized title/body) |
|----------|----------|----------------------------------|
| 1 | Kitty | `OSC 99 ; ... ST` |
| 2 | iTerm2 | `OSC 9 ; <body> BEL` |
| 3 | urxvt | `OSC 777 ; notify ; <title> ; <body> BEL` |
| 4 | WT/ConEmu | `OSC 9 ; 4 ; ...` (progress/attention) |
| 5 | fallback | `BEL` |

---

## Integration Points

### With RD-02
- Reads `caps.colorDepth`, `caps.sync2026`, `caps.glyphs`, `caps.osc`, `caps.unicode.widthMode` to drive every adaptive behavior.

### With RD-05
- Delegates color/attribute encoding to the color layer.

### With RD-07
- Hands the serialized frame bytes to the host for the actual `write()` (host owns the stream/alt-screen).

### With RD-08
- Untrusted text passed to `text()`, `notify()`, `setTitle()`, `hyperlink()` is sanitized per RD-08 before it can reach the output stream.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Update model | full-frame redraw / damage diff | Damage diffing | Bytes ∝ damage (perf/SSH) | AR-14, AR-25 |
| Tearing | none / synchronized output | `?2026` when supported | Atomic frames | AR-14 |
| Wide chars | 1-col assumption / width-correct | Width-correct cell model | Correctness (CJK/emoji) | AR-5 |
| Missing glyphs | fail / ASCII fallback | ASCII fallback | Legibility on minimal terminals | AR-14 |
| Notifications | drop / capability-driven | `notify()` with fallback ladder | User request | AR-11 |

---

## Security Considerations

- **Data sensitivity**: renders whatever the app draws; clipboard (OSC 52) and notifications may carry app-provided text — the app owns that data; the engine must not log it.
- **Input validation**: **all externally-sourced strings** passed to `text()`, `notify()`, `setTitle()`, `setClipboard()`, `hyperlink()` MUST be sanitized (strip/escape `ESC`, `BEL`, `ST`, C0/C1 control codes) before emission — prevents ANSI/OSC injection and terminal-escape attacks (delegated to RD-08's sanitizer).
- **Authentication & authorization**: n/a.
- **Injection risks**: the primary risk surface of the whole SDK — untrusted text breaking out of a glyph or OSC string. Mitigated by mandatory sanitization at the boundary.
- **Encryption needs**: none.
- **Rate limiting**: bell/notify should be debounce-able by the app to avoid spam (provide the hook; policy is app's).
- **Infrastructure**: none.

---

## Acceptance Criteria

1. [ ] Drawing a single changed cell into an 80×24 buffer and serializing emits ANSI that positions to exactly that cell and writes one glyph — total payload < 32 bytes — while all other cells emit nothing (proves damage diffing; byte count ∝ damage).
2. [ ] A wide CJK character (e.g. `世`, East-Asian width 2) written at column 0 occupies columns 0–1: `get(0)` has `width:2`, `get(1)` has `width:0` and emits no glyph; the next `text()` starts at column 2 (proves width correctness).
3. [ ] With `caps.sync2026 === true`, a frame's bytes begin with `ESC[?2026h` and end with `ESC[?2026l`; with it `false`, neither sequence appears.
4. [ ] With `caps.glyphs.boxDrawing === false`, `box()` renders using ASCII (`+`,`-`,`|`) instead of `┌─┐`; with it `true`, it uses Unicode box-drawing.
5. [ ] `notify("t","b")` emits `OSC 99` on a Kitty profile, `OSC 9` on an iTerm2 profile, `OSC 777` on a urxvt profile, and exactly `BEL` (`\x07`) when `caps.osc` reports no notification support.
6. [ ] Boundary: serializing two identical consecutive frames emits zero cell-output bytes (only optional sync wrappers) — an unchanged screen costs nothing.
7. [ ] Negative/security: `notify("t", "evil\x1b]0;pwned\x07")` emits a sequence in which the embedded `ESC`/`BEL` are stripped or escaped, so no second OSC is injected (verified by parsing the emitted bytes).
8. [ ] Security requirements verified: every text-accepting output method routes through the RD-08 sanitizer; unit tests assert control codes cannot pass through `text`/`notify`/`setTitle`/`hyperlink`/`setClipboard`.
