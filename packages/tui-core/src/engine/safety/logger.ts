/**
 * The screen-safe logger (RD-08 §Logging; AR-5, AR-10, AR-14).
 *
 * A TUI library owns the screen, so it can never log to the UI stream.
 * {@link createLogger} returns a {@link Logger} over three sinks — file, stderr,
 * and an in-memory ring — env-gated and disabled by default (a normal run writes
 * zero bytes, AC-5). Construction throws {@link LoggerConfigError} when a
 * resolved sink would target the UI output stream (AC-7).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
import * as nodeFs from 'node:fs';

import { LoggerConfigError } from './errors.js';

/** Severity levels, coarsest to finest. [AR-10] */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** A structured log record (Should-Have structured format). [AR-6] */
export interface LogRecord {
  readonly level: LogLevel;
  /** Subsystem tag, e.g. 'input' | 'gate' | 'host'. */
  readonly component: string;
  readonly msg: string;
  /** Extra non-secret fields (e.g. a redacted event). Never raw input. */
  readonly fields?: Readonly<Record<string, unknown>>;
}

/** Where log records go. [AR-10] */
export type LogSink = 'auto' | 'file' | 'stderr' | 'ring';

/**
 * The minimal filesystem seam the logger needs, injectable so the UI-stream
 * guard (ST-22) is deterministically testable without touching real devices.
 * Defaults to `node:fs`.
 */
export interface LoggerFs {
  openSync(path: string, flags: string): number;
  fstatSync(fd: number): { readonly dev: number; readonly ino: number };
  writeSync(fd: number, data: string): number;
  closeSync(fd: number): void;
}

/** Options for {@link createLogger}; all optional (env supplies defaults). [AR-10, AR-14] */
export interface LoggerOptions {
  /** Force enable/disable. Default: enabled iff `sink==='ring'` or `env.BLENDTUI_DEBUG==='1'`. */
  readonly enabled?: boolean;
  /** Minimum level emitted. Default: 'debug' when enabled. */
  readonly level?: LogLevel;
  /** Sink override. Default 'auto' (file if a path is set, else stderr-if-safe). */
  readonly sink?: LogSink;
  /** File path for the 'file' sink. Default: `env.BLENDTUI_LOG`. */
  readonly path?: string;
  /** Ring capacity in entries (sink==='ring'). Default 1024. */
  readonly size?: number;
  /** Environment to read flags from. Default: `process.env`. (Injectable for tests.) */
  readonly env?: NodeJS.ProcessEnv;
  /** UI output stream fd to refuse (screen-safety guard). Default: stdout fd (1). */
  readonly uiFd?: number;
  /** Filesystem seam (injectable for tests). Default: `node:fs`. */
  readonly fs?: LoggerFs;
}

/** The screen-safe logger. Returned by {@link createLogger}. [AR-14] */
export interface Logger {
  readonly enabled: boolean;
  debug(component: string, msg: string, fields?: Record<string, unknown>): void;
  info(component: string, msg: string, fields?: Record<string, unknown>): void;
  warn(component: string, msg: string, fields?: Record<string, unknown>): void;
  error(component: string, msg: string, fields?: Record<string, unknown>): void;
  /** Ring sink only: the buffered records (oldest→newest). Empty otherwise. For tests. */
  entries(): readonly LogRecord[];
  /** Flush/close the sink (closes the file handle). Idempotent. */
  close(): void;
}

/** Numeric severity for level filtering (lower = coarser/more severe). */
const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

/** Default ring capacity. */
const DEFAULT_RING_SIZE = 1024;

/** Internal sink contract shared by the ring/file/stderr/none implementations. */
interface Sink {
  write(record: LogRecord): void;
  entries(): readonly LogRecord[];
  close(): void;
}

/** Format one record as a single log line (file/stderr sinks). */
function formatLine(record: LogRecord): string {
  const base = `${record.level} ${record.component} ${record.msg}`;
  const extra = record.fields ? ` ${JSON.stringify(record.fields)}` : '';
  return `${base}${extra}\n`;
}

/** A no-op sink: drops every record (disabled logger / auto-with-no-target). */
function createNoneSink(): Sink {
  return {
    write: () => undefined,
    entries: () => [],
    close: () => undefined,
  };
}

/** A bounded in-memory ring sink (oldest dropped past `size`). */
function createRingSink(size: number): Sink {
  const capacity = size > 0 ? size : DEFAULT_RING_SIZE;
  const records: LogRecord[] = [];
  return {
    write: (record) => {
      records.push(record);
      if (records.length > capacity) records.shift();
    },
    entries: () => records.slice(),
    close: () => undefined,
  };
}

/** An fd-backed line sink (file or stderr). `ownsFd` closes the fd on `close()`. */
function createFdSink(fs: LoggerFs, fd: number, ownsFd: boolean): Sink {
  let closed = false;
  return {
    write: (record) => {
      if (!closed) fs.writeSync(fd, formatLine(record));
    },
    entries: () => [],
    close: () => {
      if (ownsFd && !closed) fs.closeSync(fd);
      closed = true;
    },
  };
}

