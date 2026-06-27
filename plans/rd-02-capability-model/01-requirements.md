# Requirements: RD-02 Capability Model & Auto-Config

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-02](../../requirements/RD-02-capability-model.md)

## Feature Overview

Produce an immutable `CapabilityProfile` describing the running terminal via
**layered detection with safe fallback**, plus a per-field **reason trace** and a
full **override API**. The profile is the single source of truth every later
subsystem (color, input, rendering, host) reads to auto-configure — no component
hardcodes capability assumptions. This RD is the **detection core only**; the
guided probe/report is RD-03, and acting on capabilities is RD-04/05/06/07.

## Functional Requirements

### Must Have
- [ ] Immutable `CapabilityProfile` with the fields in [03-01](03-01-capability-model-and-types.md) (AR/RD-02).
- [ ] Layered detection in priority order: (1) override, (2) bounded runtime query, (3) env, (4) known-terminal table, (5) conservative defaults (RD-02; PL-5 fixes colorDepth precedence).
- [ ] Non-blocking, bounded detection: any live query uses a timeout (default ≤ 200 ms, PL-11) and never hangs on a silent terminal (AC-3).
- [ ] Override API: callers force any field, bypassing detection; deep-partial merge (PL-7, AC-5).
- [ ] Honor `NO_COLOR` (force mono, any value — PL-12) and `FORCE_COLOR=0|1|2|3` (off/16/256/truecolor) (AC-1, AC-2).
- [ ] Detect tmux/screen (`$TERM` prefix `screen`/`tmux`, `$TMUX`) → conservative caps + passthrough policy flag.
- [ ] Each foundational component can consume the profile and adapt (this RD exposes it read-only; consumption is later RDs).
- [ ] Expose the resolved profile to the app read-only for inspection.

### Should Have
- [ ] Per-process cache; re-resolve only on explicit `{ refresh: true }` (PL-14).
- [ ] Reason trace explaining which layer set each field (PL-3) — required by RD-03.

### Won't Have (Out of Scope)
- Guided manual confirmation UI and the support-matrix report — RD-03.
- Acting on capabilities (drawing, input modes, host setup) — RD-04/05/06/07.
- The real input-stream wiring for layer 2 — RD-06 (this RD ships the seam + parser only, PL-1).

## Technical Requirements

### Performance
- Detection without a live query is synchronous and sub-millisecond. With a query, total time is bounded by `timeoutMs` (default 200 ms). No runtime perf budget beyond "never hang" (AC-3).

### Compatibility
- Cross-platform parity (Linux/macOS/Windows): detection is pure-JS over `process.env`/`process.platform` plus an injected stream; `platform` is `process.platform` (AR-4, RD-02).
- Node active-LTS 18/20/22 (inherited from RD-01).

### Security
- Runtime-query **responses are untrusted input**: parse strictly against expected grammars; bound response length to **1 KB** (PL-8); reject/ignore malformed or oversized responses without unbounded reads or crashes (AC-7).
- Query responses are demultiplexed from the input stream and never re-emitted as keystrokes (AC-4).
- Reads only non-sensitive env vars; **no env value is logged** at default level; never reads/logs secrets (AC-8).
- No eval of terminal data; no injection surface; queries are one-shot and bounded.

## Acceptance Criteria

> Mirrors RD-02's acceptance criteria; all are locally verifiable in this RD (the
> layer-2 ACs use an injected stub stream per PL-1).

1. [ ] **(AC-1)** `COLORTERM=truecolor` → `colorDepth==='truecolor'`; unset + `TERM=xterm-256color` → `'256'`; `TERM=xterm` → `'16'`; `NO_COLOR` (any value) → `'mono'` regardless of other signals.
2. [ ] **(AC-2)** `FORCE_COLOR=0|1|2|3` → `mono|16|256|truecolor`, overriding `TERM`/`COLORTERM`.
3. [ ] **(AC-3)** A runtime query with no response completes within `timeoutMs` (≤ 200 ms ±50 ms) and falls back; never rejects or hangs (stub stream that never replies).
4. [ ] **(AC-4)** A query response (e.g. DA `ESC[?64;1;...c`) is consumed by detection and **not** delivered to the app input stream (passthrough contains zero response bytes).
5. [ ] **(AC-5)** `resolveCapabilities({ override: { colorDepth: '16' } }).profile.colorDepth === '16'` even with `COLORTERM=truecolor`.
6. [ ] **(AC-6)** Empty env (no `TERM`/`COLORTERM`) → conservative defaults (`colorDepth:'16'`, `mouse.sgr:false`, `unicode.utf8` from `LANG`), reason `'default'`.
7. [ ] **(AC-7)** A malformed or oversized response (e.g. 64 KB, no terminator) is rejected within the 1 KB bound without crashing/blocking; detection falls back.
8. [ ] **(AC-8)** Security verified: response parsing strict + length-bounded; no env value logged at default level; override and env precedence unit-tested.
9. [ ] All ST-* pass; `npm run verify` exits 0 locally; `npm run lint`/`check:deps` clean; no dead code; register fully traced.
