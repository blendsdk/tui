# API Design & Reference

> **Last Updated**: 2026-06-28

## API Style

`@blendsdk/tui` is an **ESM-only TypeScript library**. The public contract is the
set of exports of `src/engine/index.ts` — the single entry point. Everything else
under `src/engine/**` is internal and may change without a major bump (see the
README "Versioning & stability" policy and [ADR-001](/decisions/ADR-001-esm-zero-dependency)).

- **Module system**: ESM only; `require()` is unsupported (no CommonJS condition).
- **Import specifiers**: NodeNext — `.js` extensions on source imports.
- **Stability**: pre-1.0 the surface may change between minors; the index exports
  are the contract, internals are not.

## Conventions

- **Pure where possible**: rendering, decoding, and colour encoding are pure
  functions. The only stateful API is the host.
- **Injectable seams**: capabilities (`TerminalQuery`), the runtime
  (`RuntimeAdapter`), and the style encoder (`StyleEncoder`) are all injectable —
  tests pass fakes, production passes real implementations.
- **Frozen results**: a resolved `CapabilityProfile` is deeply frozen.
- **Typed errors**: failures throw subclasses of `TuiError`.

## Public Surface by Subsystem

The reference below groups the `src/engine/index.ts` exports. Each symbol carries
JSDoc in source (purpose, params, returns, side effects).

### Package

| Symbol    | Kind  | Summary                              |
| --------- | ----- | ------------------------------------ |
| `VERSION` | const | The package version string (SemVer). |

### Capability detection (RD-02)

| Symbol                                                                           | Kind | Summary                                                                       |
| -------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| `resolveCapabilities(options)`                                                   | fn   | Resolve a frozen `CapabilityProfile` from env/platform/table/override (sync). |
| `resolveCapabilitiesAsync(options)`                                              | fn   | As above plus a bounded layer-2 live `TerminalQuery`.                         |
| `CapabilityProfile`, `CapabilityResolution`, `CapabilityReasons`                 | type | The resolved profile, result, and per-field provenance.                       |
| `ColorDepth`, `GlyphCaps`, `KeyboardCaps`, `MouseCaps`, `OscCaps`, `UnicodeCaps` | type | Capability field shapes.                                                      |
| `ResolveOptions`, `SyncResolveOptions`, `TerminalQuery`                          | type | Inputs + the live-query seam.                                                 |
| `Platform`, `ReasonLayer`, `DeepPartial`                                         | type | Supporting types.                                                             |

### Input decoder (RD-06)

| Symbol                                                                                            | Kind  | Summary                                                          |
| ------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------- |
| `createDecoderState()`                                                                            | fn    | Create the mutable decoder carry state.                          |
| `decode(bytes, state, options)`                                                                   | fn    | Decode a byte chunk into `InputEvent`s (pure transform + carry). |
| `flush(state)`                                                                                    | fn    | Flush a pending escape/partial sequence at end-of-input.         |
| `createKeymap()`                                                                                  | fn    | Build the default key map.                                       |
| `ESC_TIMEOUT_MS`, `PASTE_CAP_BYTES`                                                               | const | Decoder timing/size bounds.                                      |
| `KeyEvent`, `MouseEvent`, `WheelEvent`, `PasteEvent`, `FocusEvent`, `InputEvent`, `QueryResponse` | type  | Decoded event shapes.                                            |
| `DecodeResult`, `DecoderState`, `DecodeOptions`, `Keymap`                                         | type  | Decoder I/O types.                                               |

### Rendering engine (RD-04)

| Symbol                                                                                           | Kind     | Summary                                                                 |
| ------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------- |
| `ScreenBuffer`                                                                                   | class    | Width-correct cell grid; `set`/`text`/`fillRect`/`box`/`shadow`/`rows`. |
| `serialize(current, previous, options)`                                                          | fn       | Pure damage-diff → minimal ANSI (bytes ∝ damage).                       |
| `defaultEncodeStyle`                                                                             | const    | The default `StyleEncoder` (RD-05 `encodeStyle`).                       |
| `fallbackGlyph(char, caps)`                                                                      | fn       | Capability-driven ASCII glyph fallback.                                 |
| `Attr`                                                                                           | const    | Attribute bit flags (`bold`, `reverse`, …).                             |
| `charWidth(cp, mode)`                                                                            | fn       | Display width of a code point.                                          |
| `hyperlink`, `setClipboard`, `setTitle`, `bell`, `notify`                                        | fn       | OSC feature emitters.                                                   |
| `cursor`, `CSI`, `SGR_RESET`, `SYNC_BEGIN`, `SYNC_END`, `cursorTo`                               | const/fn | Cursor + low-level ANSI helpers.                                        |
| `Cell`, `Style`, `Color`, `Ansi16Name`, `AttrMask`, `WidthMode`, `StyleEncoder`, `RenderOptions` | type     | Render data + option types.                                             |

