# RD-02: Terminal Capability Model & Auto-Configuration

> **Document**: RD-02-capability-model.md
> **Status**: Draft
> **Created**: 2026-06-27
> **Project**: @blendsdk/tui (Foundation)
> **Depends On**: RD-01
> **CodeOps Skills Version**: 2.0.0

---

## Feature Overview

The heart of the SDK: a layer that **recognizes the terminal it is running on** and
produces a `CapabilityProfile`, then **auto-configures every foundational component**
from it — zero developer configuration. This is the shared core behind both the
shipped runtime adaptation and the diagnostic probe (RD-03). It exists because
terminals vary enormously (truecolor vs 256 vs 16, mouse/CSI-u support, unicode width,
synchronized output, Windows VT) and pushing those differences onto app developers is
the failure mode of older TUI libraries. Assuming capabilities (e.g. truecolor) is
exactly what broke colors over SSH from a Mac.

---

## Functional Requirements

### Must Have
- [ ] Produce an immutable `CapabilityProfile` describing the running terminal (fields in Technical Requirements).
- [ ] **Layered detection with safe fallback**, in priority order: (1) explicit override (API/env), (2) live runtime query with timeout, (3) environment (`COLORTERM`, `TERM`, `TERM_PROGRAM`, `WT_SESSION`, `NO_COLOR`, `FORCE_COLOR`), (4) known-terminal table, (5) conservative safe defaults.
- [ ] **Non-blocking, bounded** detection: any live query (e.g. Device Attributes, `?2026` query) uses a timeout (default **≤ 200 ms**) and never hangs if the terminal does not answer.
- [ ] **Override API**: callers can force any field of the profile (for power users and tests), bypassing detection.
- [ ] Honor `NO_COLOR` (force monochrome) and `FORCE_COLOR=0|1|2|3` (force off/16/256/truecolor) per the de-facto standards.
- [ ] Detect **tmux/screen** (`$TERM` prefix `screen`/`tmux`, `$TMUX`) and apply conservative caps + passthrough policy.
- [ ] Each foundational component (color, input, rendering, host) consumes the profile and adapts — **no component hardcodes capability assumptions**.
- [ ] Expose the resolved profile to the app (read-only) for inspection/telemetry-free debugging.

### Should Have
- [ ] Cache the profile per process; re-resolve only on explicit request (e.g. after a detected terminal change).
- [ ] A "reason trace" explaining which layer set each field (for the probe report and debugging).

### Won't Have (Out of Scope)
- The guided manual confirmation UI and the support-matrix report — that is the harness in RD-03 (this RD is the detection core only).
- Acting on capabilities (drawing, input) — RD-04/05/06/07.

---

## Technical Requirements

### CapabilityProfile (shape)
| Field | Type | Detection source |
|-------|------|------------------|
| `colorDepth` | `'truecolor' \| '256' \| '16' \| 'mono'` | `COLORTERM`/`FORCE_COLOR`/`NO_COLOR`/`TERM`/table |
| `mouse` | `{ sgr: boolean; drag: boolean; wheel: boolean }` | table + runtime; assume on for xterm-class |
| `unicode` | `{ utf8: boolean; widthMode: 'wcwidth' \| 'ambiguous-wide'; emoji: 'narrow' \| 'wide' \| 'unknown' }` | `LANG`/`LC_*` + table + probe (RD-03) |
| `osc` | `{ hyperlink8: bool; clipboard52: bool; title: bool; notify9: bool; notify777: bool; notify99: bool; progress9_4: bool }` | table + manual probe |
| `sync2026` | `boolean` | runtime query (DCS `$q` / known) |
| `altScreen` | `boolean` | table (near-universal) |
| `bracketedPaste` | `boolean` | table |
| `keyboard` | `{ kittyFlags: boolean; modifyOtherKeys: boolean }` | runtime query + table |
| `glyphs` | `{ boxDrawing: boolean; halfBlocks: boolean }` | `utf8` + table; ASCII fallback otherwise |
| `platform` | `'linux' \| 'darwin' \| 'win32'` | `process.platform` |

