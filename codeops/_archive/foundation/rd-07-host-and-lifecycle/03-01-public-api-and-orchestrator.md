# Public API & Orchestrator: RD-07 Host & Lifecycle

> **Document**: 03-01-public-api-and-orchestrator.md
> **Parent**: [Index](00-index.md)
> **Files**: `src/engine/host/types.ts`, `src/engine/host/host.ts`

## Overview

Defines the host's public type surface (`Host`, `HostOptions`, `ResizeEvent`, `RuntimeAdapter`)
and the `createHost()` orchestrator that ties streams, modes, signals, the input pump, and
`render()` together. This is the single public entry point of the subsystem (AR-1).

## New Types/Interfaces — `host/types.ts`

```ts
import type { CapabilityProfile } from '../capability/profile.js';
import type { InputEvent } from '../input/events.js';

/** A terminal resize, delivered via SIGWINCH (POSIX) or stdout 'resize' (Windows). [AR-7] */
export interface ResizeEvent {
  readonly type: 'resize';
  readonly columns: number;
  readonly rows: number;
}

/** Options for {@link createHost}. Only `caps` is required. */
export interface HostOptions {
  readonly caps: CapabilityProfile;
  /** Injectable input stream; defaults to process.stdin (or /dev/tty when piped). [AR-13] */
  readonly input?: NodeJS.ReadStream;
  /** Injectable output stream; defaults to process.stdout (or /dev/tty when piped). [AR-13] */
  readonly output?: NodeJS.WriteStream;
  /** When true (default) and stdout is piped but a TTY exists, bind to /dev/tty. [AR-13] */
  readonly preferDevTty?: boolean;
  /** Raw decoded input events (queries are routed away). [AR-2] */
  readonly onInput?: (event: InputEvent) => void;
  /** Coalesced terminal resize. [AR-2, AR-9] */
  readonly onResize?: (event: ResizeEvent) => void;
  /** POSIX SIGTSTP, fired before the terminal is restored + suspended. [AR-10] */
  readonly onSuspend?: () => void;
  /** POSIX SIGCONT, fired after modes are re-asserted + full repaint. [AR-10] */
  readonly onResume?: () => void;
  /** Runs before the host calls process.exit on a signal/crash path. [AR-6] */
  readonly onBeforeExit?: (code: number) => void;
  /** When false, the host restores but does not call process.exit on signals. Default true. [AR-6] */
  readonly exitOnSignal?: boolean;
  /**
   * Enable focus reporting (`?1004h`). No capability models focus, so it is host
   * policy (not caps-gated). Default `true`. [PF-006]
   */
  readonly focus?: boolean;
  /** Injectable OS boundary; defaults to the real Node runtime. Tests inject a fake. [AR-13] */
  readonly runtime?: RuntimeAdapter;
}

/** The running host. Returned by {@link createHost}. [AR-1] */
export interface Host {
  /** True when the bound output (and input) is a real TTY. [AR-11] */
  readonly isTTY: boolean;
  /** Bind, raw mode, enter modes, install handlers. Idempotent. [AR-8] */
  start(): Promise<void>;
  /** Leave modes, restore cooked/main-screen/cursor, remove handlers. Idempotent; no exit. [AR-8] */
  stop(): Promise<void>;
  /** Diff against the previous frame, write one coalesced string, keep as new prev. [AR-3] */
  render(buffer: ScreenBuffer): void;
}

/**
 * The injectable OS boundary. The real implementation (platform.ts) wraps node:tty / node:process
 * and is constructed bound to the host's output stream (so win32 `resize`/`hangup` can attach to it,
 * PF-010); tests inject a fake that records exit codes, captures writes, and drives signals/timers. [AR-13]
 */
export interface RuntimeAdapter {
  readonly platform: 'linux' | 'darwin' | 'win32';
  setRawMode(stream: NodeJS.ReadStream, on: boolean): void;
  /** Subscribe to a payload-free signal/resize source; returns an unsubscribe fn. [AR-9, AR-10, AR-17] */
  on(event: HostSignal, handler: () => void): () => void;
  /** Subscribe to an uncaught exception; handler receives the thrown value. [AR-6, AR-17, PF-002] */
  onUncaughtException(handler: (err: unknown) => void): () => void;
  /** Subscribe to an unhandled promise rejection; handler receives the reason. [AR-6, AR-17, PF-002] */
  onUnhandledRejection(handler: (reason: unknown) => void): () => void;
  /** Stop the current process with default disposition (real: process.kill(pid,'SIGSTOP')). [AR-10, PF-001] */
  suspendSelf(): void;
  /** Schedule a coalescing callback (real: setImmediate). [AR-9] */
  scheduleImmediate(fn: () => void): void;
  /** Arm/clear the ESC disambiguation timer (real: setTimeout). [AR-14] */
  setTimer(fn: () => void, ms: number): TimerHandle;
  clearTimer(handle: TimerHandle): void;
  /** Register the synchronous exit backstop (real: process.on('exit')). [AR-17] */
  onProcessExit(handler: () => void): void;
  /**
   * Synchronously write to a file descriptor (real: fs.writeSync). Used only by the
   * process-'exit' restore backstop, where the event loop is draining and async writes
   * would not flush; uniformly synchronous on every platform. Fakes record the data. [AR-16, AR-17, PF-004]
   */
  writeSync(fd: number, data: string): void;
  /** Terminate the process (real: process.exit). Fakes record the code. [AR-6, AR-13] */
  exit(code: number): never;
  /** Write a diagnostic line to stderr (real: process.stderr.write). Never receives raw input. [AR-6, PF-002] */
  writeError(message: string): void;
  /** Best-effort warning channel (legacy conhost without VT, etc.). Never logs input. [AR-4] */
  warn(message: string): void;
}

/**
 * Abstract, payload-free signal set; the adapter maps POSIX/Windows specifics internally
 * (`hostSignalSource`, PF-005). Uncaught-exception / unhandled-rejection carry payloads, so they
 * are NOT in this union — they have dedicated subscriptions (`onUncaughtException` /
 * `onUnhandledRejection`, PF-002).
 */
export type HostSignal =
  | 'resize' | 'interrupt' | 'terminate' | 'hangup'
  | 'suspend' | 'continue';

export type TimerHandle = unknown;
```

