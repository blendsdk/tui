# RD-07: Host & Lifecycle

> **Document**: RD-07-host-and-lifecycle.md
> **Status**: Draft
> **Created**: 2026-06-27
> **Project**: @blendsdk/tui (Foundation)
> **Depends On**: RD-02, RD-04, RD-06
> **CodeOps Skills Version**: 2.0.0

---

## Feature Overview

The native layer that **owns the terminal**: raw mode, the alternate screen, mode setup
and teardown (mouse, bracketed paste, focus, keyboard protocol), signal handling,
stream binding, and — above all — **guaranteed restoration** of the terminal on every
exit path. It replaces the prototype's Ink dependency with a small native Node-`tty`
host, and abstracts the real per-platform differences (notably that Windows has no
`SIGWINCH`/`SIGTSTP`/`SIGCONT`). This is the layer that makes the SDK cross-platform.

---

## Functional Requirements

### Must Have
- [ ] Enter/leave TUI mode: alternate screen (`?1049`), hide cursor, disable wrap, enable mouse + bracketed paste + (capability-gated) keyboard protocol — all driven by `caps`.
- [ ] **Raw mode** on input + guaranteed cooked-mode restore on exit.
- [ ] **Guaranteed cleanup on every exit path**: normal exit, `SIGINT`, `SIGTERM`, **`SIGHUP`** (terminal closed), and uncaught exceptions — the terminal is always restored (cooked, main screen, cursor visible, mouse/paste/focus modes off).
- [ ] **Resize**: deliver `ResizeEvent` on terminal resize — via `SIGWINCH` on POSIX and the `stdout 'resize'` event on Windows (which has no `SIGWINCH`); coalesce bursts.
- [ ] **Suspend/resume (POSIX)**: on `SIGTSTP`/`SIGCONT`, restore the terminal before suspending and **re-assert** all modes + repaint on resume. On Windows (no equivalent) this is documented as unsupported.
- [ ] **Non-TTY handling**: if stdout/stdin is not a TTY (piped/CI), do not enter raw mode or alt-screen; expose this state so the SDK can degrade (RD-08 essentials gate).
- [ ] **Configurable I/O streams**: input/output streams are injectable (for tests); when stdout is piped but a terminal exists, optionally bind to `/dev/tty`.
- [ ] **Windows**: enable VT processing (`ENABLE_VIRTUAL_TERMINAL_PROCESSING`); target Windows 10+/Windows Terminal/ConPTY; detect and warn on legacy `conhost` without VT.
- [ ] Feed input `data` chunks to RD-06's `decode()` and dispatch the resulting events; hand RD-04's serialized frames to the bound output stream as a single coalesced write.

### Should Have
- [ ] An "panic restore" registered very early (process-level) so even a synchronous crash during setup restores the terminal.
- [ ] Detect `stdout` write failure / `EPIPE` (e.g. SSH drop) → best-effort restore + clean shutdown.

### Won't Have (Out of Scope)
- Input *decoding* (RD-06) and frame *composition* (RD-04) — the host wires them, it doesn't implement them.
- The essentials *policy* (which caps are required) — RD-08; the host provides the facts.

---

## Technical Requirements

### Lifecycle
```
start():  resolve caps (RD-02) -> bind streams -> raw mode on
          -> write enter-mode (alt-screen, hide cursor, no-wrap, mouse, paste, kbd)
          -> install signal + exit handlers
loop:     stdin 'data' -> decode -> dispatch;  app draws -> serialize -> write
stop()/signal/throw:  write leave-mode (mouse off, paste off, show cursor, wrap on,
                      main screen) -> raw mode off -> restore -> exit(code)
```

### Per-platform signal matrix
| Concern | POSIX (linux/darwin) | Windows |
|---------|----------------------|---------|
| Resize | `SIGWINCH` | `stdout 'resize'` |
| Suspend/resume | `SIGTSTP`/`SIGCONT` re-assert | unsupported (documented) |
| Terminal closed | `SIGHUP` | stream end / `'close'` |
| Interrupt/terminate | `SIGINT`/`SIGTERM` | `SIGINT`/`SIGBREAK` |
| ANSI enablement | inherent | enable VT mode |

---

## Integration Points

### With RD-02 / RD-04 / RD-06
- Reads `caps` to choose which modes to enable; pumps bytes into the decoder; writes frames from the renderer.

### With RD-08
- Provides `isTTY`, the resolved caps, and a guaranteed-restore primitive; RD-08's essentials gate and error model build on these.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Host | Ink / native `tty` | Native `tty`, Ink removed | Engine owns I/O; Ink was only plumbing | AR-3 |
| Cross-platform | POSIX-only / abstract per-OS | Per-platform abstraction | Windows lacks POSIX signals | AR-4 |
| Streams | hardcoded process std / injectable + `/dev/tty` | Injectable + `/dev/tty` | Testability + piped-stdout apps | AR-17 |
| Restore guarantee | best-effort / guaranteed on all paths | Guaranteed (incl. crash/SIGHUP) | Never leave a corrupted terminal | AR-18, AR-24 |

---

## Security Considerations

- **Data sensitivity**: routes keystrokes/paste (possibly secrets) from stream to decoder — must not persist or log them (enforced with RD-08).
- **Input validation**: stream data is handed to RD-06's bounded decoder; the host bounds its own read buffering.
- **Authentication & authorization**: n/a.
- **Injection risks**: the host only writes engine-produced bytes (already sanitized upstream); it does not interpolate untrusted strings into control sequences.
- **Encryption needs**: none.
- **Rate limiting**: resize/`data` bursts are coalesced to avoid event-loop starvation.
- **Infrastructure**: on non-TTY/CI it must not attempt raw mode (which would throw) — detect and degrade.

---

## Acceptance Criteria

1. [ ] After `start()`, a PTY capture shows, in order, alt-screen-enter, hide-cursor, disable-wrap, and the mouse/paste enable sequences appropriate to `caps`; after `stop()`, the exact inverse sequences appear and raw mode is off.
2. [ ] On `SIGINT`, `SIGTERM`, `SIGHUP`, and an uncaught exception, the terminal is restored (capture shows leave-mode sequences) and the process exits non-zero on the error paths (proves guaranteed cleanup on all exit paths).
3. [ ] Resizing the PTY emits exactly one coalesced `ResizeEvent` with the new `{columns, rows}` on POSIX (via `SIGWINCH`) and on Windows (via `stdout 'resize'`).
4. [ ] On POSIX, `SIGTSTP` restores the terminal before stop; `SIGCONT` re-asserts alt-screen + mouse + raw mode and triggers a full repaint (verified via capture).
5. [ ] When stdin is not a TTY, `start()` does not call `setRawMode` (which would throw) and reports `isTTY:false` so the SDK can degrade (proves non-TTY handling).
6. [ ] Injected mock input/output streams drive a full start→draw→stop cycle headlessly with no real terminal (proves configurable I/O streams).
7. [ ] Boundary: an `EPIPE` on the output stream (simulated SSH drop) triggers best-effort restore and a clean shutdown without an unhandled rejection.
8. [ ] Security requirements verified: no raw input is logged by the host at default level; raw mode is never attempted on a non-TTY; restore runs even when setup throws midway (panic-restore test).