### Detection algorithm (per field)
```
resolve(field):
  if override has field        -> use it          (layer 1)
  if a safe runtime query exists and answers within timeout -> use it (layer 2)
  if an env var determines it   -> use it          (layer 3)
  if known-terminal table has it -> use it         (layer 4)
  else                          -> conservative default (layer 5)
record reason(layer) for each field
```

- **Runtime queries** (only where a response is defined): Primary Device Attributes (`CSI c`), Secondary DA (`CSI > c`), terminal name/version (`XTVERSION`, `CSI > q`), synchronized-output support. Responses are read via the input decoder (RD-06) and **demultiplexed from user input** (a response must never be delivered to the app as keystrokes).
- **Known-terminal table** keyed by `TERM_PROGRAM`/`WT_SESSION`/`$TERM`: iTerm2, Apple Terminal, gnome-terminal/VTE, Konsole, xterm, Windows Terminal, VS Code, Kitty, Alacritty, foot, tmux/screen.

---

## Integration Points

### With RD-03 (Probe)
- The probe wraps this exact core, adds guided manual confirmation for fire-and-forget features (notifications, some OSC), and renders the per-terminal matrix.

### With RD-04/05/06/07
- Each reads the profile: color encoders pick depth (RD-05), the renderer picks glyph set + sync output (RD-04), the input layer enables mouse/paste/keyboard modes (RD-06), the host enables modes + per-platform behavior (RD-07).

### With RD-08
- The **essentials gate** is evaluated against the profile (keyboard + basic rendering present).

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Detection model | static env-only / layered query+fallback | Layered with bounded runtime query | Accuracy without hanging | AR-9, AR-12 |
| Query timeout | none / bounded | Bounded ≤200 ms, safe fallback | Never hang on silent terminals | AR-24 (edge 2) |
| Width resolution | fixed / capability-driven | Capability-driven (+ probe) | User decision | AR-5 |
| Override | none / full override API | Full override API | Power users + tests | AR-9, AR-17 |

---

## Security Considerations

- **Data sensitivity**: reads environment variables (`TERM`, `LANG`, etc.) — non-sensitive; must **not** read or log secrets.
- **Input validation**: runtime query **responses are untrusted input** — parse strictly against expected grammars; bound response length; reject/ignore malformed responses (a hostile or buggy terminal must not cause unbounded reads or crashes).
- **Authentication & authorization**: n/a.
- **Injection risks**: query responses are demultiplexed from the input stream and never re-emitted; no eval of terminal data.
- **Encryption needs**: none.
- **Rate limiting**: queries are one-shot at startup; bounded.
- **Infrastructure**: none.

---

## Acceptance Criteria

1. [ ] With `COLORTERM=truecolor`, `resolve().colorDepth === 'truecolor'`; with it unset and `TERM=xterm-256color`, `=== '256'`; with `TERM=xterm`, `=== '16'`; with `NO_COLOR=1` (any value), `=== 'mono'` regardless of other signals.
2. [ ] `FORCE_COLOR=0|1|2|3` forces `colorDepth` to `mono|16|256|truecolor` respectively, overriding `TERM`/`COLORTERM` (per the de-facto `FORCE_COLOR` convention).
3. [ ] When a runtime query receives no response, detection completes within the configured timeout (≤200 ms ±50 ms) and falls back to the env/table/default value — the call never rejects or hangs (verified with a stub stream that never replies).
4. [ ] A query response (e.g. `ESC[?64;1;...c` for DA) is consumed by detection and is **not** delivered to the app input stream (verified: the input event corpus shows zero events for injected DA responses).
5. [ ] The override API: `resolve({ override: { colorDepth: '16' } }).colorDepth === '16'` even when `COLORTERM=truecolor` is set.
6. [ ] Boundary: an empty environment (no `TERM`/`COLORTERM`) yields the conservative defaults (`colorDepth: '16'`, `mouse.sgr: false`, `unicode.utf8` from `LANG`), with a recorded reason of "default".
7. [ ] Negative/security: a malformed or oversized query response (e.g. 64 KB with no terminator) is rejected within the response-length bound without crashing or blocking, and detection falls back.
8. [ ] Security requirements verified: response parsing is strict and length-bounded; no environment value is logged at default log level; override and env precedence are unit-tested.
