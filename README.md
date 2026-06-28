# @blendsdk/tui

An SDK for building **Turbo Vision-style terminal applications** in TypeScript.

This package is the **foundation** of the SDK (RD-01): a clean, typed,
tree-shakeable **ESM-only** library with **zero runtime dependencies**. The
capability, input, rendering, host, and safety subsystems are added by later
milestones and re-exported from this package's single public entry point.

> ## 🚧 Under heavy development
>
> **`@blendsdk/tui` is pre-1.0 (`0.1.0`) and under heavy active development.** The
> public API is still being built out and **may change between minor versions** —
> pin an exact version if you depend on it. Some capabilities are verified only on
> Linux/macOS so far (see the [acceptance gate](docs/acceptance-gate.md)). **Not yet
> recommended for production use.**

## Install

```bash
npm install @blendsdk/tui-core
```

**Requirements:** Node.js **>= 20** (active LTS: 20, 22, 24).

## Usage

`@blendsdk/tui` is **ESM-only**. Import it from an ES module:

```ts
import { VERSION } from '@blendsdk/tui-core';

console.log(VERSION); // "0.1.0"
```

Type declarations (`.d.ts`) and source maps ship with the package, so editors get
full type information out of the box.

### Capability detection (RD-02)

`resolveCapabilities()` detects the running terminal and returns an immutable
`CapabilityProfile` plus a per-field **reason trace** showing which layer set each
field. Detection is layered with safe fallback — **(1)** explicit override,
**(2)** live runtime query, **(3)** environment, **(4)** known-terminal table,
**(5)** conservative defaults — so every later subsystem auto-configures with zero
setup.

```ts
import { resolveCapabilities } from '@blendsdk/tui-core';

// Zero-config: detect from env + known-terminal table + safe defaults.
const { profile, reasons } = resolveCapabilities();
profile.colorDepth; // 'truecolor' | '256' | '16' | 'mono'
reasons.colorDepth; // 'override' | 'runtime' | 'env' | 'table' | 'default'

// Force fields (deep partial, merged over detection).
resolveCapabilities({ override: { mouse: { sgr: false } } }).profile.mouse.sgr; // false

// Re-resolve after a detected terminal change (otherwise cached per process).
resolveCapabilities({ refresh: true });
```

`NO_COLOR` (any value) forces `mono`; `FORCE_COLOR=0|1|2|3` selects
`mono|16|256|truecolor`. The result is deep-frozen, and no environment value is
ever logged.

The live runtime query (layer 2) is asynchronous and bounded. RD-02 ships the
injectable `TerminalQuery` seam and the response parser; the real input stream is
wired in by a later milestone (RD-06). Supply a query via the async resolver:

```ts
import { resolveCapabilitiesAsync } from '@blendsdk/tui-core';

// `query` implements TerminalQuery; resolution is bounded by `timeoutMs`
// (default 200 ms) and never hangs on a silent terminal.
const { profile } = await resolveCapabilitiesAsync({ query, timeoutMs: 200 });
```

### Input decoding (RD-06)

`decode()` turns raw terminal bytes into typed input events. It is a **pure**
function of `(bytes, state)` — no timers, no I/O, no logging — so it is
chunk-boundary-safe and replayable. Feed each chunk and thread the returned
`state` forward; query responses (DA, `?2026`, XTVERSION) are routed to a
**separate `queries` array** so a terminal reply can never leak as a keystroke.

```ts
import { createDecoderState, decode, flush, createKeymap } from '@blendsdk/tui-core';

let state = createDecoderState();

// A CSI sequence split across two stdin chunks decodes once, on completion.
state = decode(Uint8Array.from([0x1b, 0x5b]), state).state; // "ESC [" — carried
const { events } = decode(Uint8Array.from([0x41]), state); // "A" → completes
events[0]; // { type: 'key', key: 'up', ctrl: false, alt: false, shift: false }
```

Events are a discriminated union: `key`, `mouse` (SGR, 1-based coords), `wheel`,
`paste` (a bracketed paste delivered as one event, size-capped), and `focus`.
A lone trailing `ESC` is held ambiguous; the host arms an `ESC_TIMEOUT_MS` (50 ms)
timer and calls `flush(state)` to emit the Escape key if no sequence follows.

An optional pluggable keymap names chords over the events you already received:

```ts
const keymap = createKeymap({ 'ctrl+s': 'save', 'alt+x': 'exit' });
keymap.lookup({ type: 'key', key: 's', ctrl: true, alt: false, shift: false }); // 'save'
```

Classic xterm decoding ships now; CSI-u / Kitty keyboard-protocol parsing is a
later enhancement (the `caps.keyboard.kittyFlags` branch falls back to classic).

