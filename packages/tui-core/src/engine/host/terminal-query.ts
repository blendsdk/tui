/**
 * Real tty-backed {@link TerminalQuery} (RD-03, plan doc 03-01).
 *
 * Completes the layer-2 query wiring RD-02 deferred: `capability/query.ts`
 * defines the *consumer* ({@link runQueries}) and `capability/profile.ts` the
 * {@link TerminalQuery} seam, but no concrete implementation shipped. This is a
 * thin, dependency-free adapter over Node streams — `write()` pushes a request
 * string to the output stream; `read()` yields each input chunk as a
 * `Uint8Array` and detaches its listener when iteration ends — so
 * `resolveCapabilitiesAsync({ query })` works against a real terminal for both
 * the RD-03 probe and production async detection (AR-3).
 *
 * It does NOT change terminal modes: the caller guarantees raw mode + a flowing
 * input stream before querying. This keeps the adapter free of any lifecycle of
 * its own and side-effect-free with respect to terminal state.
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import type { TerminalQuery } from '../capability/profile.js';

/**
 * Options for {@link createTerminalQuery}. The streams default to the process
 * std streams. Base stream interfaces (not the tty subtypes) are used so real
 * `PassThrough` streams can drive the adapter in tests without an unsafe cast;
 * `process.stdin`/`process.stdout` still satisfy them. [RT-1]
 */
export interface TerminalQueryOptions {
  /** Stream to read terminal responses from. Default: `process.stdin`. */
  readonly input?: NodeJS.ReadableStream;
  /** Stream to write query requests to. Default: `process.stdout`. */
  readonly output?: NodeJS.WritableStream;
}

/**
 * A {@link TerminalQuery} with an explicit {@link ManagedTerminalQuery.close} to
 * detach the input listener and end any active `read()` iteration.
 */
export interface ManagedTerminalQuery extends TerminalQuery {
  /** Detach the input 'data' listener and end any active `read()` iterator. Idempotent. */
  close(): void;
}

/** Coerce a Node 'data' payload (Buffer when no encoding is set, else string) to bytes. */
function toBytes(chunk: Buffer | string): Uint8Array {
  return typeof chunk === 'string' ? new Uint8Array(Buffer.from(chunk, 'latin1')) : new Uint8Array(chunk);
}

/**
 * Create a real tty-backed {@link TerminalQuery} over Node streams (AR-3).
 *
 * `write(data)` writes the request string to `output`. `read()` returns an
 * `AsyncIterable` that yields each input 'data' chunk as a `Uint8Array`; bytes
 * arriving between iterations are buffered so none are dropped, and the listener
 * is detached when the consumer stops iterating (`return()`) or {@link close} is
 * called. The caller must ensure the input stream is in raw mode and flowing;
 * this adapter does not change modes.
 *
 * @param options Injectable `input`/`output` streams (default: process std streams).
 * @returns A managed query seam; call {@link close} when done to release the listener.
 */
export function createTerminalQuery(options: TerminalQueryOptions = {}): ManagedTerminalQuery {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;

  const queue: Uint8Array[] = [];
  let dataListener: ((chunk: Buffer | string) => void) | null = null;
  let errorListener: (() => void) | null = null;
  let pending: ((result: IteratorResult<Uint8Array>) => void) | null = null;
  let ended = false;

  function detach(): void {
    if (dataListener) {
      input.removeListener('data', dataListener);
      dataListener = null;
    }
    if (errorListener) {
      input.removeListener('error', errorListener);
      errorListener = null;
    }
  }

  function ensureListening(): void {
    if (dataListener || ended) return;
    dataListener = (chunk): void => {
      const bytes = toBytes(chunk);
      if (pending) {
        const resolve = pending;
        pending = null;
        resolve({ value: bytes, done: false });
      } else {
        queue.push(bytes);
      }
    };
    // A stream 'error' ends iteration gracefully rather than crashing the process
    // on an unhandled 'error' event; the consumer (runQueries) then falls back.
    errorListener = (): void => close();
    input.on('data', dataListener);
    input.on('error', errorListener);
    input.resume(); // ensure the stream is flowing
  }

  // A single reusable iterator: runQueries consumes one read() loop at a time.
  const iterator: AsyncIterator<Uint8Array> = {
    next(): Promise<IteratorResult<Uint8Array>> {
      const queued = queue.shift();
      if (queued !== undefined) {
        return Promise.resolve({ value: queued, done: false });
      }
      if (ended) {
        return Promise.resolve({ value: undefined, done: true });
      }
      ensureListening();
      return new Promise((resolve) => {
        pending = resolve;
      });
    },
    return(): Promise<IteratorResult<Uint8Array>> {
      detach();
      return Promise.resolve({ value: undefined, done: true });
    },
  };

  function close(): void {
    if (ended) return;
    ended = true;
    detach();
    if (pending) {
      const resolve = pending;
      pending = null;
      resolve({ value: undefined, done: true });
    }
  }

  return {
    write(data: string): void {
      output.write(data);
    },
    read(): AsyncIterable<Uint8Array> {
      ensureListening();
      return { [Symbol.asyncIterator]: () => iterator };
    },
    close,
  };
}
