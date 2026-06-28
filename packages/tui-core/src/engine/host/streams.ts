/**
 * Stream binding + TTY detection + optional `/dev/tty` (RD-07, plan doc 03-03).
 *
 * `bindStreams()` resolves the input/output streams the host drives and reports
 * whether both ends are a real TTY. On POSIX, when stdout is piped but a
 * controlling terminal exists, it transparently binds to `/dev/tty` so a piped
 * app can still own the terminal; any failure (or Windows) degrades to the std
 * streams rather than throwing (AR-13). Injected streams are used verbatim and
 * never closed by `dispose()` — the test owns them.
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import { closeSync, openSync } from 'node:fs';
import { ReadStream, WriteStream } from 'node:tty';
import type { HostOptions } from './types.js';

/**
 * The subset of {@link HostOptions} that governs stream binding + TTY detection.
 * `HostOptions` is structurally compatible, so the host passes itself straight
 * through; {@link detectTty} supplies just these fields pre-start (PF-001).
 */
export interface StreamOptions {
  readonly input?: NodeJS.ReadStream;
  readonly output?: NodeJS.WriteStream;
  readonly preferDevTty?: boolean;
}

/** The resolved streams + TTY state the host runs against. [AR-11, AR-13] */
export interface BoundStreams {
  readonly input: NodeJS.ReadStream;
  readonly output: NodeJS.WriteStream;
  /** True only when BOTH ends are TTYs (or a `/dev/tty` bind succeeded). [AR-11] */
  readonly isTTY: boolean;
  /** Close any stream this module opened (e.g. `/dev/tty` fds); no-op for injected/std streams. */
  dispose(): void;
}

/** A restore/dispose step that must never throw — secondary failures are swallowed. */
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    /* best-effort cleanup — nothing actionable if it fails */
  }
}

/**
 * Attempt to bind to the controlling terminal via `/dev/tty` (POSIX only).
 * Opens separate read and write descriptors; returns `null` if either open
 * fails so the caller can degrade to the std streams. [AR-13]
 */
function openDevTty(): BoundStreams | null {
  let readFd: number | undefined;
  let writeFd: number | undefined;
  try {
    readFd = openSync('/dev/tty', 'r');
    writeFd = openSync('/dev/tty', 'w');
    const input = new ReadStream(readFd);
    const output = new WriteStream(writeFd);
    let closed = false;
    return {
      input,
      output,
      isTTY: Boolean(input.isTTY && output.isTTY),
      dispose(): void {
        if (closed) return;
        closed = true;
        safely(() => input.destroy());
        safely(() => output.destroy());
        safely(() => closeSync(readFd as number));
        safely(() => closeSync(writeFd as number));
      },
    };
  } catch {
    if (readFd !== undefined) safely(() => closeSync(readFd as number));
    if (writeFd !== undefined) safely(() => closeSync(writeFd as number));
    return null;
  }
}

/**
 * Resolve the bound streams + TTY state from options.
 *
 * Defaults `input` to `process.stdin` and `output` to `process.stdout`. When
 * neither stream is injected, `preferDevTty` is not `false`, the platform is
 * POSIX, and stdout is piped, it tries `/dev/tty`; on any failure it falls back
 * to the std streams. Injected streams are used verbatim. [AR-11, AR-13]
 *
 * @param options - the host options (`input`/`output`/`preferDevTty`).
 * @returns the bound streams, TTY flag, and a `dispose()` that closes only what
 *   this module opened.
 */
function resolveStreams(options: StreamOptions): BoundStreams {
  const injected = options.input !== undefined || options.output !== undefined;
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;

  // Default POSIX path: piped stdout but a controlling terminal may exist.
  if (!injected && options.preferDevTty !== false && process.platform !== 'win32' && !process.stdout.isTTY) {
    const devTty = openDevTty();
    if (devTty) return devTty;
  }

  return {
    input,
    output,
    isTTY: Boolean(input.isTTY && output.isTTY),
    dispose(): void {
      /* std/injected streams are owned elsewhere — nothing to close */
    },
  };
}

export function bindStreams(options: HostOptions): BoundStreams {
  return resolveStreams(options);
}

/**
 * Resolve whether the SDK has an interactive TTY, ephemerally — for the RD-08
 * essentials gate to read **before** `start()` (PF-001). `host.isTTY` is only
 * populated inside `start()`, so a pre-start gate cannot use it; this binds the
 * same streams `bindStreams` would, reads `isTTY`, and disposes anything it
 * opened (e.g. a `/dev/tty` fd) so no descriptor lingers. [AR-2]
 *
 * @param options - injectable `input`/`output`/`preferDevTty` (defaults match
 *   `bindStreams`: std streams, with the POSIX `/dev/tty` fallback when piped).
 * @returns true when both ends are a real TTY (or a `/dev/tty` bind succeeded).
 */
export function detectTty(options: StreamOptions = {}): boolean {
  const bound = resolveStreams(options);
  try {
    return bound.isTTY;
  } finally {
    bound.dispose();
  }
}