### Rendering (RD-04)

Draw into a width-correct `ScreenBuffer`, then `serialize()` the minimal ANSI to
paint it over the previous frame. `serialize()` is a **pure** function of
`(current, previous, options)` — bytes are proportional to what changed (a single
changed cell costs under ~32 bytes), and two identical frames cost nothing. The
host holds the previous frame and performs the actual write.

```ts
import { ScreenBuffer, serialize, resolveCapabilities } from '@blendsdk/tui-core';

const { profile: caps } = resolveCapabilities();
const style = { fg: '#c0c0c0', bg: '#000080' };

const prev = new ScreenBuffer(80, 24, { fg: 'default', bg: 'default' });
const next = new ScreenBuffer(80, 24, { fg: 'default', bg: 'default' });
next.box(0, 0, 20, 5, style, 'double', 'Hello');
next.text(2, 2, '世界 — wide-aware', style); // CJK occupies two columns each

process.stdout.write(serialize(next, prev, { caps })); // only the box + text emit
```

Output adapts to the detected terminal: box/half-block glyphs fall back to ASCII
(`+ - | #`) when unsupported, non-UTF-8 glyphs become `?`, and the frame is
wrapped in synchronized-output markers (`?2026`) when available. Color is encoded
through an injectable `StyleEncoder` seam — the RD-05 depth-aware encoder
(truecolor→256→16→mono) is the default; an app can still inject its own (see
_Color & styling_).

Every text-accepting path routes through `sanitize()` (the injection boundary):
`buffer.text()`, the OSC features (`hyperlink`, `setClipboard`, `setTitle`,
`notify`), and the window title all strip `ESC`/`BEL`/`ST`/C0/C1 control bytes so
untrusted text cannot inject an escape sequence. `notify()` picks the best
available protocol (Kitty OSC 99 → iTerm2 OSC 9 → urxvt OSC 777 → progress → BEL).

```ts
import { notify, setClipboard, cursor } from '@blendsdk/tui-core';

notify('Build', 'done ✓', caps); // → the terminal's best notification protocol
setClipboard('copied text', caps); // → OSC 52 (base64), when supported
cursor.hide() + cursor.to(1, 1) + cursor.show(); // 1-based absolute move
```

### Color & styling (RD-05)

The color layer turns app-specified colors into the **right** ANSI for the
terminal you actually have — `encode(color, role, depth)` downsamples
**truecolor → 256 → 16 → mono** instead of assuming 24-bit, which is what fixes
"colors all wrong over SSH from a Mac." Nearest-color mapping uses a deterministic
redmean weighted distance; corner colors (pure black/white) are exact.

```ts
import { encode, encodeStyle, PALETTE } from '@blendsdk/tui-core';

encode('#0000a8', 'bg', 'truecolor'); // '\x1b[48;2;0;0;168m'
encode('#0000a8', 'bg', '256'); // '\x1b[48;5;19m'  (nearest cube index)
encode('#0000a8', 'bg', '16'); // '\x1b[44m'        (nearest ANSI blue)
encode('#0000a8', 'bg', 'mono'); // ''              (attributes only)
```

`encodeStyle(fg, bg, attrs, caps)` is the seam the renderer uses: it merges
attributes + fg + bg into one SGR for `caps.colorDepth` and is the `serialize()`
default, so **rendering downsamples with zero configuration**. Attributes
(`bold|dim|italic|underline|blink|reverse|strike`, the RD-04 `Attr` bits) are
always emitted — at `mono` depth no color is sent but `reverse`/`bold` still
convey state, keeping `NO_COLOR` UIs legible.

```ts
import { Attr, ScreenBuffer } from '@blendsdk/tui-core';
const buf = new ScreenBuffer(80, 24, { fg: 'default', bg: 'default' });
buf.text(2, 1, 'Saved', { fg: PALETTE.brightGreen, bg: 'default', attrs: Attr.bold });
// serialize(buf, prev, { caps }) now downsamples brightGreen to the detected depth.
```

Colors are **validated**: a malformed color (`encode('#zzz', …)`) throws
`InvalidColorError` (a `TuiError`) and emits no bytes, so a bad color can never leak
into the escape stream; encoders only ever emit numeric SGR. Inside the render loop
the encoder degrades a bad cell color to no-color rather than crashing. The DOS-16
`PALETTE` and a typed `defaultTheme` (the classic Borland look) ship as primitives
for the Turbo Vision style. `styleKey(fg, bg, attrs)` gives a stable per-style key
for run-merging.

