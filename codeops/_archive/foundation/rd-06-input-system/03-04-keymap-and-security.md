# 03-04: Keymap & Security

> **Document**: 03-04-keymap-and-security.md
> **Parent**: [Index](00-index.md)
> **Decisions**: PL-5, PL-6, PL-7, PL-10

The optional chord-naming convenience and the consolidated security posture. Files:
`src/engine/input/keymap.ts`, `src/engine/input/index.ts`, and security behaviour
spread across `decoder.ts`/`paste.ts`.

## Pluggable keymap (keymap.ts, PL-7, PL-10)

A pure, stateless convenience over raw `KeyEvent`s.

```ts
/** A compiled keymap: pure lookup from a decoded KeyEvent to a bound name. */
export interface Keymap {
  /** Returns the bound name for the event's chord, or undefined if unbound. */
  lookup(event: KeyEvent): string | undefined;
}

/** Build a keymap from chord→name bindings. */
export function createKeymap(bindings: Readonly<Record<string, string>>): Keymap;
```

### Chord grammar (PL-10)
A binding key is `'+'`-joined, lowercased: zero or more modifiers (`ctrl`, `alt`,
`shift`) followed by exactly one key name (a named key from 03-01 or a single
character). Examples: `'ctrl+s'`, `'alt+x'`, `'ctrl+shift+up'`, `'up'`, `'q'`.

### Lookup semantics
- `createKeymap` parses each binding once into a canonical key (sorted modifiers +
  key) → name map. Invalid bindings (no key, unknown modifier) throw at build time
  (fail fast, input validation).
- `lookup(event)` canonicalises the event the same way and returns the bound name or
  `undefined`. Pure — no state, no side effects, trivially unit-testable.
- The keymap is a **convenience only**: it never consumes or alters the event
  stream; apps call it on `KeyEvent`s they already received.

## Public API surface (index.ts)

`src/engine/input/index.ts` re-exports the input subsystem's public symbols, and
`src/engine/index.ts` re-exports them from the package entry point:

```ts
// decoder
export { createDecoderState, decode, flush } from './decoder.js';
// keymap
export { createKeymap } from './keymap.js';
// types & constants
export type {
  KeyEvent, MouseEvent, WheelEvent, PasteEvent, FocusEvent, InputEvent,
  QueryResponse, DecodeResult, DecoderState, DecodeOptions, Keymap,
} from './events.js';
export { ESC_TIMEOUT_MS, PASTE_CAP_BYTES } from './events.js';
```

## Security posture (AC-7, AC-8)

Consolidated from the per-component docs; every item is from the first line of code.

| Concern | Control | Ref |
| ------- | ------- | --- |
| Secrets in keystrokes/paste | **Never log raw input** at default level; no `console.*` of bytes/text | AC-8 |
| Paste retention | Paste bytes discarded after the single `PasteEvent`; not retained | AC-8 |
| Paste flood / DoS | `PASTE_CAP_BYTES` (1 MiB) cap; over-cap content dropped, `truncated:true` | PL-5, AC-7 |
| Unterminated-sequence flood | Carry bounded by `RESPONSE_BUFFER_CAP` (1024); overflow → drop & resync | PL-6, AC-7 |
| Malformed/adversarial bytes | Allowlist grammar matching only; unrecognised bytes dropped safely, no crash | AC-7, AC-8 |
| Injection | Input decoded, never echoed/executed; query replies isolated to `queries` | AC-6, AC-8 |
| Code execution | No `eval`, no dynamic dispatch on terminal data | AC-8 |
| Determinism | Pure functions → replayable under a fuzz corpus with no unbounded memory | AC-8 |

### Fuzz expectation (AC-8, ST-9)
A corpus of random and adversarial byte streams (truncated sequences, giant
unterminated CSIs, nested/incomplete pastes, invalid UTF-8, interleaved query
replies) fed through `decode()` in arbitrary chunk splits must:
- never throw;
- never grow `rest` past `RESPONSE_BUFFER_CAP` or the paste buffer past the cap;
- never emit a query reply as a `KeyEvent`;
- never log raw bytes at default level.

Invalid UTF-8 bytes that cannot form a code point are dropped (not emitted as a
key), keeping decoding total and crash-free.
