# Current State: RD-08 Essentials Gate, Logging, Errors & Security

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

RD-01, RD-02, RD-04, RD-06, and RD-07 are Implemented. RD-08 consumes their public surfaces
and relocates one provisional file. There is **no** logging, gate, or typed-error infrastructure
in the codebase today; `sanitize()` is the only RD-08-adjacent code that already exists.

### What Exists

- **`src/engine/capability/profile.ts`** — `CapabilityProfile` (`profile.ts:63`) with
  `colorDepth: ColorDepth` (`'mono'|'16'|'256'|'truecolor'`), `mouse: { sgr, drag, wheel }`,
  `altScreen: boolean`, etc. **No `rendering{}` group** — confirming AR-2's finding that the
  gate cannot read `caps.rendering.cursorAddressing/clear`. `CapabilityResolution = { profile,
  reasons }` where `reasons` is the per-field `ReasonLayer` trace `dumpCaps()` reuses (AR-6).
- **`src/engine/host/host.ts` / `types.ts`** — `createHost(options): Host`; `Host` exposes
  `isTTY`, `start()`, `stop()`, `render(buffer)` (`types.ts:60-66`). The host already owns a
  **guaranteed-restore crash path**: `handleFatal` runs `restore` → writes a stderr diagnostic
  → `onBeforeExit(1)` → `exit(1)` (`host.ts:113-130`), wired to `onUncaughtException` /
  `onUnhandledRejection` via the `RuntimeAdapter`. `HostOptions` already carries
  `caps: CapabilityProfile` (`types.ts:31`) and an `onInput(event)` callback fed by the input
  pump `onData → decode → dispatch` (`host.ts:79-96`). `host.start()` does **no** essentials
  gating today.
- **`src/engine/input/events.ts`** — `InputEvent = KeyEvent | MouseEvent | WheelEvent |
  PasteEvent | FocusEvent`. `KeyEvent` (`events.ts:16`) has `key: string` (the character for
  printable keys, a name for control keys), `ctrl/alt/shift`, and `codepoint?: number`
  **present only for printable keys** (`events.ts:24`) — the discriminator `redactEvent()` uses
  (AR-9). `KEY_NAMES` (`events.ts:137`) is the named-key allowlist. `PasteEvent` has
  `text: string` + `truncated: boolean`. `PASTE_CAP_BYTES = 1_048_576` (`events.ts:131`) is
  defined, enforced in the decoder scan loop, configurable via `DecodeOptions.pasteCap`, and
  re-exported.
- **`src/engine/render/sanitize.ts`** — the real (not stub) strip-only `sanitize(text):string`
  (`sanitize.ts:27`), marked "provisional (PL-16): RD-08 will own/relocate the canonical
  version." Used by `render/buffer.ts:159` (`text()`) and `render/osc.ts` (hyperlink/clipboard/
  title/notify, lines 33–82). Re-exported from `render/index.ts:35` and the top-level
  `src/engine/index.ts:60`.

### Relevant Files

| File | Purpose | Changes Needed |
| ---- | ------- | -------------- |
| `src/engine/capability/profile.ts` | Caps model + reasons trace | **None** — read only (gate + `dumpCaps`) |
| `src/engine/host/types.ts`, `host.ts` | Host facts + crash-restore | **None** — reuse `handleFatal` for AC-6. Note: `host.isTTY` is populated only inside `start()` (`host.ts:138`), so it is **not** usable pre-gate (PF-001) |
| `src/engine/host/streams.ts`, `host/index.ts` | Stream/TTY detection (`bindStreams`) | **Add** `detectTty(options?)` — factored from `bindStreams` (ephemeral open+dispose); re-export from `host/index.ts` (PF-001) |
| `src/engine/input/events.ts` | `InputEvent` shapes, `KEY_NAMES`, `PASTE_CAP_BYTES` | **None** — read only |
| `src/engine/render/sanitize.ts` | Provisional sanitizer | **Move** → `src/engine/safety/sanitize.ts` (verbatim); delete original |
| `src/engine/render/buffer.ts` | `text()` sanitizes | Update import: `./sanitize.js` → `../safety/sanitize.js` (`buffer.ts:20`) |
| `src/engine/render/osc.ts` | OSC features sanitize | Update import: `./sanitize.js` → `../safety/sanitize.js` (`osc.ts:16`) |
| `src/engine/render/index.ts` | Render re-exports | Drop `sanitize` re-export (`index.ts:35`); update module JSDoc (`:8`) |
| `src/engine/index.ts` | Public entry point | Move `sanitize` re-export from render block to a new `safety/` block (`:60`) |
| `src/engine/safety/*` | RD-08 subsystem | **New** — `essentials.ts`, `errors.ts`, `logger.ts`, `redact.ts`, `sanitize.ts`, `index.ts` |
| `test/render-security.spec.test.ts` | RD-04 oracle (sanitize via render paths) | Update sanitize import path (`:16`) — mechanical, behavior-preserving |
| `test/render-sanitize.impl.test.ts` | sanitize unit edge cases | Relocate → `test/safety-sanitize.impl.test.ts`; update import (`:10`) |

