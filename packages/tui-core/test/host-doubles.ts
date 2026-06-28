/**
 * Shared test doubles for the RD-07 host suites (plan doc 07 §Test Doubles).
 *
 * Not a `*.test.ts` file, so the unit glob never runs it directly. The doubles
 * implement the injectable boundary the host designs for (AR-13): a
 * {@link FakeRuntimeAdapter} that records exits / raw-mode / suspend / writes and
 * drives signals, immediates, and a manual timer clock; a {@link CaptureStream}
 * that collects exact ANSI; and a {@link FakeInput} that emits `data`. They are
 * not mocks of internal logic — `decode`/`serialize`/`enterMode`/`leaveMode`/
 * `hostSignalSource` all run for real.
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import type { HostSignal, RuntimeAdapter, TimerHandle } from '../src/engine/host/types.js';

/** Thrown by {@link FakeRuntimeAdapter.exit} so the `never`-typed exit unwinds the handler. */
export class ProcessExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
    this.name = 'ProcessExitError';
  }
}

/** Run `fn`, swallowing the expected {@link ProcessExitError}; rethrow anything else. */
export function expectExit(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    if (!(err instanceof ProcessExitError)) throw err;
  }
}

/** A pending manual timer in the fake clock. */
interface FakeTimer {
  readonly fn: () => void;
  readonly at: number;
}

/**
 * The injectable OS boundary as an in-process recorder + driver (AR-13). Records
 * effects for assertions and exposes `emit*`/`flushImmediates`/`advanceTimer`
 * driver methods so the test deterministically advances the host. Immediates and
 * timers are **deferred** (never synchronous) so they mirror real
 * `setImmediate`/`setTimeout` (PF-007).
 */
export class FakeRuntimeAdapter implements RuntimeAdapter {
  public readonly platform: 'linux' | 'darwin' | 'win32';

  /** Exit codes passed to {@link exit}, in order. */
  public readonly exits: number[] = [];
  /** Raw-mode toggles recorded by {@link setRawMode}. */
  public readonly rawModeCalls: boolean[] = [];
  /** Count of {@link suspendSelf} calls (PF-001). */
  public suspendCount = 0;
  /** Synchronous writes recorded by {@link writeSync} (PF-004). */
  public readonly writeSyncCalls: { readonly fd: number; readonly data: string }[] = [];
  /** Concatenated {@link writeError} output (stderr channel). */
  public errorOutput = '';
  /** Concatenated {@link warn} output. */
  public warnOutput = '';

  private readonly signalHandlers = new Map<HostSignal, Set<() => void>>();
  private readonly uncaughtHandlers = new Set<(err: unknown) => void>();
  private readonly rejectionHandlers = new Set<(reason: unknown) => void>();
  private readonly exitHandlers: (() => void)[] = [];
  private immediates: (() => void)[] = [];
  private readonly timers = new Map<number, FakeTimer>();
  private clock = 0;
  private nextTimerId = 1;

  constructor(platform: 'linux' | 'darwin' | 'win32' = 'linux') {
    this.platform = platform;
  }

  public setRawMode(_stream: NodeJS.ReadStream, on: boolean): void {
    this.rawModeCalls.push(on);
  }

  public on(event: HostSignal, handler: () => void): () => void {
    let set = this.signalHandlers.get(event);
    if (!set) {
      set = new Set();
      this.signalHandlers.set(event, set);
    }
    set.add(handler);
    return (): void => {
      set?.delete(handler);
    };
  }

  public onUncaughtException(handler: (err: unknown) => void): () => void {
    this.uncaughtHandlers.add(handler);
    return (): void => {
      this.uncaughtHandlers.delete(handler);
    };
  }

  public onUnhandledRejection(handler: (reason: unknown) => void): () => void {
    this.rejectionHandlers.add(handler);
    return (): void => {
      this.rejectionHandlers.delete(handler);
    };
  }

  public suspendSelf(): void {
    this.suspendCount += 1;
  }

  public scheduleImmediate(fn: () => void): void {
    this.immediates.push(fn);
  }

  public setTimer(fn: () => void, ms: number): TimerHandle {
    const id = this.nextTimerId;
    this.nextTimerId += 1;
    this.timers.set(id, { fn, at: this.clock + ms });
    return id;
  }

