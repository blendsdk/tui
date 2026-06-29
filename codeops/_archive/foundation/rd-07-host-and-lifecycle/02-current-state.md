# Current State: RD-07 Host & Lifecycle

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The three subsystems the host wires together are all implemented, pure, and stable. The host is a
greenfield module — no host code exists yet; `src/engine/index.ts` exports only RD-01/02/04/06.
The host's job is **integration + I/O ownership**, so its design is constrained by these existing
public surfaces (all verified by grounding pass with file:line cites).

### Relevant Files (consumed, not modified)

| File | Purpose | Host usage |
|------|---------|-----------|
| `src/engine/capability/profile.ts` | `CapabilityProfile` + nested caps | Read to decide which modes to enable |
| `src/engine/capability/index.ts` | `resolveCapabilities()` | App resolves caps and passes them in (host does not resolve) |
| `src/engine/input/decoder.ts` | `createDecoderState`, `decode`, `flush` | Pump stdin bytes; thread state; arm ESC timer |
| `src/engine/input/events.ts` | `InputEvent` union, `DecoderState`, `DecodeResult`, `ESC_TIMEOUT_MS` | Dispatch events; route queries away |
| `src/engine/render/serialize.ts` | `serialize(current, previous, options)` | Produce the coalesced write in `render()` |
| `src/engine/render/buffer.ts` | `ScreenBuffer` | The frame type `render()` accepts |
| `src/engine/index.ts` | Public barrel | **Modified** — add host re-exports |

### Code Analysis — exact surfaces the host depends on

**Capabilities** (`src/engine/capability/profile.ts:63`):
```ts
interface CapabilityProfile {
  readonly colorDepth: ColorDepth;     // 'mono' | '16' | '256' | 'truecolor'
  readonly mouse: MouseCaps;           // { sgr, drag, wheel }
  readonly unicode: UnicodeCaps;
  readonly osc: OscCaps;
  readonly sync2026: boolean;
  readonly altScreen: boolean;         // gates ?1049
  readonly bracketedPaste: boolean;    // gates ?2004
  readonly keyboard: KeyboardCaps;     // { kittyFlags, modifyOtherKeys }
  readonly glyphs: GlyphCaps;
  readonly platform: Platform;         // 'linux' | 'darwin' | 'win32'
  readonly multiplexer: boolean;
}
```
The host reads `altScreen`, `bracketedPaste`, `mouse.sgr` (enables `?1006h`+`?1000h`), `mouse.drag`
(enables `?1002h`), `keyboard.*`, and `platform` to choose enter/leave sequences. `mouse.wheel` rides
the same SGR channel and gates no bytes (PF-003). Focus (`?1004`) is host policy via `HostOptions.focus`
(no capability models it; default on) — input/events.ts notes focus is "gated on ?1004 by the host".

**Input decoder** (`src/engine/input/decoder.ts:67`):
```ts
function decode(bytes: Uint8Array, state: DecoderState, options?: DecodeOptions): DecodeResult;
function flush(state: DecoderState, options?: DecodeOptions): DecodeResult;
// DecodeResult = { events: InputEvent[]; queries: QueryResponse[]; rest: Uint8Array; state: DecoderState }
```
`decode`/`flush` are pure and thread `state`. The host owns the `setTimeout(ESC_TIMEOUT_MS=50)`
that calls `flush()` when a lone trailing ESC is carried (AR-14). `queries` are routed away from
`onInput` (a terminal reply must never surface as a keystroke).

**Renderer** (`src/engine/render/serialize.ts:142`):
```ts
function serialize(current: ScreenBuffer, previous: ScreenBuffer | null, options: RenderOptions): string;
// RenderOptions = { caps: CapabilityProfile; encodeStyle?: StyleEncoder }
```
Returns one coalesced ANSI string (`''` when nothing changed); `previous === null` forces a full
repaint — exactly what the host uses on resume/resize. `ScreenBuffer` ctor is
`(width, height, fill: Style & { char?: string })` (`buffer.ts:49`).

**Module conventions** (from `input/index.ts`, `render/index.ts`): `types.ts` + one file per
concern + an `index.ts` barrel; `.js` import specifiers on `.ts` sources; JSDoc on every exported
symbol with plan-doc/AR back-references; one class permitted (`ScreenBuffer`) but stateful seams
use `create*` factories (`createDecoderState`, `createKeymap`).

**Toolchain** (`package.json`): `verify` = `typecheck && test && build`; tests are
`tsx --test "test/**/*.{spec,impl}.test.ts"`; e2e run explicitly (e.g. `install.e2e.test.ts`);
zero runtime deps; dev deps are tsx/typescript/eslint/prettier only (no PTY lib).

## Gaps Identified

### Gap 1: No terminal ownership layer
**Current:** the engine is pure functions; nothing touches stdin/stdout, raw mode, signals, or
process lifecycle.
**Required:** a host that binds streams, sets raw mode, enters/leaves modes, installs signal +
process handlers, and guarantees restore.
**Fix:** new `src/engine/host/` module (8 files, AR-5).

### Gap 2: No injectable OS boundary for testing
**Current:** there is no seam over `process`, signals, `setRawMode`, or `exit`.
**Required:** a runtime adapter interface (declared in `host/types.ts`, real impl in
`platform.ts`) so tests inject a fake that records exit codes and captures ANSI in-process (AR-13).
**Fix:** define `RuntimeAdapter`; default to real Node bindings; inject fakes in tests.

### Gap 3: No `ResizeEvent` type
**Current:** `grep -r Resize src/` → none.
**Required:** `ResizeEvent { type:'resize'; columns; rows }` in `host/types.ts` (AR-7), kept out of
RD-06's `InputEvent` union (resize is not byte-decoded).
**Fix:** new host-owned type.

## Dependencies

### Internal
- RD-02 `CapabilityProfile` (mode gating), RD-06 `decode`/`flush`/`InputEvent` (input pump), RD-04
  `serialize`/`ScreenBuffer` (frame output). All landed and green.

### External
- Node built-ins only: `node:tty`, `node:process`, `node:os` (platform), `node:fs` (`/dev/tty`),
  `node:child_process` (e2e test only). No new dependencies.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| In-process tests can't prove real `process.exit` codes | High | High | Thin subprocess e2e sends a real SIGINT, asserts real exit code (AR-13) |
| Windows paths unverifiable on this machine | High | Med | Implement behind the adapter; mark acceptance deferred-to-Windows-runner (AR-4) |
| `process.on('exit')` handler can only do sync writes | Certain | Med | `run(true)` → `adapter.writeSync(output.fd, leaveStr)` — uniformly synchronous on every platform (AR-17, PF-004) |
| Double restore (signal + exit backstop both fire) | Med | Low | `restore()` is idempotent/guarded — runs at most once (AR-17) |
| Real signals/timers make tests flaky | Med | Med | Inject the timer + signal source via the adapter; assert deterministically (AR-13, AR-14) |
| Leaking listeners on repeated start/stop | Low | Med | `stop()` removes every handler it installed; idempotent (AR-8) |
