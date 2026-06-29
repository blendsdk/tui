# Requirements: RD-07 Host & Lifecycle

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-07](../../requirements/RD-07-host-and-lifecycle.md)

## Feature Overview

The native layer that owns the terminal and runs the application loop. It enters/leaves TUI mode
(alternate screen, hidden cursor, no-wrap, mouse, bracketed paste, focus, keyboard protocol — all
gated on `caps`), puts stdin in raw mode, installs signal + process handlers, pumps stdin bytes
through RD-06's `decode()`, hands RD-04's `serialize()` output to the bound output stream, and
guarantees the terminal is restored on every exit path. It abstracts the per-platform differences
(POSIX signals vs. Windows VT/`'resize'`/`SIGBREAK`) behind one injectable runtime adapter.

## Functional Requirements

### Must Have
- [ ] `createHost(options): Host` factory returning a stateful host object. **[AR-1]**
- [ ] Typed event delivery via callbacks: `onInput(InputEvent)`, `onResize(ResizeEvent)`, `onSuspend()`, `onResume()`. **[AR-2]**
- [ ] `host.render(buffer)` holds the previous frame, calls `serialize(next, prev, {caps})`, performs one coalesced write, and stores `next` as prev. **[AR-3]**
- [ ] Enter TUI mode on `start()`: alt-screen (`?1049h`), hide cursor (`?25l`), disable wrap (`?7l`), enable mouse (SGR `?1006h` + `?1000h`, plus `?1002h` when `caps.mouse.drag`), bracketed paste (`?2004h`), keyboard protocol — all driven by `caps`; **focus (`?1004h`) is host policy** (no capability models focus), enabled by default and controllable via `HostOptions.focus`. Any-motion (`?1003h`) is not enabled by default; wheel rides the SGR channel (no separate enable). **[RD-07 Must, PF-003, PF-006]**
- [ ] Raw mode on input via the runtime adapter; guaranteed cooked-mode restore on exit. **[RD-07 Must]**
- [ ] Leave TUI mode on `stop()`: exact inverse sequences (mouse/paste/focus off, show cursor, wrap on, leave alt-screen) + raw mode off. **[RD-07 Must, AR-8]**
- [ ] Guaranteed cleanup on every exit path — normal `stop()`, `SIGINT`, `SIGTERM`, `SIGHUP`, uncaught exception, and a synchronous crash during setup. **[AR-6, AR-17]**
- [ ] Host owns `process.exit()` on signal/crash paths: SIGINT→130, SIGTERM→143, SIGHUP→129, uncaughtException→1, normal→0. `exitOnSignal` (default `true`) opts out; `onBeforeExit(code)` hook runs first. **[AR-6]**
- [ ] `ResizeEvent { type:'resize'; columns; rows }` delivered on terminal resize — `SIGWINCH` on POSIX, `stdout 'resize'` on Windows — coalesced to one event per burst via a pending-flag + `setImmediate`. **[AR-7, AR-9]**
- [ ] Suspend/resume (POSIX): on `SIGTSTP` fire `onSuspend()`, restore the terminal, re-raise `SIGSTOP`; on `SIGCONT` re-assert all modes, force a full repaint of the last buffer, fire `onResume()`. Windows: documented unsupported. **[AR-10]**
- [ ] Non-TTY handling: when stdin/stdout is not a TTY, `start()` does not call `setRawMode` or enter alt-screen and reports `isTTY:false`; `render()` still serializes + writes frames. **[AR-11]**
- [ ] Configurable I/O streams: `input`/`output` are injectable; when stdout is piped but a terminal exists, optionally bind to `/dev/tty`. **[AR-13, RD-07 Must]**
- [ ] Windows: enable `ENABLE_VIRTUAL_TERMINAL_PROCESSING`; target Win10+/Windows Terminal/ConPTY; detect+warn on legacy `conhost` without VT. **[AR-4]**
- [ ] Pump stdin `data` chunks through `decode()`, dispatch resulting events to `onInput`, route `queries` away from input; host owns the `ESC_TIMEOUT_MS` (50ms) `flush()` timer. **[AR-14]**

### Should Have
- [ ] Panic restore registered very early (synchronous `process.on('exit')` backstop) so even a crash during setup restores the terminal. **[AR-17]**
- [ ] Detect `stdout` write failure / `EPIPE` (SSH drop) → best-effort restore + clean shutdown (exit 0), no unhandled rejection. **[AR-16]**