> `ScreenBuffer` is imported `import type { ScreenBuffer } from '../render/buffer.js';`.
> `HostSignal` is an abstract name set so the adapter maps POSIX/Windows specifics internally
> (`interrupt`→SIGINT, `terminate`→SIGTERM/SIGBREAK, etc.) — keeping `host.ts` platform-agnostic. **[AR-4]**

## New Functions — `host/host.ts`

```ts
/**
 * Create a terminal host. Wires caps→modes, stdin→decode→dispatch, and buffer→serialize→write,
 * and guarantees terminal restore on every exit path. [AR-1]
 *
 * @param options - host configuration; only `caps` is required.
 * @returns a {@link Host}; call `start()` to take over the terminal.
 */
export function createHost(options: HostOptions): Host;
```

### Orchestration responsibilities

`createHost` returns a `Host` whose `start()` builds the running state: the bound streams
(`streams.ts`), the resolved `RuntimeAdapter`, a `DecoderState`, the previous `ScreenBuffer | null`,
the last rendered buffer (for resume repaint), an idempotent restore (`restore.ts`), and the set of
installed unsubscribe handles. The adapter is resolved **inside `start()` after `bindStreams()`** —
`adapter = options.runtime ?? realRuntime(streams.output)` — so the real adapter is bound to the
output stream it needs for win32 `resize`/`hangup`; an injected fake is used verbatim. **[PF-010]**

