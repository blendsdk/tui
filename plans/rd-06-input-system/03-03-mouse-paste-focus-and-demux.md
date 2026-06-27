# 03-03: Mouse, Paste, Focus & Query Demux

> **Document**: 03-03-mouse-paste-focus-and-demux.md
> **Parent**: [Index](00-index.md)
> **Decisions**: PL-2, PL-5, PL-7, PL-9, PL-11, PL-12

The non-keyboard tokens the decoder recognises, plus the structural query-response
demultiplexer. Files: `src/engine/input/mouse.ts`, `src/engine/input/paste.ts`,
focus handling in `decoder.ts`, and the shared classifier
`src/engine/capability/responses.ts`.

## SGR mouse & wheel (mouse.ts, PL-11)

SGR (1006) reports are `ESC [ < b ; x ; y (M|m)`:

- `M` final = press/motion; `m` final = release.
- `b` is the button/flags byte. Low two bits select the button (0/1/2 = left/middle/right);
  bit 5 (0x20 = 32) = motion/drag; buttons 64–67 (bit 6) = wheel.
- **Coordinates `x`,`y` are reported 1-based exactly as received (PL-11, AC-3)** — no
  0-based conversion (this differs from the archived prototype). `ESC[<0;240;5M` →
  `{kind:'down',button:0,x:240,y:5}`, proving coords beyond column 223 work.

### Mouse kind mapping
| `b` (after masking) | final | kind |
| --- | --- | --- |
| button bits, no motion | `M` | `down` |
| any button | `m` | `up` |
| motion bit (0x20) set, a button held | `M` | `drag` |
| motion bit set, no button (button bits = 3) | `M` | `move` |

### Wheel mapping (AC-4)
| `b` | event |
| --- | ----- |
| 64 | `WheelEvent{dir:'up'}` |
| 65 | `WheelEvent{dir:'down'}` |
| 66 | `WheelEvent{dir:'left'}` |
| 67 | `WheelEvent{dir:'right'}` |

Wheel `b` values are detected before the button/kind mapping (they are not mouse
buttons). A wheel report never produces a `MouseEvent`.

## Bracketed paste (paste.ts, PL-5)

- Start marker `ESC [ 2 0 0 ~`, end marker `ESC [ 2 0 1 ~`.
- Between markers, **all bytes are paste content** — including bytes that would
  otherwise be keys or even escape sequences — accumulated into `state.paste.bytes`,
  never decoded as events (AC-5).
- On the end marker: the accumulated bytes are UTF-8 decoded into one
  `PasteEvent{ text, truncated }` and the paste state resets.
- **Size cap (PL-5, AC-7):** while active, once accumulated length reaches
  `options.pasteCap ?? PASTE_CAP_BYTES` (1 MiB), further content bytes are dropped
  and `truncated` latches `true`. The end marker still produces exactly one
  `PasteEvent` with the capped text and `truncated:true`. Memory is bounded
  regardless of paste size.
- A paste split across chunks: the open paste lives in `state.paste`; each `decode()`
  appends until the end marker arrives (chunk-boundary-safe, PL-1).
- Paste content is **not logged** and **not retained** beyond the emitted event (AC-8).

## Focus in/out (decoder.ts, PL-7)

- `ESC [ I` → `FocusEvent{focused:true}`; `ESC [ O` → `FocusEvent{focused:false}`.
- These are recognised whenever seen. The host enables `?1004` based on `caps`
  (RD-07); the decoder simply decodes the bytes if they arrive.

## Query-response demultiplexer (PL-2, PL-9, PL-12)

The structural AC-6 guarantee. The shared classifier is **extracted from RD-02's
`query.ts`** (PL-2) so there is one grammar implementation.

### Shared classifier — `capability/responses.ts`
Exports the grammar matchers currently private to `query.ts`:

```ts
/** A recognised query-response match: its end index and a classification. */
export interface ResponseMatch {
  readonly end: number;
  readonly kind: 'da1' | 'da2' | 'xtversion' | 'decrpm';
  /** Capability hint (e.g. sync2026) for RD-02; empty for pure-demux matches. */
  readonly hint: RuntimeHint;
}

/** Try to match a known query-response grammar at `start`. Null when not a complete match. */
export function matchResponse(bytes: Uint8Array, start: number): ResponseMatch | null;
```

- `matchResponse` is the former `matchGrammar` + `matchCsi` + `matchDcs`, returning a
  `kind` in addition to `end`/`hint`.
- **`query.ts` refactor:** `parseResponses` calls `matchResponse` instead of its
  inline matchers; `RuntimeHint` moves to (or is imported from) `responses.ts`.
  Behaviour is unchanged — RD-02's `capability-query.spec.test.ts` and
  `capability-parser.impl.test.ts` remain green untouched (the refactor's oracle).

### Decoder use (PL-9)
During the decode scan (03-02 step 2), before keyboard/mouse matching the decoder
calls `matchResponse`. On a match it pushes `QueryResponse{ raw, kind }` to
**`queries`** (not `events`) and advances past the consumed bytes. A DA reply
`ESC[?64;1;2c` therefore yields one `queries` entry and **zero** `events` (AC-6).

> Structural guarantee: because `queries` is a distinct return field from `events`,
> no app consumer can receive a query response as a keystroke — the no-leak property
> holds without any consumer-side filtering (PL-9).

## Ordering within the scan

At each scan position the decoder tries tokens in this priority:
1. Active paste (consume content until end marker).
2. `matchResponse` (query-response demux → `queries`).
3. Mouse/wheel SGR (`ESC [ <`).
4. Focus (`ESC [ I/O`).
5. Bracketed-paste start (`ESC [ 200~`).
6. Keyboard CSI/SS3/Alt/printable (03-02).

This ordering ensures query replies and mouse/paste are never misread as keys, which
is the whole point of decoding input through one consistent path.
