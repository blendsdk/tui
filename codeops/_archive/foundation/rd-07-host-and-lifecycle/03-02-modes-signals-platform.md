# Modes, Signals & Platform: RD-07 Host & Lifecycle

> **Document**: 03-02-modes-signals-platform.md
> **Parent**: [Index](00-index.md)
> **Files**: `src/engine/host/modes.ts`, `src/engine/host/signals.ts`, `src/engine/host/platform.ts`

## Overview

The cross-platform heart of the host: the exact enter/leave escape sequences gated by `caps`
(`modes.ts`), the signal install/teardown + suspend/resume + resize coalescing (`signals.ts`), and
the per-OS runtime adapter that maps abstract `HostSignal`s onto POSIX signals or Windows
equivalents and enables VT processing (`platform.ts`).

## `modes.ts` — enter/leave sequence builders

Pure string builders driven by `caps` (no I/O). They reuse RD-04's `CSI`/cursor vocabulary where
possible and emit the private-mode `?…h`/`?…l` pairs. **[RD-07 Must]**

```ts
/** Build the enter-TUI-mode byte string, gating each mode on caps; `opts.focus` toggles ?1004h (default on). [PF-006] */
export function enterMode(caps: CapabilityProfile, opts?: { focus?: boolean }): string;
/** Build the exact inverse leave-TUI-mode string (modes off, screen/cursor/wrap restored). [PF-006] */
export function leaveMode(caps: CapabilityProfile, opts?: { focus?: boolean }): string;
```

### Sequence table (order matters — leave is the strict inverse)

| Step | Mode | Enter | Leave | Gate |
|------|------|-------|-------|------|
| 1 | Alternate screen | `CSI ?1049h` | `CSI ?1049l` | `caps.altScreen` |
| 2 | Cursor visibility | `CSI ?25l` (hide) | `CSI ?25h` (show) | always |
| 3 | Line wrap | `CSI ?7l` (off) | `CSI ?7h` (on) | always |
| 4 | Mouse SGR ext | `CSI ?1006h` | `CSI ?1006l` | `caps.mouse.sgr` |
| 5 | Mouse basic tracking | `CSI ?1000h` | `CSI ?1000l` | `caps.mouse.sgr` |
| 6 | Mouse button-event (drag) | `CSI ?1002h` | `CSI ?1002l` | `caps.mouse.sgr && caps.mouse.drag` |
| 7 | Bracketed paste | `CSI ?2004h` | `CSI ?2004l` | `caps.bracketedPaste` |
| 8 | Focus reporting | `CSI ?1004h` | `CSI ?1004l` | host policy — `opts.focus !== false` (default on) |
| 9 | Keyboard protocol | Kitty `CSI >…u` / modifyOtherKeys `CSI >4;…m` | pop / `CSI >4;0m` | `caps.keyboard.kittyFlags`/`.modifyOtherKeys` |

> **Mouse notes (PF-003):** Any-event tracking (`?1003h`) is **deliberately not enabled** — it reports
> all pointer motion (an input flood) and no capability models it; a future `HostOptions` opt-in can
> add it. **Wheel needs no enable sequence**: wheel reports ride the `?1000h`/`?1006h` SGR channel
> (RD-06 decodes them via `WheelEvent`), so `caps.mouse.wheel` gates no bytes.
> **Focus (PF-006):** no capability models focus, so `?1004h` is host policy via `HostOptions.focus`
> (default on), threaded in as `opts.focus`; every other mode stays caps-gated.

`leaveMode` emits the disable sequences in reverse order so the terminal unwinds exactly as it was
set up (AC-1). Re-assert on resume (`SIGCONT`) reuses `enterMode(caps, opts)`. **[AR-10]**

## `signals.ts` — handler install/teardown, resize, suspend/resume

Pure orchestration over the injected `RuntimeAdapter` (`adapter.on(...)` returns an unsubscribe).
Returns a teardown that removes every handler — `stop()` calls it. **[AR-8]**

```ts
/** Install resize/signal/suspend handlers; returns a teardown that removes them all. */
export function installSignals(ctx: SignalContext): () => void;
```

`SignalContext` carries the adapter, the bound output (for size + writes), the one idempotent
`restore`, the user callbacks, and the `exitOnSignal`/`onBeforeExit` policy.

- **resize** (`adapter.on('resize')`): pending-flag + `adapter.scheduleImmediate`; the immediate
  reads `output.columns`/`output.rows` once and fires `onResize({type:'resize',columns,rows})`,
  then clears the flag. Collapses a SIGWINCH burst to one event (AC-3). **[AR-9]**
- **interrupt/terminate/hangup** (`'interrupt'|'terminate'|'hangup'`): `restore()` →
  `onBeforeExit?.(code)` → if `exitOnSignal` `adapter.exit(code)` (130/143/129). **[AR-6]**
- **suspend** (`'suspend'`, POSIX): `onSuspend?.()` → `restore()` → `adapter.suspendSelf()` to stop
  the process (SIGSTOP is uncatchable, so it suspends without re-entering the SIGTSTP handler).
  **[AR-10, PF-001]**