- **start()** *(idempotent — second call is a no-op while running, AR-8)*: bind streams + detect
  `isTTY` (`streams.ts`); **resolve the adapter** (`options.runtime ?? realRuntime(streams.output)`,
  PF-010); **create restore + register the `onProcessExit` panic backstop first** (so a crash mid-setup
  still restores, AR-17); if TTY, `setRawMode(input, true)` and write the enter-mode sequence
  (`modes.ts`, caps-gated; focus per `options.focus`, PF-006); install signals + resize +
  suspend/resume handlers (`signals.ts`); attach the stdin `data` listener (the input pump) and the
  output `'error'` (EPIPE) listener; register `onUncaughtException`/`onUnhandledRejection` → `handleFatal`.
  Non-TTY: skip raw mode + enter-mode but still bind output. **[AR-11, AR-17, PF-006, PF-010]**
- **input pump**: on `data(chunk)` → `{events, queries, state} = decode(toU8(chunk), decoderState, {caps})`;
  store `state`; deliver each event to `onInput`; **drop `queries`** from `onInput`; manage the ESC
  timer (AR-14): clear any armed timer; if `state.carry` is a lone ESC (`carry.length === 1 &&
  carry[0] === 0x1b`), arm `setTimer(() => dispatch(flush(state).events), ESC_TIMEOUT_MS)`. **[AR-14]**
- **render(next)**: `const out = serialize(next, prev, { caps }); if (out) write(out); prev = next;
  lastBuffer = next;` — one coalesced write; works in non-TTY too. **[AR-3, AR-11]**
- **stop()** *(idempotent, AR-8)*: clear the ESC timer; remove every installed handler/listener;
  write the leave-mode sequence; `setRawMode(input, false)`; mark not-running. Does **not** call
  `exit`. **[AR-8]**
- **resize**: adapter `'resize'` → pending-flag + `scheduleImmediate` → read `output.columns/rows`
  once → `onResize({type:'resize', columns, rows})`. **[AR-9]**
- **handleFatal(err)** *(shared crash path, PF-002/PF-008)*: `restore.run()` →
  `adapter.writeError(formatError(err))` → `onBeforeExit?.(1)` → `adapter.exit(1)`. Wired to
  `onUncaughtException`, `onUnhandledRejection`, and the **non-EPIPE** branch of the output `'error'`
  listener (no `throw` inside the listener). **[AR-6, AR-16, PF-002, PF-008]**
- **suspend/resume**, **signals/exit**, **EPIPE**, **panic restore**: delegated to `signals.ts` +
  `restore.ts` (see 03-02, 03-03) but orchestrated here so all share the one idempotent `restore`
  and the `onBeforeExit`/`exitOnSignal` policy. **[AR-6, AR-10, AR-16, AR-17]**

### Integration Points
- **RD-02**: reads `options.caps` to gate every mode (`modes.ts`).
- **RD-06**: `createDecoderState`/`decode`/`flush`/`ESC_TIMEOUT_MS`; routes `queries` away from `onInput`.
- **RD-04**: `serialize(next, prev, {caps})` in `render()`; `serialize(last, null, {caps})` for full repaint.
- **index.ts**: re-export `createHost` + types `Host`, `HostOptions`, `ResizeEvent`, `RuntimeAdapter`.

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|-----------|-------------------|--------|
| `start()` called twice | Second call is a no-op while running | AR-8 |
| `stop()` called twice / before start | Idempotent no-op | AR-8 |
| `setRawMode` on non-TTY | Never attempted — guarded by `isTTY` | AR-11 |
| Terminal reply arriving as input | `queries` routed away from `onInput` | RD-06 |
| Lone trailing ESC | Host arms 50ms `flush()` timer; new bytes cancel | AR-14 |

> **Traceability:** every decision references `00-ambiguity-register.md`.

## Testing Requirements
- Unit: `createHost` returns a `Host`; `start`/`stop` idempotency; input pump dispatch + query
  routing; ESC-timer flush; `render` diff + single write; non-TTY `render` still writes.
- Integration: full start→render→stop with injected fake adapter + capturing stream (ST-7).