  public clearTimer(handle: TimerHandle): void {
    this.timers.delete(handle as number);
  }

  public onProcessExit(handler: () => void): () => void {
    this.exitHandlers.push(handler);
    return (): void => {
      const at = this.exitHandlers.indexOf(handler);
      if (at >= 0) this.exitHandlers.splice(at, 1);
    };
  }

  public writeSync(fd: number, data: string): void {
    this.writeSyncCalls.push({ fd, data });
  }

  public exit(code: number): never {
    this.exits.push(code);
    throw new ProcessExitError(code);
  }

  public writeError(message: string): void {
    this.errorOutput += message;
  }

  public warn(message: string): void {
    this.warnOutput += message;
  }

  /** Number of live `process.on('exit')` backstop handlers (leak check). */
  public get pendingExitHandlers(): number {
    return this.exitHandlers.length;
  }

  /** Number of live signal handlers across all signals (leak check). */
  public get pendingSignalHandlers(): number {
    let total = 0;
    for (const set of this.signalHandlers.values()) total += set.size;
    return total;
  }

  // --- test drivers -------------------------------------------------------

  /** Fire every handler registered for `signal`. */
  public emit(signal: HostSignal): void {
    for (const handler of this.signalHandlers.get(signal) ?? []) handler();
  }

  /** Fire the uncaught-exception handlers with `err` (PF-002). */
  public emitUncaught(err: unknown): void {
    for (const handler of [...this.uncaughtHandlers]) handler(err);
  }

  /** Fire the unhandled-rejection handlers with `reason` (PF-002). */
  public emitUnhandledRejection(reason: unknown): void {
    for (const handler of [...this.rejectionHandlers]) handler(reason);
  }

  /** Fire the synchronous `process.on('exit')` backstop handlers. */
  public emitProcessExit(): void {
    for (const handler of this.exitHandlers) handler();
  }

  /** Drain the pending immediate queue once (coalescing happens before this, ST-4). */
  public flushImmediates(): void {
    const queue = this.immediates;
    this.immediates = [];
    for (const fn of queue) fn();
  }

  /** Advance the manual clock by `ms`, firing any timers now due (ST-16). */
  public advanceTimer(ms: number): void {
    this.clock += ms;
    for (const [id, timer] of [...this.timers]) {
      if (timer.at <= this.clock) {
        this.timers.delete(id);
        timer.fn();
      }
    }
  }
}

/**
 * A capturing output stream collecting exact ANSI into {@link data}. Built on
 * EventEmitter (not Writable) so `write()` captures **synchronously** and so the
 * EPIPE path can be driven via `emit('error', …)`. The host only uses
 * `write`/`on`/`columns`/`rows`/`fd`/`isTTY`.
 */
export class CaptureStream extends EventEmitter {
  /** Everything written, concatenated. */
  public data = '';
  public columns = 80;
  public rows = 24;
  public isTTY = true;
  public fd = 1;
  /** When true, the next {@link write} throws once (simulates a setup-time crash, ST-11). */
  public failNextWrite = false;

  /** Capture a chunk synchronously; throw once if {@link failNextWrite} is armed. */
  public write(chunk: Uint8Array | string): boolean {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('simulated write failure');
    }
    this.data += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  }

  /**
   * View this double as a {@link NodeJS.WriteStream}. The host only uses
   * `write`/`on`/`columns`/`rows`/`fd`/`isTTY`; fully implementing tty.WriteStream
   * is impractical for a test double, so a single localized assertion bridges the
   * structural gap (test-only — never in production code).
   */
  public asOutput(): NodeJS.WriteStream {
    return this as unknown as NodeJS.WriteStream;
  }
}

/** A readable input double that emits `data` on demand. */
export class FakeInput extends EventEmitter {
  public isTTY: boolean;

  constructor(isTTY = true) {
    super();
    this.isTTY = isTTY;
  }

  /** Push a chunk to the host's `data` listener. */
  public feed(bytes: Uint8Array): void {
    this.emit('data', bytes);
  }

  /** View this double as a {@link NodeJS.ReadStream} (see {@link CaptureStream.asOutput}). */
  public asInput(): NodeJS.ReadStream {
    return this as unknown as NodeJS.ReadStream;
  }
}
