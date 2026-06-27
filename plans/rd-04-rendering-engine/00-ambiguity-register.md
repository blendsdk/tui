# Ambiguity Register: RD-04 Rendering Engine (Plan)

> **Status**: ✅ GATE PASSED — all 17 items resolved
> *(User confirmed via the make_plan interview on 2026-06-27: 8 explicit choices across two question rounds + "Confirm all" for the PL-9…PL-17 planner recommendations.)*
> **Last Updated**: 2026-06-27
> **Scope**: Plan-level decisions for implementing **RD-04** (rendering/output engine) only.
> **Source RD**: [RD-04](../../requirements/RD-04-rendering-engine.md)

The requirements-level Zero-Ambiguity Gate (AR-* in the requirements set) already
passed. This register covers only the **new** plan-level decisions surfaced while
turning RD-04 into an implementation plan. Each entry is prefixed `PL-`.

## The crux: RD-04 ships before RD-05 (color) and RD-08 (sanitizer)

The roadmap's Phase A order is RD-01 → RD-02 → RD-06 → **RD-04** → RD-07 → RD-08,
with RD-05 in Phase B. But RD-04's acceptance criteria need color encoding
(AC-1) and text sanitization (AC-7/AC-8), which RD-05 and RD-08 formally own. So
RD-04 cannot import finished versions — it defines **seams + minimal provisional
implementations** that the later RDs supersede. PL-1, PL-2, and PL-14 resolve this.

## Resolved Decisions

