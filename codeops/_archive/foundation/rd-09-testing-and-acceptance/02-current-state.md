# Current State: RD-09 Testing Strategy & Acceptance Gate

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The foundation is fully built (RD-01…RD-08 + RD-03) with **407 unit tests** and **4
explicit e2e files**, all green. `npm run verify` = `typecheck && typecheck:examples &&
test && build`; the unit glob is `test/**/*.{spec,impl}.test.ts`. e2e files end in
`*.e2e.test.ts` and run explicitly.

**Tier 1 (pure unit) — already realized**, e.g.:
- Capability: `capability-detect.spec`, `capability-public.spec`, `capability-query.spec`, `capability-security.spec`, `capability-{env,merge,parser,table}.impl`.
- Input: `input-decoder.spec`, `input-{keyboard,mouse,paste,keymap,demux}.spec`, `input-{keyboard,mouse,paste,responses}.impl`, `input-security.spec`.
- Render: `render-{buffer,glyphs,osc,serialize}.spec`, `render-{buffer,glyphs,osc,serialize,width}.impl`, `render-security.spec`.
- Color: `color-{encode,palette-theme,serialize}.spec/.impl`.
- Safety: `safety-{essentials,logger,redact,sanitize}.spec/.impl`, `safety-paste-cap.spec`, `safety-errors.impl`.
- Host: `host.spec`, `host-{lifecycle,modes,detect-tty,security}.spec`, `host.impl`, `host-platform.impl`.

**Existing e2e (the Tier-3 prior art):**
- `test/host-signals.e2e.test.ts` — a **real** SIGINT delivered to a real child → real `process.exit(130)` + real restore, with **no node-pty**: the child advertises piped streams as TTYs (`output.isTTY = true`, `input.setRawMode = () => input`) and runs the real `createHost`. This is the harness RD-09 Tier-3 extends (AR-2).
- `test/probe.e2e.test.ts` — real-SIGINT restore via the probe + `--auto` exit-0/schema.
- `test/safety-error-restore.e2e.test.ts` — restore on a thrown error.
- `test/install.e2e.test.ts` — packaging/clean-install.

### Relevant Files

| File                                  | Purpose                                                        | Changes Needed |
| ------------------------------------- | ------------------------------------------------------------- | -------------- |
| `src/engine/input/decoder.ts`         | `decode(bytes, state, opts?)`, `flush(state, opts?)`, `createDecoderState()` — pure byte→event | None (corpus + fuzz target it) |
| `src/engine/render/serialize.ts`      | `serialize(current, previous, options)` — pure damage diff     | None (golden + byte-prop target it) |
| `src/engine/render/buffer.ts`         | `class ScreenBuffer`                                           | None (golden builds buffers) |
| `src/engine/color/index.ts`           | depth-aware `encodeStyle` (serialize default encoder)         | None (golden exercises downsample) |
| `src/engine/host/host.ts`             | `createHost(options)`                                          | None (Tier-3 e2e drives it) |
| `src/engine/index.ts`                 | public entry                                                  | None |
| `test/host-signals.e2e.test.ts`       | no-node-pty real-signal harness                               | Pattern reused by `host-tier3.e2e.test.ts` |
| `package.json`                        | scripts + devDependencies                                     | Add `@xterm/headless`; add `gate` script |
| `scripts/check-no-native-deps.mjs`    | pure-Node ESM policy guard                                    | Reference style for `scripts/gate.mjs` |
| `.github/workflows/ci.yml`            | 3 OS × 3 Node matrix (no remote yet → DEF-1)                  | Optionally add a `gate` step (deferred-to-remote) |

### Code Analysis

Key signatures the new tiers consume (verified against source):

