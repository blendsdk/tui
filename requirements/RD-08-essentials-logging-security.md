# RD-08: Essentials Gate, Logging, Errors & Security

> **Document**: RD-08-essentials-logging-security.md
> **Status**: Draft
> **Created**: 2026-06-27
> **Project**: @blendsdk/tui (Foundation)
> **Depends On**: RD-02, RD-07
> **CodeOps Skills Version**: 2.0.0

---

## Feature Overview

The cross-cutting safety layer: the **runtime essentials gate** (refuse to start on a
terminal that cannot support the essentials), **screen-safe diagnostic logging** (a TUI
library cannot log to stdout — it owns the screen), the **developer error model** (typed
errors + guaranteed terminal restore on any throw), and the **input/output sanitizer**
(the project's primary security boundary). This RD encodes the runtime half of the
two-mode behavior: the *spike* (RD-03) never stops, but the *SDK at runtime* stops if
essentials are unmet.

---

## Functional Requirements

### Must Have
- [ ] **Essentials gate** (Option A): the SDK starts only if the `CapabilityProfile` + host report an **interactive TTY with raw-mode keyboard input** and **basic addressable rendering** (cursor positioning + clear + at least monochrome). If unmet, the SDK **does not start**: it restores the terminal, throws/returns a typed `EssentialsNotMetError` with a clear message naming the missing capability, and exits non-zero (in app context).
- [ ] **Graceful degradation** for non-essentials: missing **mouse/scroll** → keyboard-only mode; missing **color** → monochrome; missing **alt-screen** → documented inline fallback — each with a one-time, screen-safe notice (never a hard stop).
- [ ] **Screen-safe logging**: a logger that writes to a file, `stderr` (only when not the UI stream), or an in-memory ring buffer — **never** to the UI output stream. Gated by an env flag (e.g. `BLENDTUI_DEBUG=1` and `BLENDTUI_LOG=<path>`). Default: disabled.
- [ ] **No secret logging**: raw keystrokes and paste contents are **never** logged at any default level; redaction is the default even when debug logging is on (event *types*, not contents).
- [ ] **Error model**: typed error classes; any error thrown through the SDK's run loop triggers guaranteed terminal restore (via RD-07) before propagating — the terminal is never left corrupted.
- [ ] **Sanitizer**: a single `sanitize(text)` used by every text-accepting output path (RD-04 `text`/`notify`/`setTitle`/`hyperlink`/`setClipboard`) that strips or escapes `ESC`(0x1b), `BEL`(0x07), `ST`, and C0/C1 control codes from untrusted content — preventing ANSI/OSC injection and terminal-escape attacks.
- [ ] **Paste size cap** enforcement (defined here, enforced in RD-06): default cap (e.g. 1 MB), configurable, with truncation flagged.

### Should Have
- [ ] A structured log format (level, component, message) for the file/ring sink.
- [ ] A "capabilities summary" debug dump (reusing RD-02's reason trace) — without secrets.

### Won't Have (Out of Scope)
- Auth/authorization, encryption, rate-limited network endpoints — **N/A**: this is an offline rendering library with no server, network, accounts, or persistence.
- Telemetry/analytics — explicitly excluded (AR-26).

---

## Technical Requirements

### Essentials evaluation
```
essentialsMet(caps, host) =
     host.isTTY && host.canRawMode
  && caps.rendering.cursorAddressing && caps.rendering.clear
  && (caps.colorDepth != null)   // mono counts
mouse/scroll/color>mono/altScreen are NON-essential -> degrade
```

### Sanitizer rule
| Input byte/range | Action |
|------------------|--------|
| `ESC` (0x1b) | strip (or escape to visible) |
| `BEL` (0x07), `ST` | strip |
| C0 (0x00–0x1f except tab/newline per context), C1 (0x80–0x9f) | strip |
| valid printable / UTF-8 | pass |

### Logging sinks
| Sink | When | Notes |
|------|------|-------|
| file | `BLENDTUI_LOG=path` | append; never the UI stream |
| stderr | only if stderr ≠ UI stream | |
| in-memory ring | always available for tests | bounded size |

---

## Integration Points

### With RD-02 / RD-07
- Reads the resolved caps + host TTY facts to evaluate the gate; uses the host's guaranteed-restore on gate failure and on errors.

### With RD-04 / RD-06
- Provides the `sanitize()` used by all output text paths and the paste-cap value enforced by the decoder.

### With RD-09
- The essentials gate and sanitizer have dedicated security/acceptance tests.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Essentials set | A (kbd+render) / B (+mouse+scroll) | A | Runs over SSH/CI/minimal; TV apps are keyboard-operable | AR-8 |
| Runtime stop | degrade-only / stop on unmet essentials | Stop on unmet essentials | "Refuse to run broken" | AR-7 |
| Logging sink | stdout / screen-safe sinks | File/stderr/ring, never UI stream | Library owns the screen | AR-16 |
| Keystroke logs | allow / never | Never (redacted by default) | Keystrokes may be secrets | AR-16 |
| Injection | trust input / sanitize at boundary | Mandatory sanitizer | Primary security boundary | AR-15 |

---

## Security Considerations

- **Data sensitivity**: keystrokes/paste may contain credentials → never logged; clipboard/notification text is app-owned → not logged.
- **Input validation**: the `sanitize()` boundary is the project's core input-validation control — all untrusted text is stripped of control/escape bytes before it can reach the terminal.
- **Authentication & authorization**: N/A (offline library, no accounts).
- **Injection risks**: ANSI/OSC/escape injection via untrusted rendered text — **mitigated** by mandatory sanitization at every text-output path.
- **Encryption needs**: N/A (no data at rest/in transit).
- **Rate limiting**: paste-size cap + bounded decoder buffers guard against flood/DoS (RD-06).
- **Infrastructure**: N/A (library, no containers/servers).

---

## Acceptance Criteria

1. [ ] On a profile where `host.isTTY === false`, starting the SDK throws `EssentialsNotMetError` whose message names "interactive TTY", restores the terminal, and (in app context) exits non-zero — the SDK does not draw.
2. [ ] On a profile with no mouse capability, the SDK **starts successfully** in keyboard-only mode and emits a one-time screen-safe notice — it does **not** stop (proves Option A degradation).
3. [ ] `sanitize("a\x1b]0;x\x07b")` returns a string containing neither `\x1b` nor `\x07` (the OSC injection is neutralized); a plain string with UTF-8 and `\n`/`\t` passes unchanged.
4. [ ] With debug logging enabled, pressing a key writes a log entry of the event *type* but **never** the raw byte/character of a printable key, and a paste logs only its length (proves no-secret-logging).
5. [ ] With logging disabled (default), zero bytes are written to any log sink and zero bytes to stderr during a normal run.
6. [ ] An error thrown from the app's draw callback propagates only **after** the terminal is restored (PTY capture shows leave-mode sequences precede process exit).
7. [ ] Boundary: a paste of cap+1 bytes is delivered truncated to the cap with `truncated:true`; logging to a file path that is the UI stream is refused (cannot self-corrupt the screen).
8. [ ] Security requirements verified: sanitizer unit tests cover `ESC`/`BEL`/`ST`/C0/C1; essentials gate tested for each missing-essential; no-secret-logging asserted; paste-cap DoS test passes. (Auth/encryption/rate-limited-endpoints are N/A — offline library.)
