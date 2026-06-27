# @blendsdk/tui

An SDK for building **Turbo Vision-style terminal applications** in TypeScript.

This package is the **foundation** of the SDK (RD-01): a clean, typed,
tree-shakeable **ESM-only** library with **zero runtime dependencies**. The
renderer, input, host, and capability subsystems are added by later milestones
and re-exported from this package's single public entry point.

> **Status:** `0.1.0` — pre-1.0. The public API is still being built out and may
> change between minor versions.

## Install

```bash
npm install @blendsdk/tui
```

**Requirements:** Node.js **>= 18** (active LTS: 18, 20, 22).

## Usage

`@blendsdk/tui` is **ESM-only**. Import it from an ES module:

```ts
import { VERSION } from '@blendsdk/tui';

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
import { resolveCapabilities } from '@blendsdk/tui';

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
import { resolveCapabilitiesAsync } from '@blendsdk/tui';

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
import { createDecoderState, decode, flush, createKeymap } from '@blendsdk/tui';

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
import { ScreenBuffer, serialize, resolveCapabilities } from '@blendsdk/tui';

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
through an injectable `StyleEncoder` seam — RD-04 ships a minimal truecolor/mono
default; RD-05 supplies the full depth-aware encoder with no API change.

Every text-accepting path routes through `sanitize()` (the injection boundary):
`buffer.text()`, the OSC features (`hyperlink`, `setClipboard`, `setTitle`,
`notify`), and the window title all strip `ESC`/`BEL`/`ST`/C0/C1 control bytes so
untrusted text cannot inject an escape sequence. `notify()` picks the best
available protocol (Kitty OSC 99 → iTerm2 OSC 9 → urxvt OSC 777 → progress → BEL).

```ts
import { notify, setClipboard, cursor } from '@blendsdk/tui';

notify('Build', 'done ✓', caps); // → the terminal's best notification protocol
setClipboard('copied text', caps); // → OSC 52 (base64), when supported
cursor.hide() + cursor.to(1, 1) + cursor.show(); // 1-based absolute move
```

### ESM-only — `require()` is not supported

The package declares no CommonJS `require` condition. Importing it from CommonJS
fails with a clear ESM error:

```js
// ❌ throws ERR_REQUIRE_ESM
const { VERSION } = require('@blendsdk/tui');
```

Use `import` (or a dynamic `await import('@blendsdk/tui')`) instead.

## Contributing

The toolchain is plain Node tooling — no test framework, just `node:test` run
through `tsx`.

| Command              | What it does                                               |
| -------------------- | ---------------------------------------------------------- |
| `npm run verify`     | `typecheck` + `test` + `build` — must exit 0               |
| `npm run lint`       | ESLint + Prettier (check only)                             |
| `npm run lint:fix`   | ESLint `--fix` + Prettier `--write`                        |
| `npm run check:deps` | Fail if any runtime dependency requires native build steps |
| `npm pack --dry-run` | Inspect the published file set (`dist/` + metadata only)   |

Tests follow a strict split:

- `*.spec.test.ts` — specification tests; an immutable oracle derived from the
  requirements/acceptance criteria.
- `*.impl.test.ts` — implementation/edge-case tests.

Both run via `npm test`. The heavier pack-and-install end-to-end test lives in
`test/install.e2e.test.ts` and is run explicitly:

```bash
npx tsx --test test/install.e2e.test.ts
```

## License

[MIT](LICENSE)
