# 03-02: Keyboard Decoder & State

> **Document**: 03-02-keyboard-decoder-and-state.md
> **Parent**: [Index](00-index.md)
> **Decisions**: PL-1, PL-3, PL-4, PL-6, PL-11, PL-13

The core pure decoder and the classic-xterm keyboard grammar. Files:
`src/engine/input/decoder.ts` (core loop + state + flush) and
`src/engine/input/keys.ts` (keyboard grammar).

## The pure decode loop (PL-1)

```ts
export function decode(
  bytes: Uint8Array,
  state: DecoderState,
  options?: DecodeOptions,
): DecodeResult;
```

Algorithm:

1. Concatenate `state.carry` + `bytes` into one working buffer.
2. Scan left-to-right. At each position try, in order: an in-progress paste
   (03-03), a query-response grammar (03-03 demux), a control sequence
   (`ESC …` / `CSI …` / `SS3 …`), then a single printable (UTF-8) or control char.
3. A **complete** token is consumed and appended to `events`/`queries`; the scan
   index advances past it.
4. An **incomplete** trailing token (the buffer ends mid-sequence or mid-UTF-8
   codepoint) stops the scan: the remaining bytes become `rest` and are carried in
   the next `state`. Zero events are emitted for those bytes yet (AC-2).
5. **Carry bound (PL-6):** if `rest` would exceed `RESPONSE_BUFFER_CAP` (1024), the
   carry is dropped and the scan resyncs (the oversized garbage is discarded, no
   event emitted) — bounded memory under adversarial input (AC-7/AC-8).

`decode()` is a pure function of `(bytes, state, options)` — no timers, no I/O, no
logging of bytes (AC-8). The same input always yields the same output (replayable
for fuzzing).

## Decoder state & flush (PL-3, PL-13)

```ts
export function createDecoderState(): DecoderState;
export function flush(state: DecoderState, options?: DecodeOptions): DecodeResult;
```

- `createDecoderState()` returns an empty carry + inactive paste.
- The host carries `rest` forward: `state = { ...state, carry: result.rest }`.
- **ESC disambiguation (PL-3):** when the working buffer is exactly a lone `ESC`
  (0x1b) with no following byte, it is ambiguous (Escape key vs the start of a
  CSI/SS3 sequence). `decode()` holds it in `rest`, emitting nothing. The RD-07
  host arms an `ESC_TIMEOUT_MS` (50 ms) timer; if no further bytes arrive it calls
  `flush(state)`, which emits `KeyEvent{ key:'escape' }` and clears the carry. If a
  byte *does* arrive first, the next `decode()` completes (or rejects) the sequence
  normally. Timing never lives in the decoder.

## Classic keyboard grammar (keys.ts, PL-4, PL-11)

Decoded against explicit tables — no `eval`, allowlist matching only.

### Single bytes
| Bytes | Event |
| ----- | ----- |
| `\r` (0x0d) / `\n` (0x0a) | `key:'enter'` |
| `\t` (0x09) | `key:'tab'` |
| `\x7f` / `\b` (0x08) | `key:'backspace'` |
| ` ` (0x20) | `key:'space'` |
| `\x01`–`\x1a` (excl. the above) | Ctrl+letter → `key:<letter>, ctrl:true` (e.g. `\x03`→`c`+ctrl) |
| printable ≥ 0x20 (UTF-8 decoded) | `key:<char>, codepoint:<cp>` |

### CSI / SS3 sequences
| Bytes | Event |
| ----- | ----- |
| `ESC [ A/B/C/D` | up/down/right/left |
| `ESC O A/B/C/D` (SS3) | up/down/right/left |
| `ESC [ H` / `ESC [ F` (and `ESC [ 1~` / `ESC [ 4~`) | home / end |
| `ESC [ 2~` / `ESC [ 3~` | insert / delete |
| `ESC [ 5~` / `ESC [ 6~` | pageup / pagedown |
| `ESC [ 1 5~ / 1 7~ … 2 4~` | f5–f12 (xterm `~` encodings) |
| `ESC O P/Q/R/S` | f1–f4 (SS3) |
| `ESC [ 1 ; <mod> <final>` | nav/F-key with modifiers (e.g. `ESC[1;5C`→right+ctrl, AC-1) |

### Modifier decoding
The xterm modifier parameter (`<mod>`) encodes `1 + bitmask` where bit 1 = Shift,
bit 2 = Alt, bit 4 = Ctrl. So `5` = `1 + 4` → Ctrl; `2` = Shift; `3` = Alt; `6` =
Ctrl+Shift; etc. Applied to the base key.

### Alt-prefixed keys
`ESC` immediately followed by a printable (not `[`/`O`) is `Alt+<char>` —
`ESC x` → `key:'x', alt:true` (AC-1). This is resolved only when the byte after
`ESC` is present; a lone `ESC` stays ambiguous (handled by `flush`).

### CSI-u / Kitty branch (PL-4, DEF-1)
When `options.caps?.keyboard.kittyFlags` is true, the decoder reaches a branch point
reserved for CSI-u parsing. **In this RD that branch falls through to classic
decoding** (DEF-1: full CSI-u parsing is Phase B). The branch exists so the
enhancement slots in without an API change.

## UTF-8 handling (PL-1)

Printable decoding is UTF-8-aware at the byte level: a 1–4 byte sequence is decoded
to one code point. A multibyte char split across a chunk boundary is **incomplete**
→ carried in `rest` (step 4), never emitted as partial bytes. This is what makes
byte input (PL-1) strictly necessary over strings.

## Why pure + flush (PL-3 rationale)

A pure `decode()` is replayable from corpora, deterministic under fuzzing (AC-8),
and has no hidden timing. The single genuinely time-dependent decision (lone ESC) is
externalised to `flush()`, driven by the host's clock — the same sync/seam split
RD-02 used for its async query layer (RT-2). The decoder ships the `ESC_TIMEOUT_MS`
constant so the host has a single source for the default.