### Color & styling (RD-05)

| Symbol                                   | Kind  | Summary                                                                 |
| ---------------------------------------- | ----- | ----------------------------------------------------------------------- |
| `encode(color, role, depth)`             | fn    | Encode one colour to a standalone SGR for a depth.                      |
| `encodeStyle(fg, bg, attrs, caps)`       | fn    | Merge attrs + fg + bg into one depth-aware SGR (the serialize default). |
| `styleKey(fg, bg, attrs)`                | fn    | Stable key for a style (cache/dedup).                                   |
| `nearest256(rgb)`, `nearest16(rgb)`      | fn    | Redmean nearest-colour downsampling.                                    |
| `InvalidColorError`                      | class | Thrown on malformed colour input (extends `TuiError`).                  |
| `PALETTE`, `defaultTheme`                | const | DOS-16 palette + typed default theme.                                   |
| `ColorRole`, `Rgb`, `Theme`, `ThemeRole` | type  | Colour/theme types.                                                     |

### Host & lifecycle (RD-07) — the only stateful subsystem

| Symbol                                                                                                                                               | Kind | Summary                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------- |
| `createHost(options)`                                                                                                                                | fn   | Native tty host: raw mode, alt-screen, signals, guaranteed restore. |
| `detectTty(streams)`                                                                                                                                 | fn   | Pre-start TTY probe (RD-08 PF-001).                                 |
| `createTerminalQuery(options)`                                                                                                                       | fn   | Real tty-backed `TerminalQuery` (completes RD-02 layer-2).          |
| `Host`, `HostOptions`, `ResizeEvent`, `RuntimeAdapter`, `HostSignal`, `TimerHandle`, `StreamOptions`, `TerminalQueryOptions`, `ManagedTerminalQuery` | type | Host API + the injectable runtime seam.                             |

### Safety (RD-08)

| Symbol                                                                                                                                     | Kind  | Summary                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------- |
| `sanitize(str)`                                                                                                                            | fn    | Canonical injection boundary: strip control bytes from untrusted text. |
| `evaluateEssentials(facts)`, `essentialsMet(report)`, `assertEssentials(facts)`                                                            | fn    | The pre-start essentials gate.                                         |
| `createLogger(options)`                                                                                                                    | fn    | Screen-safe logger (never corrupts the alt-screen).                    |
| `redactEvent(event)`, `dumpCaps(caps)`                                                                                                     | fn    | Redaction + capability dump (no secrets/PII).                          |
| `TuiError`, `EssentialsNotMetError`, `LoggerConfigError`                                                                                   | class | Typed error model.                                                     |
| `EssentialsReport`, `Degradation`, `HostFacts`, `Logger`, `LoggerOptions`, `LogLevel`, `LogRecord`, `LogSink`, `LoggerFs`, `RedactedEvent` | type  | Safety types.                                                          |

## Error Handling

All thrown errors extend `TuiError`. Notable cases:

| Error                   | When                                                   | Notes                                                    |
| ----------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| `EssentialsNotMetError` | The essentials gate fails (e.g. non-TTY / `TERM=dumb`) | Degrades, never crashes mid-render                       |
| `InvalidColorError`     | A malformed colour reaches `encode()`                  | The render-path encoder seam degrades crash-safe instead |
| `LoggerConfigError`     | Invalid logger configuration                           | Thrown at logger construction                            |

## Performance Contract

- Composing + diff-serializing a 200×50 frame has a median ≤ 16 ms on a modern dev
  machine (`npm run bench`; enforced off-CI by `test/perf-budget.spec.test.ts`).
- A steady-state single-cell update emits a byte count **independent of screen
  size** (output ∝ damage).
- Capability detection against a non-responding terminal falls back within
  `timeoutMs` + slack.
