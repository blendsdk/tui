# Requirements: RD-08 Essentials Gate, Logging, Errors & Security

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-08](../../requirements/RD-08-essentials-logging-security.md)

## Feature Overview

RD-08 is the cross-cutting safety layer of the `@blendsdk/tui` foundation. It encodes the
**runtime half** of the project's two-mode behavior: the capability *spike* (RD-03) never
stops, but the *SDK at runtime* refuses to start when the terminal cannot support the
essentials. Around that gate it adds the diagnostic logging a screen-owning library must do
off-screen, the redaction that keeps keystrokes and pastes out of logs, a typed error model
that guarantees terminal restore on any throw, and the canonical sanitizer that is the
project's primary injection boundary.

All new code lives in one subsystem, `src/engine/safety/`, re-exported from the SDK's single
public entry point. RD-02 (capability model) and RD-07 (host) are **consumed, not modified**.

## Functional Requirements

### Must Have

- [ ] **Essentials gate (Option A)** — the SDK starts only on an interactive TTY (which implies
  raw-mode keyboard input). TTY facts are resolved by `detectTty()` (RD-07 helper that shares the
  host's stream/`/dev/tty` detection) **before** the host enters any mode. If unmet, the SDK does
  **not** start: it throws `EssentialsNotMetError` naming the missing capability **before**
  `start()` — so no modes are entered and the terminal is left untouched (no restore needed) — and
  (in app context) the process exits non-zero. Color is **not** an essential (monochrome always
  counts), so `colorDepth` is not gated. *(AR-1, AR-2)*
- [ ] **Graceful degradation for non-essentials** — missing mouse → keyboard-only; missing
  color (mono) → monochrome; missing alt-screen → documented inline fallback. Each is a
  structured degradation entry, never a hard stop, with a one-time screen-safe notice. *(AR-8)*
- [ ] **Screen-safe logging** — `createLogger()` writes to a file, to `stderr` (only when
  `stderr ≠ UI` stream), or to a bounded in-memory ring — **never** to the UI output stream.
  Gated by `BLENDTUI_DEBUG=1` (+ `BLENDTUI_LOG=<path>`); disabled by default. *(AR-5, AR-10, AR-14)*
- [ ] **No secret logging** — raw keystrokes and paste contents are **never** logged at any
  level; redaction is the default. `redactEvent()` emits event *types* and non-secret fields
  only (a paste logs its length, not its text). *(AR-9)*
- [ ] **Error model** — typed error classes (`TuiError` base, `EssentialsNotMetError`,
  `LoggerConfigError`); any error thrown through the app's loop triggers guaranteed terminal
  restore (the host's existing crash path) before propagating. *(AR-1, AR-7)*
- [ ] **Sanitizer** — a single canonical `sanitize(text)` (relocated into `safety/`, strip-only,
  identical signature) used by every text-accepting output path (RD-04 `text`/`notify`/
  `setTitle`/`hyperlink`/`setClipboard`), stripping ESC/BEL/ST and C0/C1 controls from
  untrusted content. *(AR-3, AR-13)*
- [ ] **Paste size cap (defined here, enforced in RD-06)** — RD-08 owns the cap's acceptance
  tests (boundary + DoS); enforcement stays in the RD-06 decoder. *(AR-11)*

### Should Have

- [ ] **Structured log record format** — `{ level, component, msg, ...fields }` for the
  file/ring sinks. *(AR-6)*
- [ ] **Capabilities-summary debug dump** — `dumpCaps()` over RD-02's reason trace, without
  secrets. *(AR-6)*

### Won't Have (Out of Scope)

- Auth / authorization, encryption, rate-limited network endpoints — N/A (offline rendering
  library; no server, network, accounts, or persistence).
- Telemetry / analytics — explicitly excluded (RD-08 AR-26).
- Any edit to the RD-02 `CapabilityProfile` (no new `rendering{}` group) or the RD-07 `Host` type
  surface (no `canRawMode`). The gate derives essentials from existing facts; the only RD-07
  addition is the **additive** `detectTty()` stream helper (no `Host`/`CapabilityProfile` type
  change), needed because `host.isTTY` is only populated after `start()` (PF-001). *(AR-2)*
- Wiring the logger into the RD-07 host pump — the logger is standalone. *(AR-5)*
- An `escape-to-visible` sanitizer mode — strip-only for now. *(AR-13)*
- A `runApp`/`createApp` run-loop owner — the app owns its loop. *(AR-1)*

## Technical Requirements

### Essentials evaluation (per RD-08 §Essentials evaluation, resolved by AR-2)

```
evaluateEssentials(caps, facts) -> { met, missing[], degradations[] }
  // `facts: { isTTY }` — resolved by detectTty() before start() (PF-001); any HostFacts works.

essentialsMet =
     facts.isTTY               // interactive TTY  (also covers raw-mode: setRawMode is isTTY-guarded)
  // colorDepth is NOT gated: ColorDepth is a non-null union, so a "present" check is unreachable
  // dead code (PF-007). Mono counts; cursor addressing + screen clear are universal on any
  // VT/ANSI TTY, hence implied once isTTY holds.

degradations (non-essential, never stop):
  !caps.mouse.sgr   -> { cap: 'mouse',     mode: 'keyboard-only' }
  colorDepth==='mono' -> { cap: 'color',   mode: 'monochrome' }
  !caps.altScreen   -> { cap: 'altScreen', mode: 'inline' }
```

### Sanitizer rule (unchanged from the relocated impl; RD-08 §Sanitizer rule)

| Input byte/range | Action |
|------------------|--------|
| `ESC` (0x1b), and the two-byte `ESC \` (ST) | strip |
| `BEL` (0x07), single-byte `ST` (0x9c) | strip |
| C0 (0x00–0x1f) except tab (0x09) / newline (0x0a) | strip |
| C1 (0x80–0x9f) | strip |
| valid printable / UTF-8 (incl. astral code points) | pass |

### Logging sinks & config (AR-10)

| Sink | When | Notes |
|------|------|-------|
| file | `BLENDTUI_LOG=<path>` set | append; refused (→ `LoggerConfigError`) if it resolves to the UI stream |
| stderr | enabled, no `BLENDTUI_LOG`, and `stderr ≠ UI` stream | refused if it is the UI stream |
| in-memory ring | always constructable via the API (default 1024 entries) | bounded; `entries()` accessor for tests |

`BLENDTUI_DEBUG` unset → logger disabled (no-op; zero bytes). `BLENDTUI_DEBUG=1` → enabled at
level `debug`. Levels: `error | warn | info | debug`.

### Security

- `sanitize()` is the core input-validation control: all untrusted text is stripped of
  control/escape bytes before reaching the terminal (ANSI/OSC injection prevention).
- Keystrokes/paste may contain credentials → never logged; `redactEvent()` enforces this.
- Paste-size cap (1 MiB, RD-06) + bounded decoder buffers guard against flood/DoS.
- No auth/encryption/rate-limited endpoints — N/A (offline library).

### Compatibility

- ESM-only, zero runtime dependencies (Node built-ins only); NodeNext `.js` import specifiers.
- No changes to the RD-02 or RD-07 public type contracts; the public `sanitize` export from
  `@blendsdk/tui` stays identical after relocation.

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
| -------- | ------------------ | ------ | --------- | ------ |
| Run-loop error model | Standalone gate / runApp loop owner | Standalone gate + typed errors; reuse host crash path | Matches foundation altitude; host already restores before exit | AR-1 |
| Gate inputs | Add caps/host fields / derive via `detectTty()` | TTY facts from `detectTty()` (shares host detection); `colorDepth` not gated; cursor/clear implied | No RD-02/RD-07 *type* edits; additive `detectTty` helper (host.isTTY is post-start only, PF-001) | AR-2 |
| Sanitizer home | Relocate to safety/ / keep in render/ | Relocate to `safety/sanitize.ts` | Security primitive belongs in the security subsystem | AR-3 |
| Module layout | One safety/ dir / separate dirs | One `src/engine/safety/` | Matches per-subsystem dir pattern; one re-export block | AR-4 |
| Log wiring | Standalone / wire into host | Standalone `createLogger`+`redactEvent` | No edit to Implemented RD-07 host | AR-5 |
| Should-Haves | Include / defer | Include both | Cheap; completes the RD | AR-6 |
| Error types | Base+Essentials+LoggerConfig / minimal | `TuiError`+`EssentialsNotMetError`+`LoggerConfigError` | AC-7 needs an observable refusal | AR-7 |
| Degradation | Structured report+logger / stderr-only | Structured report; notices logged once | App-renderable + screen-safe | AR-8 |
| Key redaction | Named+placeholder / never emit key | Named by name; printable → placeholder | Useful + leak-free | AR-9 |
| Log config | DEBUG+file/stderr / ring-default | DEBUG gates; file else stderr-if-safe; ring 1024 | Visible by default when enabled; off-screen | AR-10 |
| Paste cap | Tests only / re-assert constant | Tests + docs only | Already enforced in RD-06; avoid drift | AR-11 |
| Redact file | redact.ts / inside logger.ts | `safety/redact.ts` | Single responsibility; size | AR-12 |
| Sanitize behavior | Strip-only / +escape mode | Strip-only, identical signature | Pure behavior-preserving move | AR-13 |
| Logger API | createLogger factory / class | `createLogger()` factory | Mirrors `createHost` | AR-14 |

> **Traceability:** Every scope decision references the Ambiguity Register entry (AR #) that
> resolved it. See `00-ambiguity-register.md`.

## Acceptance Criteria

(Mirrors RD-08 §Acceptance Criteria; ST-cases in `07-testing-strategy.md` verify each.)

1. [ ] When `detectTty()` reports a non-interactive terminal (`isTTY === false`), the gate throws
   `EssentialsNotMetError` (message names "interactive TTY") **before** `start()` — so no modes are
   entered and the terminal is left untouched (no restore required on this path) — and (in app
   context) the process exits non-zero. The SDK does not draw. *(Restore-before-exit for a throw
   AFTER start() is AC-6.)*
2. [ ] On a profile with no mouse capability, the SDK **starts successfully** in keyboard-only
   mode and emits a one-time screen-safe notice — it does not stop (Option A degradation).
3. [ ] `sanitize("a\x1b]0;x\x07b")` returns a string containing neither `\x1b` nor `\x07`; a
   plain string with UTF-8 and `\n`/`\t` passes unchanged.
4. [ ] With debug logging enabled, a key press writes a log entry of the event *type* but never
   the raw byte/character of a printable key, and a paste logs only its length.
5. [ ] With logging disabled (default), zero bytes are written to any log sink and zero bytes to
   stderr during a normal run.
6. [ ] An error thrown from the app's draw loop propagates only **after** the terminal is
   restored (capture shows leave-mode sequences precede process exit).
7. [ ] Boundary: a paste of cap+1 bytes is delivered truncated to the cap with `truncated:true`;
   a log sink resolving to the UI stream is refused (`LoggerConfigError`).
8. [ ] Security verified: sanitizer tests cover ESC/BEL/ST/C0/C1; the essentials gate is tested
   for each missing essential; no-secret-logging is asserted; the paste-cap DoS test passes.
   (Auth/encryption/rate-limited endpoints are N/A — offline library.)
