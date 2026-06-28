/**
 * Host public type surface (RD-07, plan doc 03-01).
 *
 * Declares the host's contract: the {@link ResizeEvent} it delivers, the
 * {@link HostOptions} that configure {@link createHost}, the running {@link Host}
 * object, the injectable {@link RuntimeAdapter} OS boundary (the testing seam),
 * and the abstract {@link HostSignal} set the adapter maps onto real
 * POSIX/Windows specifics. Pure declarations — no behavior, hence no spec test
 * of its own (AR-13); the modules built on it are proven by Phases 2–4.
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import type { CapabilityProfile } from '../capability/profile.js';
import type { InputEvent } from '../input/events.js';
import type { ScreenBuffer } from '../render/buffer.js';

/** A terminal resize, delivered via SIGWINCH (POSIX) or stdout 'resize' (Windows). [AR-7] */
export interface ResizeEvent {
  readonly type: 'resize';
  readonly columns: number;
  readonly rows: number;
}

/**
 * Options for {@link createHost}. Only `caps` is required; every OS-touching
 * input is injectable so the host is driven headlessly in tests (AR-13).
 */
export interface HostOptions {
  /** The detected capability profile; gates every mode the host enables (AR-1). */
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
 * The injectable OS boundary. The real implementation (platform.ts) wraps
 * node:tty / node:process / node:os and is constructed bound to the host's output
 * stream (so win32 `resize`/`hangup` can attach to it, PF-010); tests inject a
 * fake that records exit codes, captures writes, and drives signals/timers. [AR-13]
 */
export interface RuntimeAdapter {
  /** The OS the adapter targets; selects the per-OS signal source map (PF-005). */
  readonly platform: 'linux' | 'darwin' | 'win32';
  /** Put the input stream in/out of raw mode (real: stream.setRawMode). Guarded by isTTY. [AR-11] */
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
  /** Arm the ESC disambiguation timer (real: setTimeout); returns a clearable handle. [AR-14] */
  setTimer(fn: () => void, ms: number): TimerHandle;
  /** Clear a timer armed by {@link setTimer} (real: clearTimeout). [AR-14] */
  clearTimer(handle: TimerHandle): void;
  /** Register the synchronous exit backstop (real: process.on('exit')); returns an unsubscribe. [AR-17, RT-2] */
  onProcessExit(handler: () => void): () => void;
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
 * Abstract, payload-free signal set; the adapter maps POSIX/Windows specifics
 * internally (`hostSignalSource`, PF-005), keeping `host.ts` platform-agnostic
 * (AR-4). Uncaught-exception / unhandled-rejection carry payloads, so they are
 * NOT in this union — they have dedicated subscriptions
 * (`onUncaughtException` / `onUnhandledRejection`, PF-002).
 */
export type HostSignal = 'resize' | 'interrupt' | 'terminate' | 'hangup' | 'suspend' | 'continue';

/** Opaque timer handle returned by {@link RuntimeAdapter.setTimer}. */
export type TimerHandle = unknown;