### Won't Have (Out of Scope)
- Input *decoding* (RD-06) and frame *composition* (RD-04) — wired, not implemented.
- The essentials *policy* (which caps are required) — RD-08; the host provides facts only.
- Keymap/action naming — the app applies `createKeymap` to `onInput` events. **[AR-15]**
- A real PTY test dependency (`node-pty`) — testing uses the injectable adapter + a subprocess e2e. **[AR-13]**

## Technical Requirements

### Performance
- Resize/data bursts coalesced to avoid event-loop starvation (`setImmediate` for resize). **[AR-9]**
- `render()` performs exactly one `write()` per frame (serialize already returns one coalesced string). **[AR-3]**

### Compatibility
- Node ≥ 18 (active LTS 18/20/22), ESM-only, NodeNext `.js` specifiers, zero runtime dependencies.
- Cross-platform: `linux`/`darwin` fully implemented + tested; `win32` implemented, verification deferred-to-Windows-runner. **[AR-4]**

### Security
- Routes keystrokes/paste (possible secrets) stream→decoder; the host never logs raw input at default level. **[RD-07 Security, AR-13]**
- Host writes only engine-produced (already-sanitized) bytes; it never interpolates untrusted strings into control sequences. **[RD-07 Security]**
- On non-TTY it must not attempt raw mode (which would throw) — detect and degrade. **[AR-11]**
- The host bounds its own read buffering; decode bounds the rest (RD-06). **[RD-07 Security]**

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Public API | factory / class | `createHost()` factory | Consistent with `create*` engine factories | AR-1 |
| Event delivery | callbacks / EventEmitter | Typed callbacks | Type-safe discriminated unions; testable | AR-2 |
| Draw API | `render(buffer)` / `write(string)` | `render(buffer)` owns prev+serialize+write | App never touches serialize/streams | AR-3 |
| Windows | now+defer / later | Implement now, defer verification | Keep cross-platform design honest | AR-4 |
| Exit ownership | host owns / app decides | Host owns exit on signal/crash paths | Makes AC-2 guarantee hold | AR-6 |
| start/stop | async idempotent / sync exits | Async, idempotent, stop≠exit | Clean separation; async /dev/tty bind | AR-8 |
| Non-TTY render | write / no-op | Still writes | Degrade policy is RD-08's | AR-11 |
| Testing | inject+e2e / mock-only / node-pty | Injectable adapter + thin subprocess e2e | Proves AC-2/AC-8, no native dep | AR-13 |
| EPIPE | exit 0 / exit 1 | Best-effort restore, exit 0 | Disconnect is an expected end | AR-16 |

> **Traceability:** Every scope decision references the Ambiguity Register (`00-ambiguity-register.md`).

## Acceptance Criteria

1. [ ] After `start()`, captured output shows, in order, alt-screen-enter, hide-cursor, disable-wrap, and the mouse/paste/focus enable sequences appropriate to `caps`; after `stop()`, the exact inverse appears and raw mode is off. *(ST-1, ST-2)*
2. [ ] On `SIGINT`/`SIGTERM`/`SIGHUP` and an uncaught exception, the terminal is restored (capture shows leave-mode sequences) and the process exits with the right non-zero code on the error paths. *(ST-3, ST-12 — subprocess e2e)*
3. [ ] Resizing emits exactly one coalesced `ResizeEvent` with the new `{columns, rows}` on POSIX (SIGWINCH) and Windows (`stdout 'resize'`). *(ST-4)*
4. [ ] On POSIX, `SIGTSTP` restores the terminal before stop and `SIGCONT` re-asserts alt-screen+mouse+raw and triggers a full repaint. *(ST-5)*
5. [ ] When stdin is not a TTY, `start()` does not call `setRawMode` and reports `isTTY:false`. *(ST-6)*
6. [ ] Injected mock input/output streams drive a full start→draw→stop cycle headlessly with no real terminal. *(ST-7)*
7. [ ] An `EPIPE` on the output stream triggers best-effort restore and a clean shutdown without an unhandled rejection. *(ST-8)*
8. [ ] Security: no raw input is logged at default level; raw mode is never attempted on a non-TTY; restore runs even when setup throws midway (panic-restore test). *(ST-9, ST-10, ST-11)*
9. [ ] All tests pass (`npm run verify`); lint/check:deps clean; documentation updated.
