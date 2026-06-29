# Requirements: RD-03 Capability Probe & Survey Harness

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-03](../../requirements/RD-03-capability-probe.md)

## Feature Overview

An operator-driven diagnostic harness that attempts **every** capability the SDK cares
about and reports **what actually works** on the running terminal, per terminal and OS.
It reuses RD-02's detection core, adds guided manual confirmation for fire-and-forget
features, shows a live decoded-input readout, and emits a JSON + table report tagged
with terminal/OS/env metadata. It runs non-destructively (alt-screen with guaranteed
restore) and **never stops** on a missing capability — it records it and continues.

The harness lives under `examples/capability-probe/` and is not shipped in the package
(AR-2). The one shippable artifact is a real tty-backed `TerminalQuery` in
`src/engine/host/` that completes RD-02's deferred layer-2 wiring (AR-3).

## Functional Requirements

### Must Have

- [ ] Probe **all** capabilities (every Want and Maybe) and **attempt + record** even Skip-class features (Sixel/Kitty images) purely to report availability. [AR-14]
- [ ] **Automatic probes** where a response exists: color depth, `?2026` sync, DA/version (XTVERSION), keyboard protocol (CSI-u/Kitty), unicode-width sanity (cursor-position report after a wide char), mouse capability — read through the real `TerminalQuery` under a bounded timeout, in a dedicated upfront phase. [AR-9, AR-3]
- [ ] **Guided manual probes** where no response exists: color swatches (truecolor/256/16), all text attributes, box-drawing/half-block/shade glyphs, wide-CJK/combining/emoji alignment grids, **desktop notifications** (OSC 9 / 777 / 99 / 9;4 / bell), hyperlinks (OSC 8), clipboard (OSC 52), title set, alt-screen. Operator confirms with y/n/s. [AR-8, AR-16]
- [ ] **Live input readout**: display decoded events as the operator presses keys (incl. modifiers/function keys), moves/drags/clicks the mouse, scrolls the wheel, and pastes — ended by `q`. [AR-8]
- [ ] Emit a **support matrix** as both JSON (machine-readable) and a formatted table (human-readable), tagged with terminal name/version, OS, `TERM`/`COLORTERM`, multiplexer, and timestamp. [AR-5]
- [ ] Run **non-destructively**: enter alt-screen, fully restore the terminal on every exit path including crash and Ctrl-C, per RD-07. [AR-8]
- [ ] Never stop on a missing capability — record it as unsupported and continue. [AR-15]
- [ ] A `recommendation` block derived from `resolveCapabilities`, with auto-probe + manual confirmations folded in as override evidence. [AR-10]

### Should Have

- [ ] Append results to a checked-in repo-root `terminal-matrix.json` (JSON array of report objects) so the project accumulates a cross-terminal evidence base; `--no-matrix` skips the append. [AR-6]
- [ ] A non-interactive `--auto` mode that records only automatically-detectable facts (for CI), clearly marking manual items as `supported: null, method: "manual"` (unverified), exiting 0 without operator input. [AR-7]

### Won't Have (Out of Scope)

- Runtime auto-configuration logic — that is RD-02 (the probe consumes the same core but does not replace it).
- Any production app behavior; the harness is a dev-only diagnostic under `examples/`. [AR-2]
- Actual rendering of Sixel/Kitty **images** — the harness attempts and records availability only, it does not implement an image protocol. [AR-14]
- Cross-platform acceptance on macOS/Windows — that is RD-09's matrix; this plan targets Linux (the harness is platform-portable but verified on Linux here).

## Technical Requirements

### Probe taxonomy (RD-03 §Probe taxonomy)

| Group | Items | Method |
|-------|-------|--------|
| Color | truecolor/256/16 swatches; downsample correctness | manual + auto (`COLORTERM`) |
| Attributes | bold, dim, italic, underline, reverse, strikethrough, blink | manual |
| Glyphs | box-drawing, half-blocks, shade chars; ASCII fallback legibility | manual |
| Unicode | wide CJK = 2 cells, combining marks, emoji/ZWJ alignment | auto (cursor report) + manual |
| Output | `?2026` sync, scroll region, cursor shapes | auto (query) + manual |
| OSC | hyperlink 8, clipboard 52, title, notify 9/777/99/9;4, bell | manual (fire-and-forget) |
| Keyboard | full key table, modifiers, CSI-u/Kitty, bracketed paste | live readout |
| Mouse | click/drag/release/wheel(v+h)/focus, SGR coords >223 | live readout |
| Host | alt-screen, raw mode, resize, suspend/resume, non-TTY | runtime + manual |
| Images (Skip) | Sixel, Kitty graphics | attempt + record only |

### Report schema (JSON)

```jsonc
{
  "terminal": "string", "version": "string|null", "os": "linux|darwin|win32",
  "term": "string|null", "colorterm": "string|null", "termProgram": "string|null",
  "multiplexer": "boolean", "timestamp": "ISO-8601 string",
  "results": {
    "<capability-id>": { "supported": true, "method": "auto", "note": "string?" }
    // supported: boolean | null  (null = could not determine, e.g. manual item in --auto)
  },
  "recommendation": { "colorDepth": "...", "mouse": true, "unicodeWidth": "...", "...": "..." }
}
```

`terminal-matrix.json` is a JSON **array** of these report objects (append-on-run). [AR-6]

