# Runtime-Query Seam, Parser & Security: RD-02

> **Document**: 03-03-runtime-query-and-security.md
> **Parent**: [Index](00-index.md)

## Overview

Defines layer 2: the `TerminalQuery` seam (PL-1), the strict, length-bounded
response **parser** (PL-8), the bounded timeout (PL-11), demultiplexing (AC-4), and
the security posture for untrusted responses (AC-7, AC-8). Because RD-06 (the real
input decoder) does not exist yet, the seam is injectable and defaults to a no-op;
the parser is built and fully unit-tested **now** with stub streams.

## `src/engine/capability/query.ts`

### Seam

`TerminalQuery` (defined in [03-01](03-01-capability-model-and-types.md)) is the only
coupling to RD-06: `write(data)` to request, `read()` yields raw byte chunks. RD-02
ships **no** real implementation — when `options.query` is absent, layer 2 is skipped
and `resolveCapabilities` relies on layers 1/3/4/5.

### Queries issued (when a seam is provided)

| Query | Request | Response grammar (parsed) |
| ----- | ------- | ------------------------- |
| Primary DA | `ESC [ c` | `ESC [ ? <params> c` |
| Secondary DA | `ESC [ > c` | `ESC [ > <params> c` |
| Version (XTVERSION) | `ESC [ > q` | `ESC P > \| <text> ESC \\` (DCS) |
| Synchronized output `?2026` | `ESC [ ? 2026 $ p` | `ESC [ ? 2026 ; <n> $ y` |

Each maps to profile fields (e.g. `?2026` → `sync2026`, DA params → mouse/keyboard hints).

### Parser contract (PL-8 — strict + length-bounded)

```
runQueries(query, timeoutMs):
  write all requests
  accumulate bytes from query.read() into a bounded buffer
  for each completed, well-formed response sequence:
      classify against the known grammars; extract the capability hint
      remove those exact bytes from the stream (consume)
  bytes that are NOT part of a recognized response -> passthrough (AC-4)
  STOP when: all expected responses seen, OR timeoutMs elapsed, OR buffer reaches CAP
  return { parsed: DeepPartial<CapabilityProfile>, passthrough: Uint8Array }
```

- **Length bound (PL-8):** `RESPONSE_BUFFER_CAP = 1024` bytes. If the accumulated
  unterminated buffer reaches the cap, stop reading, discard the buffer, and fall
  back (AC-7). Never grow without bound.
- **Timeout (PL-11):** a single `timeoutMs` (default 200) bounds the whole layer-2
  step. On timeout, return whatever was parsed plus passthrough; **never reject**
  (AC-3). Implemented with `Promise.race` over the read loop and a timer; the timer
  is always cleared.
- **Strictness:** only exact, fully-terminated sequences matching a grammar are
  consumed; partial/garbage bytes are treated as passthrough, never as capabilities.

### Demultiplexing (AC-4)

The parser returns `passthrough` — the bytes that were **not** recognized query
responses. RD-06's decoder will deliver `passthrough` to the app and discard the
consumed response bytes. RD-02's ST-14 asserts: given a stream of `<DA response> +
"a"`, `parsed` reflects the DA and `passthrough === "a"` (zero response bytes leak).

## Security Considerations (AC-7, AC-8)

| Concern | Handling | Ref |
| ------- | -------- | --- |
| Untrusted, unbounded response | 1 KB buffer cap; stop + discard + fall back | AC-7, PL-8 |
| Malformed/hostile response | Strict grammar match; non-matching bytes never become capabilities | AC-7 |
| Hang on silent terminal | Bounded `timeoutMs`; never rejects/hangs | AC-3 |
| Response injected as input | Consumed bytes removed; only passthrough forwarded | AC-4 |
| Leaking env/secrets | Reads only listed non-sensitive vars; **no logging** of env values at default level | AC-8 |
| Code execution | No `eval`; responses are parsed as data only | AC-8 |

## Error Handling

| Error Case | Strategy | Ref |
| ---------- | -------- | --- |
| `read()` never yields | Timeout fires; fall back; resolve succeeds | AC-3 |
| 64 KB with no terminator | Cap reached at 1 KB; discard; fall back | AC-7 |
| Interleaved valid + junk | Valid consumed; junk → passthrough | AC-4, AC-7 |
| `write()` throws | Catch; skip layer 2; fall back to env/table/default | AC-3 |

## Testing Requirements
- ST-13 timeout (never-replies stub) · ST-14 demux · ST-15 oversized (64 KB) · ST-16
  malformed · plus impl tests for each grammar and the cap boundary.
- All layer-2 tests use a **stub `TerminalQuery`** (an async generator over canned
  bytes), so no real TTY is needed and the tests are deterministic and cross-platform.