### Code Analysis

**The host's crash path already satisfies AC-6's restore-before-exit** (`host.ts:113`):

```ts
function handleFatal(err: unknown): void {     // host.ts:114
  if (!adapter) return;
  restore?.run();                  // leave modes, raw off, main screen — BEFORE exit
  adapter.writeError(formatError(err));         // stderr diagnostic (never raw input)
  options.onBeforeExit?.(1);
  adapter.exit(1);                  // adapter.exit is typed `never`
}
```

RD-08 adds no run loop; an error thrown from the app's own draw loop surfaces as an
`uncaughtException`, reaching `handleFatal`. The AC-6 test drives this via the RD-07 fake
`RuntimeAdapter` (already used by the host suite) and asserts the captured writes show the
leave sequence before the recorded exit code — throwing an RD-08 typed error to make the link
to RD-08 explicit.

**The redaction discriminator is exact, not heuristic:** `KeyEvent.codepoint` is present iff the
key is printable, so `redactEvent()` branches on `codepoint === undefined` (named key → log
`key`) vs defined (printable → drop `key`/`codepoint`, emit `printable:true`).

## Gaps Identified

### Gap 1: No essentials gate
**Current:** `host.start()` enters modes regardless of whether the terminal can support them.
**Required:** A pure `evaluateEssentials(caps, facts)` + throwing `assertEssentials(...)` that
refuses to start on a non-interactive terminal and reports non-essential degradations, where
`facts` comes from `detectTty()` (host.isTTY is post-start only, PF-001). *(AR-1, AR-2, AR-8)*

### Gap 2: No screen-safe logging or redaction
**Current:** Nothing logs anywhere.
**Required:** `createLogger()` (file/stderr/ring sinks, env-gated, UI-stream-refusing) + pure
`redactEvent()` and `dumpCaps()`. *(AR-5, AR-6, AR-9, AR-10, AR-14)*

### Gap 3: No typed error model
**Current:** The host throws/propagates native errors and writes ad-hoc stderr strings.
**Required:** `TuiError` base, `EssentialsNotMetError`, `LoggerConfigError`. *(AR-7)*

### Gap 4: Sanitizer lives under render/ (a security primitive in a rendering module)
**Current:** `render/sanitize.ts`, re-exported from the render surface.
**Required:** Canonical `safety/sanitize.ts`; render imports it; public re-export unchanged. *(AR-3, AR-13)*

### Gap 5: Paste cap lacks RD-08 acceptance coverage
**Current:** Enforced in the decoder, but its boundary/DoS behavior is RD-06-tested, not framed
as RD-08's security boundary.
**Required:** AC-7 boundary + AC-8 DoS tests in RD-08's suite; no new runtime code. *(AR-11)*

## Dependencies

### Internal Dependencies
- RD-02 `CapabilityProfile` + `CapabilityReasons` (read by the gate and `dumpCaps`).
- RD-07 `Host` (`isTTY`) + its guaranteed-restore crash path (AC-6) + fake `RuntimeAdapter` (tests).
- RD-06 `InputEvent`/`KeyEvent`/`KEY_NAMES`/`PasteEvent`/`PASTE_CAP_BYTES` (redaction + paste-cap tests).
- RD-04 `render/buffer.ts` + `render/osc.ts` (sanitize consumers to rewire).

### External Dependencies
- None. Node built-ins only (`node:fs` for the file sink, `node:test`/`node:assert/strict` for
  tests). Zero runtime dependencies; the `check:deps` guard still applies.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Relocating `sanitize` breaks the RD-04 `render-security.spec.test.ts` oracle | Med | High | Move is behavior-preserving (strip-only, same signature); only the import path changes. The oracle must stay green — if it fails, the relocation is wrong (AR-13). |
| File sink writes could accidentally hit the UI stream and corrupt the screen | Low | High | `createLogger()` resolves the sink's fd and throws `LoggerConfigError` when it equals the UI stream fd (AC-7, AR-10). |
| A printable key's character leaks into a log via an overlooked field | Low | High | `redactEvent()` is pure and allowlist-shaped: for printable keys it emits only `{type, printable, ctrl, alt, shift}` — `key`/`codepoint` are never copied. Dedicated security spec test (AR-9). |
| Logger left enabled by default writes during a normal run (AC-5) | Low | Med | Disabled unless `BLENDTUI_DEBUG=1`; disabled path returns a no-op `Logger`; spec test asserts zero bytes (AR-10, AR-14). |
| `dumpCaps` accidentally includes secret-ish data | Low | Med | It reads only the `profile` values + `reasons` layer names (no input/clipboard/title text); spec test asserts no event/paste content present (AR-6). |