### CLI surface [AR-7]

| Flag | Effect |
|------|--------|
| `--auto` | Non-interactive: auto facts only, manual items `null`, exit 0, no alt-screen prompts |
| `--out <path>` | Additionally write a standalone single-report JSON to `<path>` |
| `--no-matrix` | Skip the `terminal-matrix.json` append |
| `--help` | Print usage and exit 0 |
| *(unknown flag)* | Print an error message to stderr and exit non-zero |

### Performance

- Auto-probe phase bounded by the RD-02 query timeout (default 200 ms total); the harness must not hang on a silent terminal. [AR-9]

### Compatibility

- ESM-only, zero runtime dependencies (hand-rolled arg parser; Node built-ins + `src/engine` only). Node ≥ 18.
- `--auto` mode must run headless (no real display) for CI. [AR-7]

### Security [AR-17]

- Report records only terminal name/version/OS and `TERM`/`COLORTERM`/`TERM_PROGRAM` — no secrets, no full environment, no user-input contents.
- Live readout shows event types/positions; for paste it shows **byte length, not contents**.
- All terminal query responses are parsed strictly and length-bounded (delegated to RD-02 `runQueries`, `RESPONSE_BUFFER_CAP`).
- Manual-probe operator input constrained to the confirmation-key allowlist (y/n/s/Enter/q + Ctrl-C). [AR-8]
- Test patterns are program-generated constants; no untrusted text embedded into OSC sequences.

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
| -------- | ------------------ | ------ | --------- | ------ |
| Plan scope | Full RD (phased) / MVP slice | Full RD, 5 phases | Evidence matrix needs breadth; matches RD-05/08 completeness | AR-1 |
| Location / run | `examples/capability-probe/` / `examples/probe/` | `examples/capability-probe/`, `npm run probe` | Mirrors RD title; dev-only (already excluded from `files`) | AR-2 |
| `TerminalQuery` impl | Ship in `src/engine/host/` / probe-local | Ship reusable | Completes RD-02 layer-2 wiring; usable by real consumers | AR-3 |
| Testing | Layered / pure-only | Layered (spec + fakes + PTY e2e + `--auto` e2e) | Automates AC-2/5/6/7 verification | AR-4 |
| Report output | Table+file / always stdout | Table → stdout; `--auto` → stdout JSON; `--out` file | Clean human/machine split; CI-capturable | AR-5 |
| Matrix file | Include / defer | Include, repo-root append, `--no-matrix` | Core "accumulate evidence" purpose | AR-6 |
| CLI flags | Full set / minimal | `--auto`/`--out`/`--no-matrix`/`--help` | Covers AC-5 + overrides | AR-7 |
| Controls | y/n/s+Enter+q / y/n+Enter+Esc | y/n/s, Enter, q, Ctrl-C | Explicit skip → `null`; allowlisted input | AR-8 |
| Auto sequencing | Upfront phase / interleaved | Dedicated upfront auto phase | Query bytes can't be read as manual keys | AR-9 |
| Recommendation | From profile / from probe results | From `resolveCapabilities`, folded | Reuse RD-02 as single source of truth | AR-10 |
| Default artifacts | Matrix-only / always per-run file | Matrix append only; `--out` standalone | No redundant default artifacts | AR-11 |
| Typecheck examples | `tsconfig.examples.json` / lint-only | `tsconfig.examples.json` + `verify` | Real type checking; build stays src-only | AR-12 |

> **Traceability:** Every scope decision references the Ambiguity Register entry that resolved it. See `00-ambiguity-register.md`.

## Acceptance Criteria

1. [ ] On a truecolor terminal the harness renders three labeled swatch rows (truecolor, 256, 16) and records `color.truecolor: { supported: true, method: "manual" }` after operator confirmation. (RD AC-1)
2. [ ] The live input readout prints a decoded event for every arrow/Home/End/PgUp/PgDn/F1–F12 key, Ctrl/Alt/Shift combinations, a left click, a drag, a release, a vertical wheel scroll, and a bracketed paste — each with correct type and (for mouse) 1-based coordinates. (RD AC-2)
3. [ ] On a terminal with no notification support, each notification protocol (OSC 9/777/99/9;4) is recorded `supported: false` after the operator confirms "no popup", and the harness **continues** to the next probe (never stops). (RD AC-3, AR-15)
4. [ ] The harness emits a JSON report validating against the report schema and a human-readable table; both contain terminal name, OS, `TERM`, `COLORTERM`, and a `recommendation` block. (RD AC-4)
5. [ ] `--auto` mode produces a report with all manual-only items marked `supported: null, method: "manual"` and exits 0 without operator input (CI-runnable). (RD AC-5)
6. [ ] Boundary: on a non-TTY (piped) interactive invocation the harness detects it, prints a clear message, and exits without entering alt-screen or raw mode. (RD AC-6)
7. [ ] On exit (normal, Ctrl-C, or thrown error) the terminal is fully restored (cooked mode, main screen, cursor visible, mouse off) — verified via PTY capture showing the matching leave sequences. (RD AC-7)
8. [ ] Security verified: the report contains no secrets and no paste contents; query responses are length-bounded; test patterns embed no untrusted text in OSC. (RD AC-8, AR-17)
9. [ ] `npm run verify` is green (typecheck incl. `typecheck:examples`, tests, build); lint, `check:deps`, and `npm audit` clean.