/**
 * Throw {@link LoggerConfigError} when the opened file `fd` resolves to the same
 * device+inode as the UI stream (`ino !== 0` guard; best-effort where the UI
 * stat is unavailable). Closes `fd` before throwing so no handle leaks.
 */
function assertFileNotUiStream(fs: LoggerFs, fileFd: number, uiFd: number): void {
  const file = fs.fstatSync(fileFd);
  let ui: { readonly dev: number; readonly ino: number };
  try {
    ui = fs.fstatSync(uiFd);
  } catch {
    return; // UI stat unavailable → cannot compare; allow (best-effort).
  }
  if (file.ino !== 0 && file.dev === ui.dev && file.ino === ui.ino) {
    fs.closeSync(fileFd);
    throw new LoggerConfigError('Refusing a log file that resolves to the UI output stream.');
  }
}

/**
 * Open `path` for append (creating it if missing) and return an fd-backed sink,
 * after asserting it does not resolve to the UI stream. Opening with `'a'`
 * follows symlinks to the real file, so the fd-based `{dev,ino}` guard catches a
 * symlinked UI stream without a separate `realpath` step.
 */
function openFileSink(fs: LoggerFs, path: string, uiFd: number): Sink {
  const fd = fs.openSync(path, 'a');
  assertFileNotUiStream(fs, fd, uiFd);
  return createFdSink(fs, fd, true);
}

/** Resolve the concrete sink for an enabled logger, applying the UI-stream guard. */
function resolveSink(options: LoggerOptions, env: NodeJS.ProcessEnv): Sink {
  const fs = options.fs ?? nodeFs;
  const uiFd = options.uiFd ?? 1;
  const sink = options.sink ?? 'auto';
  const path = options.path ?? env.BLENDTUI_LOG;

  if (sink === 'ring') return createRingSink(options.size ?? DEFAULT_RING_SIZE);

  if (sink === 'stderr') {
    if (2 === uiFd) throw new LoggerConfigError('Refusing a stderr sink that is the UI output stream.');
    return createFdSink(fs, 2, false);
  }

  if (sink === 'file') {
    if (!path) throw new LoggerConfigError('The file sink requires a path (options.path or BLENDTUI_LOG).');
    return openFileSink(fs, path, uiFd);
  }

  // 'auto': prefer a file when a path is set, else stderr when it is not the UI.
  if (path) return openFileSink(fs, path, uiFd);
  if (2 !== uiFd) return createFdSink(fs, 2, false);
  return createNoneSink();
}

/**
 * Create a screen-safe logger. [AR-5, AR-10, AR-14]
 *
 * Enablement: `options.enabled ?? (sink==='ring' || env.BLENDTUI_DEBUG==='1')`.
 * A disabled logger is a no-op (every method returns without writing;
 * `entries()` is empty) so a normal run writes zero bytes (AC-5).
 *
 * Sink selection when enabled (sink==='auto'): if a path (`options.path ??
 * env.BLENDTUI_LOG`) is set → file (append); else if stderr is not the UI stream
 * → stderr; else no sink. The 'ring' sink is always available via `sink:'ring'`
 * (used by tests) and self-enables.
 *
 * Screen-safety (AC-7): construction throws {@link LoggerConfigError} when a
 * resolved sink targets the UI stream — stderr by fd-number compare, file by
 * `{dev,ino}` equality with an `ino !== 0` guard (best-effort where inodes are
 * unstable). The `fs` seam is injectable so the guard is deterministically
 * testable (ST-22).
 *
 * @param options Optional configuration; env supplies defaults.
 * @returns A `Logger`. Disabled when not gated on.
 * @throws LoggerConfigError when a resolved sink targets the UI stream.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const env = options.env ?? process.env;
  const sink = options.sink ?? 'auto';
  const enabled = options.enabled ?? (sink === 'ring' || env.BLENDTUI_DEBUG === '1');

  if (!enabled) {
    // Disabled: a pure no-op so the screen-owning library writes nothing (AC-5).
    return {
      enabled: false,
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      entries: () => [],
      close: () => undefined,
    };
  }

  const threshold = LEVELS[options.level ?? 'debug'];
  const target = resolveSink(options, env);

  const emit = (level: LogLevel, component: string, msg: string, fields?: Record<string, unknown>): void => {
    if (LEVELS[level] > threshold) return; // below the configured level → drop.
    const record: LogRecord = fields ? { level, component, msg, fields } : { level, component, msg };
    target.write(record);
  };

  return {
    enabled: true,
    debug: (component, msg, fields) => emit('debug', component, msg, fields),
    info: (component, msg, fields) => emit('info', component, msg, fields),
    warn: (component, msg, fields) => emit('warn', component, msg, fields),
    error: (component, msg, fields) => emit('error', component, msg, fields),
    entries: () => target.entries(),
    close: () => target.close(),
  };
}
