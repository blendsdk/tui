# Current State: RD-03 Capability Probe & Survey Harness

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

RD-03 is a consumer of four landed subsystems plus the safety layer. Nothing of the
harness itself exists yet; this analysis maps the seams it builds on.

| Subsystem | Public surface the probe uses | Source |
|-----------|-------------------------------|--------|
| Capability (RD-02) | `resolveCapabilities`, `resolveCapabilitiesAsync`, `TerminalQuery` (seam), `CapabilityProfile`, `DeepPartial` | `src/engine/capability/` |
| Input (RD-06) | `createDecoderState`, `decode`, `flush`, `createKeymap`, `InputEvent`/`KeyEvent`/`MouseEvent`/`WheelEvent`/`PasteEvent` | `src/engine/input/` |
| Render (RD-04) | `ScreenBuffer`, `serialize`, `cursor`, `hyperlink`, `setClipboard`, `setTitle`, `bell`, `notify`, `CSI`, `SYNC_BEGIN/END` | `src/engine/render/` |
| Host (RD-07) | `createHost`, `detectTty`, `Host`, `HostOptions`, `RuntimeAdapter` | `src/engine/host/` |
| Color (RD-05) | `encode`, `encodeStyle`, `PALETTE`, `defaultTheme` (swatch rendering) | `src/engine/color/` |
| Safety (RD-08) | `dumpCaps` (machine-readable cap dump), `redactEvent` (readout redaction), `sanitize` | `src/engine/safety/` |

### Relevant Files

| File | Purpose | Changes Needed |
| ---- | ------- | -------------- |
| `src/engine/capability/profile.ts` | Defines the `TerminalQuery` seam (`write(data)`, `read(): AsyncIterable<Uint8Array>`), `ResolveOptions.query` | None (consumed as-is) |
| `src/engine/capability/query.ts` | `runQueries(query, timeoutMs)` — writes DA/`?2026` requests, reads bounded responses, parses caps | Reused by auto-probes; no change |
| `src/engine/host/streams.ts` | `detectTty()`, `resolveStreams()` — TTY probe + stream/`/dev/tty` resolution | Reuse `resolveStreams` from `terminal-query.ts`; no change |
| `src/engine/host/types.ts` | `Host` (`start/stop/render`, `onInput`, `onResize`), `RuntimeAdapter` | None |
| `src/engine/host/index.ts` | Host public re-exports | **Add** `createTerminalQuery` re-export |
| `src/engine/index.ts` | Package public entry | **Add** `createTerminalQuery` (+ its option type) re-export |
| `package.json` | Scripts; `files: ["dist","README.md","LICENSE"]` | **Add** `probe`, `typecheck:examples`; update `verify` |
| `tsconfig.json` | `rootDir:"src"`, `include:["src"]` | None (new sibling config instead) |
| `eslint.config.js` | Ignores `dist`/`node_modules`/`_archive`/`coverage` | None — `examples/` already linted |

### Code Analysis

**The `TerminalQuery` seam (the crux of AR-3).** `profile.ts:107` declares:

```ts
export interface TerminalQuery {
  write(data: string): void;
  read(): AsyncIterable<Uint8Array>;
}
```

`query.ts` already implements the *consumer* (`runQueries`) — it writes
`\x1b[c`, `\x1b[>c`, `\x1b[>q`, `\x1b[?2026$p`, reads under a bounded timeout into a
`RESPONSE_BUFFER_CAP`-capped buffer, and parses recognized responses. **No concrete
`TerminalQuery` implementation exists** — RD-02 shipped only the seam and a stub-driven
parser. So `resolveCapabilitiesAsync` currently cannot run layer 2 against a real
terminal. RD-03's `createTerminalQuery` fills exactly this gap (see
[03-01](03-01-engine-terminal-query.md)).

**The host does not expose raw write or a query method.** `Host` (`types.ts:60`) is
`start/stop/render` + `onInput`/`onResize` callbacks. Therefore the auto-probe phase
cannot push raw query bytes through the running host; it uses its own
`createTerminalQuery` bound to the same streams, run **before** the interactive manual
loop (AR-9) so query responses never collide with manual keypress reading.

**OSC manual-probe primitives already exist** (`render/osc.ts` via the public API):
`hyperlink`, `setClipboard`, `setTitle`, `bell`, `notify` — the harness emits these as
fire-and-forget patterns and asks the operator to confirm. Swatches use
`encode`/`PALETTE` from RD-05.

**`detectTty()` (RD-08 PF-001)** is the pre-start TTY probe used by the AC-6 non-TTY
boundary: in interactive mode, if `!detectTty()`, print a message and exit without
alt-screen/raw mode.

## Gaps Identified

### Gap 1: No concrete `TerminalQuery`
**Current Behavior:** `resolveCapabilitiesAsync({ query })` requires a caller-supplied seam; none ships.
**Required Behavior:** A real tty-backed `createTerminalQuery({ input, output })` usable by the probe and by production async detection.
**Fix Required:** Implement `src/engine/host/terminal-query.ts`; re-export it (AR-3).

### Gap 2: No example/harness infrastructure
**Current Behavior:** No `examples/` directory; nothing typechecks or runs harness code.
**Required Behavior:** `examples/capability-probe/` run by `npm run probe`, typechecked by `tsconfig.examples.json`.
**Fix Required:** New dir + modules; toolchain wiring (AR-2, AR-12).

### Gap 3: No evidence persistence
**Current Behavior:** Capability resolution is per-process and ephemeral.
**Required Behavior:** Append per-run reports to a checked-in `terminal-matrix.json`.
**Fix Required:** `matrix.ts` merge/append with an injectable fs seam (AR-6).

## Dependencies

### Internal Dependencies
- RD-02 capability core (`resolveCapabilities`, `runQueries`, `TerminalQuery`).
- RD-04 render (`ScreenBuffer`, `serialize`, OSC), RD-05 color (`encode`, `PALETTE`).
- RD-06 input decoder (`decode`/`flush`/`createDecoderState`/`createKeymap`).
- RD-07 host (`createHost`, `detectTty`, `resolveStreams`).
- RD-08 safety (`dumpCaps`, `redactEvent`).

### External Dependencies
- None at runtime (zero-dep policy). Dev/test: `node:test`, `tsx`, and `node:tty`/PTY for the restore e2e (the project's existing e2e tests use real signals, not node-pty — see RD-07 AR-13; this plan follows the same real-process approach, see §07).

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Auto-probe query bytes leak into manual keypress reading | Med | Med | Dedicated upfront auto phase before raw manual loop (AR-9); responses consumed by `runQueries` |
| Interactive flows hard to unit-test | High | Med | Inject fake host/streams + scripted input events; PTY e2e only for restore (AR-4) |
| `examples/` escapes the build into `dist` | Low | High | Separate `tsconfig.examples.json` with `noEmit`; main build stays `rootDir:"src"` (AR-12) |
| Report leaks secrets/PII | Low | High | Env allowlist in `env-meta.ts`; paste length-only; schema has no free env field (AR-17) |
| Restore fails on crash path | Low | High | Reuse host's guaranteed-restore lifecycle (RD-07); PTY e2e asserts leave sequences (AC-7) |
| Timestamp/`Date` nondeterminism in tests | Med | Low | Report builder takes an injected clock; tests pass a fixed timestamp |
