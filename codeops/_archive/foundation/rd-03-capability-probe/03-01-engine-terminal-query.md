# Engine: Real tty-backed TerminalQuery

> **Document**: 03-01-engine-terminal-query.md
> **Parent**: [Index](00-index.md)

## Overview

The one shippable artifact of RD-03: a concrete `TerminalQuery` (the seam declared
at `capability/profile.ts:107`) backed by real Node streams. It completes the layer-2
wiring RD-02 deferred (AR-3), so `resolveCapabilitiesAsync({ query })` works against a
real terminal — for the probe's auto-probe phase **and** for production async detection.

## Architecture

### Current Architecture

`capability/query.ts#runQueries(query, timeoutMs)` is the *consumer*: it `write()`s the
DA/`?2026` requests, then `for await`s `query.read()` under a bounded timeout into a
`RESPONSE_BUFFER_CAP`-capped buffer. No concrete `TerminalQuery` implementation ships.

### Proposed Changes

Add `src/engine/host/terminal-query.ts` exporting `createTerminalQuery(options)`. It
lives under `host/` because it is an OS/tty concern, alongside `streams.ts`. It is a
thin, dependency-free adapter: `write()` pushes a string to the output stream;
`read()` yields input-stream bytes as an `AsyncIterable<Uint8Array>` that detaches its
listener when iteration ends. It does **not** manage raw mode — the caller guarantees
raw mode before querying (the probe does this via the host; a production caller is
responsible likewise). This keeps it a pure I/O adapter with no lifecycle of its own.

## Implementation Details

### New Types/Interfaces

```ts
/** Options for {@link createTerminalQuery}. Streams default to process std streams.
 *  Base stream interfaces (not the tty subtypes) so real PassThrough streams drive
 *  the adapter in tests without an unsafe cast; process.stdin/stdout still satisfy
 *  these. [RT-1] */
export interface TerminalQueryOptions {
  /** Stream to read terminal responses from. Default: process.stdin. */
  readonly input?: NodeJS.ReadableStream;
  /** Stream to write query requests to. Default: process.stdout. */
  readonly output?: NodeJS.WritableStream;
}

/** A {@link TerminalQuery} with an explicit close to detach the input listener. */
export interface ManagedTerminalQuery extends TerminalQuery {
  /** Detach the input 'data' listener and end any active read() iterator. Idempotent. */
  close(): void;
}
```

### New Functions/Methods

```ts
/**
 * Create a real tty-backed {@link TerminalQuery} over Node streams (AR-3).
 *
 * `write(data)` writes the request string to `output`. `read()` returns an
 * AsyncIterable that yields each input 'data' chunk as a Uint8Array and detaches
 * its listener when the consumer stops iterating (break/return) or `close()` is
 * called. Bytes that arrive between iterations are buffered in an internal queue so
 * none are dropped. The caller must ensure the input stream is in raw mode and
 * flowing before querying; this adapter does not change modes (side-effect-free
 * w.r.t. terminal state).
 *
 * @param options Injectable input/output streams (default: process std streams).
 * @returns A managed query seam; call close() when done to release the listener.
 */
export function createTerminalQuery(options?: TerminalQueryOptions): ManagedTerminalQuery;
```

### Integration Points

- Consumed by `capability/query.ts#runQueries` and therefore `resolveCapabilitiesAsync`.
- Re-exported from `src/engine/host/index.ts` and `src/engine/index.ts` (value + `TerminalQueryOptions`/`ManagedTerminalQuery` types).
- Used by the probe's `auto-probes.ts` ([03-03](03-03-probes.md)).

## Code Examples

```ts
const query = createTerminalQuery({ input, output });
try {
  const { profile } = await resolveCapabilitiesAsync({ query });
  // ...use profile
} finally {
  query.close();
}
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| `write()` throws (e.g. closed stream) | Propagate synchronously; `runQueries` already catches write failures and falls back (AC-3) | AR-3 |
| Input stream `error` event during `read()` | End the iterator gracefully (return) so `runQueries`' timeout/`end` path settles; never reject mid-iteration | AR-3 |
| Consumer stops iterating (timeout) | Iterator `return()` detaches the 'data' listener; no dangling handler | AR-3 |
| `close()` called twice | Idempotent no-op | AR-3 |
| Oversized response | Bounding is the consumer's job (`runQueries` `RESPONSE_BUFFER_CAP`); the adapter does not cap | AR-17 |

> **Traceability:** Every design choice references the Ambiguity Register. See `00-ambiguity-register.md`.

## Testing Requirements

- Spec (ST-19/20/21): `write()` writes bytes to the output stream; `read()` yields injected input bytes as `Uint8Array`; end-to-end with a scripted fake terminal through `runQueries`/`resolveCapabilitiesAsync` produces parsed caps.
- Impl: listener detaches on iterator return; `close()` idempotency; queued bytes between iterations are not dropped; `error` event ends iteration cleanly.
- Tests use a `PassThrough`/fake stream pair (real objects, no mocks) per the testing standards.