| #     | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|-------|----------|-----------------|-------------------|---------------|--------|
| PL-1  | Architecture / Dependency | RD-04 must emit color SGR but RD-05 (depth-aware encoder) lands later | A: seam + minimal default · B: build full RD-05 now · C: mono-only now | **A — RD-04 defines the `Color`/`AttrMask` types (cells hold them) and a `StyleEncoder` seam, shipping a minimal default encoder (truecolor + mono). RD-05 later implements the full depth-aware encoder behind the same seam. Avoids duplicating RD-05's downsampling tables; mirrors RD-02's `TerminalQuery` seam.** | ✅ Resolved |
| PL-2  | Security / Dependency | RD-04's text paths need sanitizing but RD-08 owns the canonical `sanitize()` | A: shared real module now, RD-08 owns later · B: injectable seam + default | **A — RD-04 creates a small real `sanitize()` (strips `ESC`/`BEL`/`ST`/C0/C1 per RD-08's table) used by every text path. RD-08 later extends/owns that same module (one source of truth, like RD-06's shared `responses.ts`). Satisfies AC-7/AC-8 now.** | ✅ Resolved |
| PL-3  | Architecture | Cell buffer backing (RD-04 Should-Have lists a typed-array optimization) | A: per-cell objects (migrate prototype) · B: typed-array now | **A — migrate the prototype's proven object-based `ScreenBuffer` (`_archive/.../tui/buffer.ts`), extended with `width` (0\|1\|2) + an attribute mask. Simpler; the ACs need no perf optimization. Typed-array backing deferred (**DEF-2**).** | ✅ Resolved |
| PL-4  | Layout | Where the rendering subsystem lives | A: `src/engine/render/` · B: `src/engine/output/` | **A — `src/engine/render/` (`types`, `buffer`, `width`, `ansi`, `serialize`, `glyphs`, `sanitize`, `osc`, `cursor`, `index`), re-exported from `src/engine/index.ts`. Matches the `capability/` + `input/` precedent.** | ✅ Resolved |
| PL-5  | API / Purity | How damage diffing holds the previous frame | A: pure `serialize(current, previous)` · B: stateful `Renderer` | **A — a pure function takes current + previous `ScreenBuffer` and returns the frame string; the RD-07 host holds the previous buffer. Matches the RD's "Frame = current + previous" model and the codebase's pure-function ethos (`decode()` is pure); trivially testable from fixtures.** | ✅ Resolved |
| PL-6  | API | Serializer output type | A: `string` · B: `Uint8Array` | **A — return the ANSI frame as a `string` (ANSI is ASCII text); the host encodes once at write time. Matches the prototype's `serialize()`; keeps fixtures readable; one coalesced string per frame satisfies the "single write" Should-Have.** | ✅ Resolved |
| PL-7  | API / Types | `Color` type shape (cells hold it; RD-05 owns encoding) | A: string union · B: structured union | **A — `Color = `#rrggbb` \| <named ANSI-16> \| 'default'` as a string union, the 16 names as constants. Matches RD-05's stated `Color` type and the prototype's string colors; comparable for run-merging.** | ✅ Resolved |
| PL-8  | Scope | Cursor control — no capability field gates cursor shape | A: show/hide/move now, defer shape · B: include best-effort shape | **A — ship cursor show/hide + absolute move (capability-independent). Defer cursor SHAPE (DECSCUSR) since no caps field gates it and the RD only says "where supported" (**DEF-1**).** | ✅ Resolved |
| PL-9  | Behavior | Glyph fallback substitutions (AC-4) | (recommendation) | **`caps.glyphs.boxDrawing===false` → `box()` uses `+ - |`; `caps.glyphs.halfBlocks===false` → block/shade glyphs (`█▀▄▌▐░▒▓`) → `#`; `caps.unicode.utf8===false` → any cell glyph with codepoint >127 → `?`. Substitution happens at serialize time so cells keep the real glyph.** | ✅ Resolved |
| PL-10 | Behavior | Character-width function (AC-2) | (recommendation) | **A compact zero-dep `charWidth(codepoint, widthMode)`: combining/zero-width → 0, Unicode East-Asian **Wide/Fullwidth** ranges + wide emoji → 2, else 1; ambiguous-width → 2 only when `widthMode==='ambiguous-wide'`. Documented ranges; the table is the single source of width truth.** | ✅ Resolved |
| PL-11 | Behavior | `notify()` protocol ladder (AC-5) | (recommendation) | **Select from `caps.osc` in priority order `notify99`(OSC 99/Kitty) → `notify9`(OSC 9/iTerm2) → `notify777`(OSC 777/urxvt) → `progress9_4`(OSC 9;4/WT) → `bell` (`\x07`). Minimal title/body payloads; both sanitized.** | ✅ Resolved |
| PL-12 | Behavior / Security | OSC text-path encoding | (recommendation) | **`setClipboard` base64-encodes the **sanitized** text (OSC 52); `hyperlink` (OSC 8) and `setTitle` (OSC 0/2) sanitize text/url; `bell` is a literal `\x07`. Every payload is sanitized before emission.** | ✅ Resolved |
| PL-13 | Behavior | Buffer resize vs the diff baseline | (recommendation) | **When current vs previous buffer dimensions differ, force a full repaint (the diff baseline is invalid). A full repaint emits every cell; no stale diff.** | ✅ Resolved |
| PL-14 | API | Seam injection point | (recommendation) | **The render/OSC API takes options `{ caps, encodeStyle?, sanitize? }` with the built-in minimal defaults (PL-1 encoder, PL-2 sanitizer). RD-05/RD-08 inject the full versions later via the host — no API change.** | ✅ Resolved |
| PL-15 | Types | `AttrMask` ownership | (recommendation) | **RD-04 defines the attribute bitmask + constants (`bold dim italic underline blink reverse strike`) since cells hold it; RD-05 encodes it. One bit per attribute; combinable.** | ✅ Resolved |
| PL-16 | Layout | Sanitizer module home | (recommendation) | **`src/engine/render/sanitize.ts` — the shared output sanitizer. RD-08 later owns/relocates it; documented as provisional so the relocation is a known follow-up.** | ✅ Resolved |
| PL-17 | API | `ScreenBuffer` surface & width semantics | (recommendation) | **Migrate `set/get/fillRect/text/box/shadow/rows`; extend `Cell` with `width` + `attrs`; `text()` advances by display width; a wide char sets lead `width:2` + a trailing continuation `width:0` (emits no glyph); out-of-bounds writes clipped (prototype behavior).** | ✅ Resolved |

### Resolution Notes

- **PL-1 / PL-2 / PL-14 (the crux):** RD-04 is the first output code but two of its
  dependencies (RD-05 color, RD-08 sanitizer) are scheduled later. Rather than block
  or duplicate, RD-04 ships **seams with minimal real defaults**: a truecolor/mono
  `StyleEncoder` and a control-stripping `sanitize()`. The full RD-05 encoder and
  RD-08 sanitizer slot in behind the same seams with no API change — the same pattern
  RD-02 used for its `TerminalQuery` seam and RD-06 used for the shared `responses.ts`.
- **PL-2 / PL-16:** the sanitizer is the project's primary security boundary (RD-08).
  Building a real (not stubbed) minimal sanitizer now means AC-7/AC-8 are genuinely
  enforced from RD-04's first line of output code, not deferred.
- **PL-5 / PL-6:** the serializer stays a pure `(current, previous, options) → string`
  function so frames are reproducible from fixtures (mirrors `decode()`); the stateful
  "previous frame" lives with the RD-07 host.
- **PL-9…PL-17** are the planner's recommendations, confirmed by the user's explicit
  "Confirm all" (per the gate's final-confirmation rule), not by silence.

### Runtime Decisions (exec_plan)

- **RT-1 (runtime, 2026-06-27):** The plan's `set(x, y, char, style)` signature
  omits a width mode, yet `set` must compute display width to place wide-glyph
  lead/continuation cells and clear orphaned partners (the documented PL-17
  behavior + impl-test "overwrite half a wide glyph clears the orphan"). The only
  faithful realization is to give `set` an optional `widthMode` parameter
  (default `'wcwidth'`, RD-02's default mode) that `text()` threads through. No
  alternative satisfies the documented behavior, so this was recorded and applied
  rather than blocking. Additive/optional — does not change the documented call
  sites. Implemented in `src/engine/render/buffer.ts`.

### Deferred Items

- **DEF-1 (later):** Cursor **shape** (DECSCUSR). No capability field gates it; ship
  show/hide/move now. Revisit if a cursor-shape capability is added.
- **DEF-2 (Phase B / perf):** Typed-array buffer backing (parallel `Uint32` arrays) —
  the RD-04 Should-Have performance optimization over per-cell objects. The object
  model ships first; the typed-array backing is a drop-in perf swap behind the same
  `ScreenBuffer` API.