```ts
// src/engine/input/decoder.ts
export function createDecoderState(): DecoderState;
export function decode(bytes: Uint8Array, state: DecoderState, options?: DecodeOptions): DecodeResult;
export function flush(state: DecoderState, options?: DecodeOptions): DecodeResult;

// src/engine/render/serialize.ts
export function serialize(current: ScreenBuffer, previous: ScreenBuffer | null, options: RenderOptions): string;

// src/engine/capability/index.ts
export function resolveCapabilities(options?: SyncResolveOptions): CapabilityResolution; // .profile

// src/engine/host/host.ts
export function createHost(options: HostOptions): Host;
```

`DecodeResult` carries the decoded events plus the next `DecoderState` (RD-06 RT-1:
`decode`/`flush` thread state so a cross-chunk paste survives). The corpus runner and
fuzz harness both rely on this threading to feed multi-chunk inputs.

## Gaps Identified

### Gap 1: No recorded input corpus
**Current Behavior:** byte→event cases are inline in `input-*.spec` tests.
**Required Behavior:** a checked-in, data-driven corpus (FR-1) usable as a shareable regression base.
**Fix Required:** `test/fixtures/input-corpus/*.json` (hex-in-JSON) + `test/input-corpus.spec.test.ts` runner.

### Gap 2: No golden-screen tier
**Current Behavior:** `serialize` output is asserted as raw ANSI strings in `render-serialize`/`color-serialize`.
**Required Behavior:** output validated through a real emulator grid across all four depths (FR-2).
**Fix Required:** dev dep `@xterm/headless`; `test/golden-screen.spec.test.ts`.

### Gap 3: Tier-3 covers only SIGINT restore
**Current Behavior:** `host-signals.e2e` proves SIGINT→130→restore.
**Required Behavior:** alt-screen/mouse/cursor restore on normal exit, throw, SIGTERM, SIGHUP; alt-screen + mouse enable/disable observable in captured output (FR-3).
**Fix Required:** `test/host-tier3.e2e.test.ts` extending the existing harness.

### Gap 4: No fuzz harness, no byte-proportionality assertion, no gate command
**Current Behavior:** none.
**Required Behavior:** seeded fuzz (FR-6), bytes∝damage (FR-4), `docs/acceptance-gate.md` + `npm run gate` (FR-7).
**Fix Required:** `test/input-fuzz.*`, `test/render-bytes-damage.spec.test.ts`, `scripts/gate.mjs`, `docs/acceptance-gate.md`, `test/gate.spec.test.ts`.

## Dependencies

### Internal Dependencies
- RD-06 decoder (`decode`/`flush`), RD-04 `serialize`/`ScreenBuffer`, RD-05 `encodeStyle`, RD-07 `createHost`, RD-02 `resolveCapabilities`, RD-03 probe `--auto` + `terminal-matrix.json`. All implemented.

### External Dependencies
- **New dev dep:** `@xterm/headless` (pure-JS terminal emulator) — golden tier only (AR-12).
- **Rejected:** `node-pty` (native) — explicitly out (AR-2).

## Risks and Concerns

| Risk                                                              | Likelihood | Impact | Mitigation |
| ---------------------------------------------------------------- | ---------- | ------ | ---------- |
| `@xterm/headless` grid API differs from assumptions               | Med        | Med    | Pin a version; write a thin adapter to read cells; spec tests assert via that adapter |
| Golden tests flaky if emulator applies its own defaults           | Low        | Med    | Reset/clear the emulator per case; assert only explicitly-written cells |
| A new spec test exposes a **real** engine bug (red stays red)     | Med        | High   | Per CodeOps: fix the engine, never the spec test; record as a finding |
| Tier-3 child processes leak on assertion failure                  | Med        | Med    | `try/finally` kill + `rmSync` temp dirs (mirror `host-signals.e2e`) |
| `@xterm/headless` pulls a transitive native/perf dep              | Low        | Med    | Verify no `binding.gyp`; `npm audit`; it only affects dev/test, never `dist` |
| Fuzz nondeterminism                                               | Low        | Med    | Fixed seed set + small in-repo PRNG; pin any failing seed as a corpus case |
