/**
 * The production RuntimeAdapter + per-OS specifics (RD-07, plan doc 03-02).
 *
 * `hostSignalSource()` is a **pure** map from an abstract {@link HostSignal} to
 * the concrete OS source (a `process` signal or a stream event), so both the
 * POSIX and Windows maps are unit-testable on any host by passing a fake
 * platform (PF-005). `realRuntime()` builds the real adapter over node:process /
 * node:fs / node:tty, bound to the host's output stream so win32 `resize`/
 * `hangup` can attach to it (PF-010). The `platform`/`vtAvailable` overrides
 * exist purely so the Windows paths and the VT-warn branch are exercisable from
 * a POSIX test runner (PF-005); production passes neither.
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import { writeSync as fsWriteSync } from 'node:fs';
import type { HostSignal, RuntimeAdapter, TimerHandle } from './types.js';

/** Where an abstract {@link HostSignal} is sourced. `process` = a signal; `output` = a stream event. */
export interface SignalSource {
  readonly emitter: 'process' | 'output';
  readonly name: string;
}

/**
 * Map an abstract {@link HostSignal} to its concrete OS source on `platform`.
 * Pure (no I/O); `null` means the signal is not wired on that platform (e.g.
 * suspend/continue on win32, which has no SIGTSTP/SIGCONT). [AR-4, PF-005]
 *
 * @param platform - the OS to map for (`process.platform` shape).
 * @param signal - the abstract host signal.
 * @returns the source descriptor, or `null` when unsupported on `platform`.
 */
export function hostSignalSource(platform: NodeJS.Platform, signal: HostSignal): SignalSource | null {
  const win32 = platform === 'win32';
  switch (signal) {
    case 'resize':
      return win32 ? { emitter: 'output', name: 'resize' } : { emitter: 'process', name: 'SIGWINCH' };
    case 'interrupt':
      return { emitter: 'process', name: 'SIGINT' };
    case 'terminate':
      return win32 ? { emitter: 'process', name: 'SIGBREAK' } : { emitter: 'process', name: 'SIGTERM' };
    case 'hangup':
      return win32 ? { emitter: 'output', name: 'close' } : { emitter: 'process', name: 'SIGHUP' };
    case 'suspend':
      return win32 ? null : { emitter: 'process', name: 'SIGTSTP' };
    case 'continue':
      return win32 ? null : { emitter: 'process', name: 'SIGCONT' };
  }
}

/** Optional injectable overrides for {@link realRuntime} (test-only; production omits them). */
export interface RealRuntimeOptions {
  /** Platform to assume; defaults to `process.platform`. Lets a POSIX runner exercise win32 paths (PF-005). */
  readonly platform?: NodeJS.Platform;
  /** VT-processing availability predicate (win32 only); defaults to "available" (real check deferred-to-runner, AR-4). */
  readonly vtAvailable?: () => boolean;
  /** Warning sink; defaults to `process.stderr.write`. Injected so the VT-warn branch is assertable (PF-005). */
  readonly warn?: (message: string) => void;
}

/** Narrow an arbitrary `process.platform` to the three the adapter models. */
function normalizePlatform(platform: NodeJS.Platform): 'linux' | 'darwin' | 'win32' {
  if (platform === 'win32') return 'win32';
  if (platform === 'darwin') return 'darwin';
  return 'linux';
}

/**
 * Build the production {@link RuntimeAdapter} bound to `output`.
 *
 * All OS effects route through here so the host stays platform-agnostic and the
 * whole subsystem is testable by injecting a fake adapter instead. On win32, if
 * the injected `vtAvailable` predicate reports VT processing is unavailable
 * (legacy conhost), it warns once at construction (AR-4, PF-005).
 *
 * @param output - the bound output stream; win32 `resize`/`hangup` attach to it (PF-010).
 * @param options - test-only platform / VT overrides; omit in production.
 * @returns a real {@link RuntimeAdapter}. [AR-13, PF-010]
 */
export function realRuntime(output: NodeJS.WriteStream, options: RealRuntimeOptions = {}): RuntimeAdapter {
  const rawPlatform = options.platform ?? process.platform;
  const platform = normalizePlatform(rawPlatform);
  const vtAvailable = options.vtAvailable ?? ((): boolean => true);
  const warnSink =
    options.warn ??
    ((message: string): void => {
      process.stderr.write(message);
    });

  /** Attach `handler` to the source's emitter; return an unsubscribe. */
  function subscribe(emitter: NodeJS.EventEmitter, name: string, handler: () => void): () => void {
    emitter.on(name, handler);
    return (): void => {
      emitter.off(name, handler);
    };
  }

  // Win32 VT-processing check: warn once if a legacy console lacks VT (AR-4, PF-005).
  if (platform === 'win32' && !vtAvailable()) {
    warnSink('tui: virtual-terminal processing unavailable (legacy console); rendering may be degraded.\n');
  }

  return {
    platform,
    setRawMode(stream: NodeJS.ReadStream, on: boolean): void {
      // Never attempt raw mode on a non-TTY (AR-11).
      if (stream.isTTY) stream.setRawMode(on);
    },
    on(event: HostSignal, handler: () => void): () => void {
      const source = hostSignalSource(rawPlatform, event);
      // Unsupported on this platform (e.g. suspend/continue on win32) → inert.
      if (source === null) return (): void => {};
      const emitter: NodeJS.EventEmitter = source.emitter === 'output' ? output : process;
      return subscribe(emitter, source.name, handler);
    },
    onUncaughtException(handler: (err: unknown) => void): () => void {
      const listener = (err: unknown): void => handler(err);
      process.on('uncaughtException', listener);
      return (): void => {
        process.off('uncaughtException', listener);
      };
    },
    onUnhandledRejection(handler: (reason: unknown) => void): () => void {
      const listener = (reason: unknown): void => handler(reason);
      process.on('unhandledRejection', listener);
      return (): void => {
        process.off('unhandledRejection', listener);
      };
    },
    suspendSelf(): void {
      // SIGSTOP is uncatchable, so this suspends without re-entering the SIGTSTP handler (AR-10, PF-001).
      process.kill(process.pid, 'SIGSTOP');
    },
    scheduleImmediate(fn: () => void): void {
      setImmediate(fn);
    },
    setTimer(fn: () => void, ms: number): TimerHandle {
      return setTimeout(fn, ms);
    },
    clearTimer(handle: TimerHandle): void {
      // The handle round-trips as the opaque TimerHandle; it is the NodeJS.Timeout setTimer returned.
      clearTimeout(handle as NodeJS.Timeout);
    },
    onProcessExit(handler: () => void): () => void {
      process.on('exit', handler);
      return (): void => {
        process.off('exit', handler);
      };
    },
    writeSync(fd: number, data: string): void {
      // Synchronous so the draining 'exit' backstop actually flushes (PF-004).
      fsWriteSync(fd, data);
    },
    exit(code: number): never {
      return process.exit(code);
    },
    writeError(message: string): void {
      process.stderr.write(message);
    },
    warn(message: string): void {
      warnSink(message);
    },
  };
}
