# RD-03: Capability Probe & Survey Harness

> **Document**: RD-03-capability-probe.md
> **Status**: Draft
> **Created**: 2026-06-27
> **Project**: @blendsdk/tui (Foundation)
> **Depends On**: RD-02, RD-04, RD-06, RD-07
> **CodeOps Skills Version**: 2.0.0

---

## Feature Overview

The **spike**: a diagnostic harness that attempts **every** capability the SDK cares
about and reports **what actually works on the running terminal**, per terminal and OS.
It is the evidence engine that turns "we think X is possible" into a recorded support
matrix, and it de-risks the whole project. It reuses RD-02's detection core and adds
two things detection alone cannot do: **guided manual confirmation** for fire-and-forget
features (notifications, some OSC) where the terminal returns no response, and a
**human-readable + machine-readable report**. In probe mode the harness **probes all
capabilities and never stops** (contrast with the runtime essentials gate in RD-08).

---

## Functional Requirements

### Must Have
- [ ] Probe **all** capabilities (every "Want" and "Maybe"), and **attempt and record** even "Skip"-class features (e.g. Sixel/Kitty images) purely to report availability.
- [ ] **Automatic probes** where a response exists: color depth, `?2026` sync, DA/version, keyboard protocol (CSI-u/Kitty), unicode width sanity (cursor-position report after printing a wide char), mouse capability.
- [ ] **Guided manual probes** where no response exists: render labeled test patterns and ask the operator to confirm — color swatches (truecolor/256/16), all text attributes, box-drawing/half-block glyphs, wide-CJK/combining/emoji alignment grids, **desktop notifications** (OSC 9 / 777 / 99 / 9;4 / bell), hyperlinks (OSC 8), clipboard (OSC 52), title set, alt-screen.
- [ ] **Live input readout**: display decoded events as the operator presses keys (incl. modifiers/function keys), moves/drags/clicks the mouse, scrolls the wheel, and pastes — so keyboard/mouse/scroll/paste support is observed directly.
- [ ] Emit a **support matrix** as both JSON (machine-readable) and a formatted table (human-readable), tagged with terminal name/version, OS, `TERM`/`COLORTERM`, multiplexer, and timestamp.
- [ ] Run **non-destructively**: enter alt-screen, restore the terminal fully on exit (including crash), per RD-07.
- [ ] Never stop on a missing capability — record it as unsupported and continue (AR-7).

### Should Have
- [ ] Append results to a checked-in `terminal-matrix.json` so the project accumulates a cross-terminal evidence base.
- [ ] A non-interactive `--auto` mode that records only the automatically-detectable facts (for CI), clearly marking manual items as "unverified".

### Won't Have (Out of Scope)
- Runtime auto-configuration logic — that is RD-02 (the probe consumes the same core but does not replace it).
- Any production app behavior; the harness lives under `examples/`.

---

## Technical Requirements

### Probe taxonomy
| Group | Items | Method |
|-------|-------|--------|
| Color | truecolor/256/16 swatches; downsample correctness | manual + auto (`COLORTERM`) |
| Attributes | bold, dim, italic, underline, reverse, strikethrough, blink | manual |
| Glyphs | box-drawing, half-blocks, shade chars; ASCII fallback legibility | manual |
| Unicode | wide CJK = 2 cells, combining marks, emoji/ZWJ alignment | auto (cursor report) + manual |
| Output | `?2026` sync, scroll region, cursor shapes | auto (query) + manual |
| OSC | hyperlink 8, clipboard 52, title, **notify 9/777/99/9;4**, bell | manual (fire-and-forget) |
| Keyboard | full key table, modifiers, CSI-u/Kitty, bracketed paste | live readout |
| Mouse | click/drag/release/wheel(v+h)/focus, SGR coords >223 | live readout |
| Host | alt-screen, raw mode, resize, suspend/resume, non-TTY | runtime + manual |
| Images (Skip) | Sixel, Kitty graphics | attempt + record only |

### Report schema (JSON, abbreviated)
```
{ terminal, version, os, term, colorterm, multiplexer, timestamp,
  results: { "<capability>": { supported: bool|null, method: "auto"|"manual", note } },
  recommendation: { colorDepth, mouse, unicodeWidth, ... } }
```
`supported: null` means "could not determine" (e.g. manual item skipped in `--auto`).

---

## Integration Points

### With RD-02
- Wraps the detection core; the manual confirmations feed back as override evidence to refine the known-terminal table.

### With RD-04 / RD-06 / RD-07
- Uses the renderer to draw test patterns, the input system to show the live readout, and the host to manage the terminal safely.

### With RD-09
- The matrix is an input to the acceptance gate's cross-terminal verification; `--auto` mode runs in the CI matrix.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Coverage | Wants only / Wants+Maybes+record-Skips | All, record everything | "See what's possible" | AR-10 |
| Method | auto-only / auto+guided-manual | Auto + guided manual | Fire-and-forget features need a human | AR-10 |
| Stop behavior | stop on missing / never stop | Never stop | Probe mode (vs runtime gate) | AR-7 |
| Notifications | exclude / include | Include OSC 9/777/99/9;4 + bell | User request | AR-11 |

---

## Security Considerations

- **Data sensitivity**: the report records terminal name/version/OS and env values `TERM`/`COLORTERM`/`TERM_PROGRAM` only — **no** secrets, no full environment, no user input contents (the live readout shows event *types/positions*, and for paste shows length, not contents, by default).
- **Input validation**: all terminal query responses parsed strictly and length-bounded (per RD-02); manual-probe operator input constrained to the confirmation keys.
- **Authentication & authorization**: n/a.
- **Injection risks**: test patterns are program-generated constants; no untrusted text is embedded into OSC sequences.
- **Encryption needs**: none.
- **Rate limiting**: n/a (operator-driven).
- **Infrastructure**: `--auto` CI mode must not require a real display; runs headless.

---

## Acceptance Criteria

1. [ ] Running the harness on a truecolor terminal renders three labeled swatch rows (truecolor, 256, 16) and records `color.truecolor: { supported: true, method: "manual" }` after operator confirmation.
2. [ ] The live input readout prints a decoded event for: every arrow/Home/End/PgUp/PgDn/F1–F12 key, Ctrl/Alt/Shift combinations, a left click, a drag, a release, a vertical wheel scroll, and a bracketed paste — each shown with correct type and (for mouse) 1-based coordinates.
3. [ ] On a terminal with no notification support, each notification protocol (OSC 9/777/99/9;4) is recorded `supported: false` after the operator confirms "no popup", and the harness **continues** to the next probe (never stops) — proving AR-7.
4. [ ] The harness emits a JSON report validating against the report schema and a human-readable table; both contain the terminal name, OS, `TERM`, `COLORTERM`, and a `recommendation` block.
5. [ ] `--auto` mode produces a report with all manual-only items marked `supported: null, method: "manual"` (unverified) and exits 0 without requiring operator input (CI-runnable).
6. [ ] Boundary: on a non-TTY (piped) invocation the harness detects it, prints a clear message, and exits without entering alt-screen or raw mode.
7. [ ] On exit (normal, Ctrl-C, or thrown error) the terminal is fully restored (cooked mode, main screen, cursor visible, mouse off) — verified via PTY capture showing the matching leave sequences.
8. [ ] Security requirements verified: the report contains no secrets and no paste contents; query responses are length-bounded; test patterns embed no untrusted text in OSC.