> `NO_COLOR`/`FORCE_COLOR` are already resolved into `caps.colorDepth` by RD-02, so
> the color layer just honors the detected depth.

### Host & lifecycle (RD-07)

`createHost()` is the native `tty` host that owns the terminal: it puts stdin in
raw mode, enters the alternate screen and the mouse / bracketed-paste / focus
modes the detected `caps` allow, pumps stdin through the RD-06 decoder, hands each
frame to the RD-04 serializer as one coalesced write, and — above all —
**guarantees the terminal is restored on every exit path**: normal `stop()`,
`SIGINT`/`SIGTERM`/`SIGHUP`, suspend/resume, uncaught exceptions, EPIPE, and even a
synchronous crash during setup.

```ts
import { createHost, resolveCapabilities, ScreenBuffer, createKeymap } from '@blendsdk/tui-core';

const { profile: caps } = resolveCapabilities();
const keymap = createKeymap({ 'ctrl+c': 'quit' });

const host = createHost({
  caps,
  onInput: (e) => {
    if (e.type === 'key' && keymap.lookup(e) === 'quit') void host.stop();
  },
  onResize: ({ columns, rows }) => draw(columns, rows),
  onResume: () => draw(process.stdout.columns ?? 80, process.stdout.rows ?? 24),
});

await host.start(); // raw mode, alt-screen, modes per caps
function draw(cols: number, rows: number): void {
  const frame = new ScreenBuffer(cols, rows, { fg: 'default', bg: 'default' });
  frame.text(2, 1, 'Hello — Ctrl-C to quit', { fg: '#c0c0c0', bg: 'default' });
  host.render(frame); // serialize(diff) → single coalesced write
}
draw(process.stdout.columns ?? 80, process.stdout.rows ?? 24);
// SIGINT/SIGTERM/SIGHUP/throw → terminal restored, process exits with the right code.
```

`render(buffer)` owns the previous frame, the diff, and the write; the app never
touches `serialize` or the stream. Input arrives as decoded `InputEvent`s through
`onInput` (terminal query replies are routed away so they can never be read as
keystrokes); resize is coalesced to one `onResize`; `onSuspend`/`onResume` bracket
SIGTSTP/SIGCONT with an automatic full repaint on resume. The host owns
`process.exit` on signal/crash paths (`exitOnSignal: false` opts out, with an
`onBeforeExit(code)` hook); `stop()` restores without exiting and is idempotent.

Every OS effect (raw mode, signals, exit, timers, the sync `'exit'` backstop) sits
behind an injectable `RuntimeAdapter`, so an app can run the host headlessly in
tests; the real adapter is the default. A non-TTY host skips mode setup but still
writes frames, and exposes `isTTY` for the caller's degrade policy. On Windows the
host uses the `stdout 'resize'` event, `SIGBREAK`, and VT processing in place of
the POSIX signals; Windows acceptance awaits a Windows runner.

### Safety: essentials gate, logging & errors (RD-08)

The `safety` subsystem decides whether the SDK may run, keeps secrets out of logs,
and owns the canonical injection boundary. Everything here is **pure and
injectable** — no global state, disabled by default.

**Essentials gate.** Before `start()`, evaluate the terminal against the runtime
essentials. The single hard requirement is an **interactive TTY**; missing mouse,
color, or alt-screen are **degradations** the SDK runs around, never hard stops.
TTY facts come from the additive `detectTty()` probe (a real terminal can be
detected even when stdout is piped, via `/dev/tty`), because `host.isTTY` is only
valid after `start()`.

```ts
import { detectTty, assertEssentials, resolveCapabilities, createLogger } from '@blendsdk/tui-core';

const { profile: caps } = resolveCapabilities();
const facts = { isTTY: detectTty() };

// Throws EssentialsNotMetError on a pipe (before any mode is entered — nothing
// to restore); returns a report with any degradations otherwise.
const report = assertEssentials(caps, facts, { logger: createLogger({ sink: 'ring' }) });
report.degradations; // e.g. [{ cap: 'mouse', mode: 'keyboard-only', message: '…' }]

// Pure variants for custom flows:
import { evaluateEssentials, essentialsMet } from '@blendsdk/tui-core';
evaluateEssentials(caps, facts); // { met, missing, degradations } — never throws
essentialsMet(caps, facts); // boolean
```

**Screen-safe logger.** A TUI owns the screen, so the logger physically refuses
any sink that resolves to the UI stream (throws `LoggerConfigError` at
construction). It is **disabled by default** — a normal run writes zero bytes —
and gated by env: set `BLENDTUI_DEBUG=1` to enable, `BLENDTUI_LOG=<path>` to write
to a file (else stderr when it is not the UI). Levels are `error|warn|info|debug`;
the in-memory `ring` sink is always available for tests.

