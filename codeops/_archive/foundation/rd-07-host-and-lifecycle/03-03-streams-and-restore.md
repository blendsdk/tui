# Streams & Restore: RD-07 Host & Lifecycle

> **Document**: 03-03-streams-and-restore.md
> **Parent**: [Index](00-index.md)
> **Files**: `src/engine/host/streams.ts`, `src/engine/host/restore.ts`

## Overview

Stream binding + TTY detection + optional `/dev/tty` (`streams.ts`), and the idempotent
guaranteed/panic restore primitive wired to every exit path including the synchronous
`process.on('exit')` backstop and EPIPE (`restore.ts`).

## `streams.ts` — bind input/output, detect TTY, /dev/tty

```ts
/** Resolve the bound streams + TTY state from options. [AR-11, AR-13] */
export function bindStreams(options: HostOptions): BoundStreams;

export interface BoundStreams {
  readonly input: NodeJS.ReadStream;
  readonly output: NodeJS.WriteStream;
  readonly isTTY: boolean;        // true only when BOTH ends are TTYs (or /dev/tty bound)
  /** Close any stream this module opened (e.g. /dev/tty fds); no-op for injected/std streams. */
  dispose(): void;
}
```

- Defaults: `input = options.input ?? process.stdin`, `output = options.output ?? process.stdout`.
- `isTTY = Boolean(input.isTTY && output.isTTY)`. **[AR-11]**
- **/dev/tty** (POSIX, `preferDevTty !== false`): when stdout is piped (`!process.stdout.isTTY`) but
  a controlling terminal exists, open `/dev/tty` for read+write and bind to it so a piped app can
  still drive the terminal. Opened fds are tracked and closed by `dispose()`. On failure or
  Windows, fall back to the std streams (degrade, don't throw). **[AR-13, RD-07 Must]**
- Injected streams are used verbatim and never closed by `dispose()` (the test owns them). **[AR-13]**

## `restore.ts` — idempotent guaranteed/panic restore

```ts
/** Build an idempotent restore closure + install the panic backstop. [AR-17] */
export function createRestore(ctx: RestoreContext): GuaranteedRestore;

export interface GuaranteedRestore {
  /**
   * Restore the terminal exactly once (cooked, leave-mode, cursor shown). Safe to call repeatedly.
   * `sync` selects the write channel: `false` (default) uses async `output.write` (loop running);
   * `true` uses `adapter.writeSync(output.fd, …)` for the draining `'exit'` backstop. [AR-17, PF-004]
   */
  run(sync?: boolean): void;
  /** Remove the process-level backstop handlers (called by stop()). */
  teardown(): void;
}
```

`RestoreContext` carries the adapter, the bound `output`, the `input`, and the `caps`. `leaveStr`
(= `leaveMode(caps, opts)`) is precomputed at `createRestore()` so the `'exit'` path allocates nothing.

### Behavior

- **Idempotent**: one `done` guard ensures the body runs at most once even if a signal handler and
  the `'exit'` backstop both fire (whichever fires first wins). **[AR-17]**
- **run(sync = false)** sets the guard, then writes `leaveStr` + `setRawMode(input,false)`:
  - normal/signal/EPIPE path (`sync=false`): async `output.write(leaveStr)` — the event loop is
    still running, so it flushes.
  - `'exit'` backstop (`sync=true`): `adapter.writeSync(output.fd ?? 1, leaveStr)` — **uniformly
    synchronous on every platform** (PF-004), the last-resort path that catches a crash during setup
    before `stop()` could run. `setRawMode(input,false)` is itself a synchronous ioctl. **[AR-17, PF-004]**
- **panic backstop**: `createRestore` registers `adapter.onProcessExit(() => run(true))` (real:
  `process.on('exit')`) immediately; the orchestrator additionally routes `run()` into `handleFatal`
  (uncaughtException/unhandledRejection → restore + `writeError` + `exit(1)`, PF-002/PF-008). **[AR-6, AR-17]**
- **best-effort**: every write inside `run()` is wrapped so a secondary failure (e.g. the output is
  already gone on an EPIPE) is swallowed — restore must never throw. **[AR-16]**

### EPIPE path (orchestrated in host.ts, served by restore + streams)

```ts
output.on('error', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') {
    restore.run();              // best-effort, swallows secondary errors
    onBeforeExit?.(0);
    adapter.exit(0);           // clean shutdown — a disconnect is an expected end
  } else {
    handleFatal(err);          // shared crash path — no throw inside the listener [PF-008]
  }
});
```
Non-EPIPE errors go through the same `handleFatal` as `onUncaughtException` (restore + `writeError` +
`exit(1)`), so there is no `throw` inside the listener and the path is directly testable. **[AR-16, PF-008]**

## Exit-code matrix (host-owned paths) — [AR-6]

| Trigger | Restore? | onBeforeExit | exit code |
|---------|----------|--------------|-----------|
| `stop()` (normal) | yes (via leave-mode) | — | none (no exit) |
| SIGINT | yes | `onBeforeExit(130)` | 130 |
| SIGTERM | yes | `onBeforeExit(143)` | 143 |
| SIGHUP | yes | `onBeforeExit(129)` | 129 |
| uncaughtException / unhandledRejection | yes + `writeError` to stderr | `onBeforeExit(1)` | 1 |
| EPIPE | yes (best-effort) | `onBeforeExit(0)` | 0 |
| non-EPIPE output error | yes (via `handleFatal`) + `writeError` | `onBeforeExit(1)` | 1 |
| `exitOnSignal:false` | yes | `onBeforeExit(code)` | none (app decides) |

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|-----------|-------------------|--------|
| Restore called twice | `done` guard — body runs once | AR-17 |
| Output gone during restore | Each write wrapped; failures swallowed | AR-16 |
| Crash during setup | Sync `process.on('exit')` backstop → `run(true)` → `writeSync` | AR-17, PF-004 |
| /dev/tty open fails | Fall back to std streams; no throw | AR-13 |
| Non-EPIPE output error | Routed to shared `handleFatal` (no throw in listener) | AR-16, PF-008 |

> **Traceability:** every decision references `00-ambiguity-register.md`.

## Testing Requirements
- `streams.ts`: isTTY computed from both ends; injected streams used verbatim + not closed;
  non-TTY reported (ST-6); /dev/tty fallback on failure.
- `restore.ts`: idempotency (run twice → one effect, ST-11); leave-mode bytes written; `'exit'`
  backstop fires `run(true)` → `writeSync` exactly once (PF-004); EPIPE → best-effort restore + exit 0
  without unhandled rejection (ST-8); non-EPIPE output error → `handleFatal` (restore + exit 1), no
  throw in the listener (PF-008); restore runs even when setup throws midway (ST-11 panic).
- Security: no raw input written to any log channel at default level (ST-9); raw mode never on
  non-TTY (ST-10).