- **continue** (`'continue'`, POSIX): re-`setRawMode(true)` + write `enterMode(caps, opts)` →
  full repaint `serialize(lastBuffer, null, {caps})` → `onResume?.()`. **[AR-10]**

> On Windows the adapter simply never emits `suspend`/`continue` (documented unsupported, AR-4); the
> same `signals.ts` code runs unchanged.

## `platform.ts` — the real RuntimeAdapter + per-OS specifics

```ts
/**
 * The production RuntimeAdapter over node:tty / node:process / node:os, bound to the host's output
 * stream so win32 `resize`/`hangup` can attach to it (PF-010). [AR-13]
 */
export function realRuntime(output: NodeJS.WriteStream): RuntimeAdapter;

/** Where an abstract HostSignal is sourced on a given platform. `null` = not wired here. [AR-4, PF-005] */
export function hostSignalSource(
  platform: NodeJS.Platform,
  signal: HostSignal,
): { emitter: 'process' | 'output'; name: string } | null;
```

`hostSignalSource` is a **pure** mapping (no I/O) so both platform maps are unit-testable on any OS by
passing a fake `process.platform` (PF-005). The real adapter's `on(signal, handler)` consumes the
descriptor and attaches `process`-sourced signals to `process` and `output`-sourced ones to the bound
`output` (captured at `realRuntime(output)` construction, PF-010):

| HostSignal | POSIX (linux/darwin) | Windows (win32) |
|-----------|----------------------|-----------------|
| `resize` | `{process,'SIGWINCH'}` | `{output,'resize'}` |
| `interrupt` | `{process,'SIGINT'}` | `{process,'SIGINT'}` |
| `terminate` | `{process,'SIGTERM'}` | `{process,'SIGBREAK'}` |
| `hangup` | `{process,'SIGHUP'}` | `{output,'close'}` |
| `suspend`/`continue` | `{process,'SIGTSTP'}` / `{process,'SIGCONT'}` | `null` *(never emitted — unsupported)* |

> Uncaught-exception / unhandled-rejection are **not** `HostSignal`s (they carry payloads, PF-002);
> the real adapter wires them via `process.on('uncaughtException', (err) => handler(err))` /
> `process.on('unhandledRejection', (reason) => handler(reason))` in `onUncaughtException` /
> `onUnhandledRejection`.

- `setRawMode` → `stream.setRawMode(on)` (guarded; only called when `isTTY`). **[AR-11]**
- `suspendSelf` → `process.kill(process.pid, 'SIGSTOP')` (POSIX); on win32 it is an unreachable no-op
  since `'suspend'` is never emitted. **[AR-10, PF-001]**
- **Windows VT**: on `win32`, ensure `ENABLE_VIRTUAL_TERMINAL_PROCESSING` — Node 18+ enables VT
  automatically when `output.isTTY` on Win10+/ConPTY; the adapter verifies via an **injectable
  VT-availability predicate** (so the warn-once branch is unit-testable on any OS, PF-005) and, if VT
  is unavailable (legacy `conhost`), calls `warn(...)` once. Actual VT *enablement* is
  deferred-to-Windows-runner (AR-4). **[AR-4, PF-005]**
- `exit` → `process.exit(code)`; `writeError` → `process.stderr.write`; `writeSync` →
  `fs.writeSync(fd, data)`; `onProcessExit` → `process.on('exit', handler)`; `scheduleImmediate` →
  `setImmediate`; `setTimer`/`clearTimer` → `setTimeout`/`clearTimeout`. **[AR-13, AR-17, PF-002, PF-004]**

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|-----------|-------------------|--------|
| Mode unsupported by caps | Sequence omitted entirely (never emitted) | RD-07 Must |
| SIGWINCH burst | Coalesced via pending-flag + setImmediate | AR-9 |
| Suspend on Windows | Adapter never emits `suspend`/`continue` | AR-4, AR-10 |
| Legacy conhost without VT | `warn()` once; continue best-effort | AR-4 |
| Re-asserting modes on resume | Reuse `enterMode(caps, opts)` + forced full repaint | AR-10 |

> **Traceability:** every decision references `00-ambiguity-register.md`.

## Testing Requirements
- `modes.ts`: exact enter/leave strings for representative caps (full, mono, no-mouse, drag-off,
  no-paste); leave is the strict inverse of enter (ST-1, ST-2); `focus:false` omits `?1004h`/`?1004l`
  (PF-006); drag-off (`mouse.sgr:true, drag:false`) omits `?1002h`, no `?1003h` ever emitted (PF-003).
- `signals.ts`: resize coalescing fires once per burst (ST-4); suspend restores then calls
  `suspendSelf()` (PF-001); continue re-asserts + repaints (ST-5); interrupt/terminate/hangup restore +
  exit codes via fake adapter (ST-3).
- `platform.ts` (`host-platform.impl.test.ts`, PF-005): pure `hostSignalSource(platform, signal)` map
  for POSIX and win32 (incl. `suspend/continue → null` on win32); win32 `resize`/`hangup` attach to the
  **provided output** stream (PF-010); VT-warn-once via the injectable VT predicate.