```ts
const log = createLogger(); // disabled unless BLENDTUI_DEBUG=1
log.debug('input', 'event', { count: 3 }); // no-op when disabled
```

**Redaction.** `redactEvent()` reduces an input event to a log-safe shape: a
printable key logs only `{ printable: true, ctrl, alt, shift }` (never the
character or codepoint), a paste logs only its length, and mouse/wheel/focus pass
their non-secret coordinates. `dumpCaps()` renders a one-line, secret-free
capabilities summary from the RD-02 reason trace.

```ts
import { redactEvent } from '@blendsdk/tui-core';
redactEvent({ type: 'key', key: 'a', codepoint: 0x61, ctrl: false, alt: false, shift: false });
// → { type: 'key', printable: true, ctrl: false, alt: false, shift: false }
```

**Sanitizer & errors.** `sanitize()` (the injection boundary used by every
text-accepting render path — see _Rendering_) is the canonical safety primitive
and lives here. The error model is a single `TuiError` base with
`EssentialsNotMetError` (carries the unmet essentials) and `LoggerConfigError`, so
a consumer can `catch (e) { if (e instanceof TuiError) … }`. An uncaught error
through the host's loop restores the terminal **before** the process exits.

### Live terminal query (RD-03)

`createTerminalQuery()` is the real, tty-backed implementation of the layer-2
`TerminalQuery` seam — it writes query requests to the terminal and yields the
response bytes — so `resolveCapabilitiesAsync()` can refine the profile from live
responses (e.g. synchronized-output `?2026`), not just env/table heuristics.

```ts
import { createTerminalQuery, resolveCapabilitiesAsync } from '@blendsdk/tui-core';

// The caller owns raw mode; the adapter only reads/writes bytes and never
// changes terminal state. Always close() it when done to release the listener.
const query = createTerminalQuery({ input: process.stdin, output: process.stdout });
try {
  const { profile } = await resolveCapabilitiesAsync({ query });
  // profile.sync2026 etc. now reflect the terminal's actual replies
} finally {
  query.close();
}
```

### Capability probe & survey harness (RD-03)

A dev-only diagnostic harness lives under `examples/capability-probe/` (not part of
the published package). It probes **every** capability the SDK cares about and
reports what actually works on the running terminal — automatic query-based probes
first, then guided manual confirmation (color swatches, attributes, glyphs,
Unicode alignment, OSC notifications/hyperlinks/clipboard/title), then a live
decoded-input readout — and emits a JSON + table report, accumulating a checked-in
`terminal-matrix.json` evidence base. It runs non-destructively (alt-screen with
guaranteed restore) and never stops on a missing capability.

```bash
# the probe harness lives in the private @blendsdk/tui-examples package
yarn workspace @blendsdk/tui-examples probe                 # interactive survey (appends the matrix)
yarn workspace @blendsdk/tui-examples probe --auto > out.json  # non-interactive: auto facts only
yarn workspace @blendsdk/tui-examples probe --out r.json --no-matrix  # standalone JSON; skip matrix
```

Flags: `--auto` (CI mode, manual items left unverified), `--out <path>` (standalone
JSON copy), `--no-matrix` (skip the `terminal-matrix.json` append), `--help`. The
report records only terminal/OS plus `TERM`/`COLORTERM`/`TERM_PROGRAM` — no secrets,
and paste events report a byte length, never contents.

### Testing & acceptance gate (RD-09)

The foundation is proven by a four-tier test strategy plus a runnable **project
go/no-go gate**. Terminal I/O is "bytes in → bytes out", so most of the engine is
pure functions and unusually testable.

- **Tier 1 — recorded input corpus**: checked-in hex-in-JSON fixtures of
  `bytes → expected events/queries` (`test/fixtures/input-corpus/`) drive a
  data-driven decoder regression — keyboard, SGR mouse (incl. beyond column 223),
  wheel, paste, and DA/DECRPM/XTVERSION replies (the last asserted on the isolated
  `queries` channel).
- **Tier 2 — golden-screen**: a buffer is serialized and fed to `@xterm/headless`
  (a pure-JS emulator), then the grid is read back and asserted across all four
  colour depths (truecolor/256/16/mono), proving the RD-05 downsample chain renders
  correctly in a real emulator.
- **Tier 3 — PTY-style integration** (no `node-pty`): a real child process runs the
  real `createHost`; captured output proves alt-screen/mouse enter and full restore
  on normal exit, `throw`, SIGTERM, and SIGHUP.
- **Fuzz + performance**: a seeded fuzzer feeds adversarial byte streams to the
  decoder (no throw, bounded state), and a byte-proportionality benchmark asserts
  `serialize` output bytes track changed cells (the deterministic half of the perf
  gate; wall-clock budgets are deferred to RD-10).

The corpus, golden, fuzz, and byte-proportionality suites run under `yarn verify`;
the Tier-3 integration lives in `test/host-tier3.e2e.test.ts` (explicit, outside the
unit glob).

```bash
yarn gate    # the full go/no-go gate: verify + e2e + probe --auto, per-criterion verdict
```

`yarn gate` (`scripts/gate.mjs`) prints PASS/FAIL/DEFERRED for each of the 11
RD-09 criteria and exits non-zero if any required one fails. The criteria→evidence
map lives in [`docs/acceptance-gate.md`](docs/acceptance-gate.md). Cross-platform CI
cells, macOS/Windows acceptance, the Tier-4 manual matrix, real-PTY SIGWINCH resize,
and wall-clock perf budgets are recorded **DEFERRED** (DEF-1…DEF-4), pending a git
remote, the other platforms, and RD-10.

### ESM-only — `require()` is not supported

The package declares no CommonJS `require` condition. Importing it from CommonJS
fails with a clear ESM error:

```js
// ❌ throws ERR_REQUIRE_ESM
const { VERSION } = require('@blendsdk/tui-core');
```

Use `import` (or a dynamic `await import('@blendsdk/tui-core')`) instead.

## Versioning & stability

`@blendsdk/tui` follows [Semantic Versioning](https://semver.org/). All notable
changes are recorded in [`CHANGELOG.md`](CHANGELOG.md) (Keep a Changelog format).

- **SemVer.** While the package is pre-1.0 it is in active development: the public
  API may change between **minor** versions (consistent with the heavy-development
  notice above). From 1.0 onward, breaking changes ship only in a **major** release.
- **Public surface.** The exports of `src/engine/index.ts` (the package entry
  point) are the contract. Everything else — any deep import into `src/engine/**`
  internals — is **not** part of the public API and may change at any time.
- **Deprecation policy.** A symbol slated for removal is first marked
  `@deprecated` (JSDoc) for **at least one minor release**, then removed in the
  next **major**. Every removal is recorded under that version in `CHANGELOG.md`.

## Monorepo layout

This repository is a **yarn 1.x + Turborepo monorepo**:

```
packages/tui-core/      @blendsdk/tui-core — the published foundation engine
packages/tui-examples/  @blendsdk/tui-examples — private dev examples + probe harness
docs/  scripts/  .github/   shared docs, tooling, and CI at the root
```

New packages are published as `@blendsdk/tui-<name>` under `packages/tui-<name>/`,
and all **public** packages share one lockstep version (`yarn sync-versions`).

## Contributing

The toolchain is yarn workspaces + Turborepo orchestration; tests run on **vitest**.

| Command              | What it does                                                      |
| -------------------- | ----------------------------------------------------------------- |
| `yarn verify`        | `turbo run typecheck build test` across packages — must exit 0    |
| `yarn gate`          | The RD-09 go/no-go gate: verify + e2e + probe, per criterion      |
| `yarn lint`          | ESLint + Prettier (check only, repo-wide)                         |
| `yarn lint:fix`      | ESLint `--fix` + Prettier `--write`                               |
| `yarn check:deps`    | Fail if any runtime dependency requires native build steps        |
| `yarn sync-versions` | Write the root version to all public packages (`--check` to lint) |
| `yarn bench`         | Print frame perf median/p95 (200×50) — informational (RD-10)      |

> **Performance (RD-10).** `yarn bench` reports the 200×50 compose+diff median/p95
> (informational; it never fails). The 16 ms frame-budget ceiling is asserted
> off-CI by `packages/tui-core/test/perf-budget.spec.test.ts` and auto-skips its
> hard assertion under `CI` or when `TUI_SKIP_PERF` is set; CI runs the bench
> informationally on one matrix cell.

Tests follow a strict split:

- `*.spec.test.ts` — specification tests; an immutable oracle derived from the
  requirements/acceptance criteria.
- `*.impl.test.ts` — implementation/edge-case tests.

Both run via `yarn test` (vitest `unit` project). Heavier end-to-end tests end in
`*.e2e.test.ts` and run in the vitest `e2e` project (via `yarn test:e2e` or `yarn gate`):

```bash
yarn workspace @blendsdk/tui-core test:e2e      # restore-on-exit, signals, pack + clean-install
yarn workspace @blendsdk/tui-examples test:e2e  # the probe harness e2e
```

## License

[MIT](LICENSE)
