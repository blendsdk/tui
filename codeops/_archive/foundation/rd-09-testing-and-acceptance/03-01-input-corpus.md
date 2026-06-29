# Input Corpus (Tier-1 regression): RD-09

> **Document**: 03-01-input-corpus.md
> **Parent**: [Index](00-index.md)

## Overview

A checked-in, data-driven corpus of `bytes → expected events` fixtures (FR-1) that drives
a Tier-1 regression runner against the RD-06 decoder. Format is **hex-in-JSON** (AR-6):
human-readable, clean git diffs, language-neutral as a shareable evidence base. The corpus
covers the RD-09 must-cover cases — chunk-split sequences, SGR mouse (incl. beyond column
223), wheel, paste, and DA responses — plus keyboard coverage for gate items 3–5.

## Architecture

### Current Architecture
Byte→event expectations live inline across `input-decoder.spec`, `input-mouse.spec`,
`input-paste.spec`, `input-responses.impl`. No reusable data file.

### Proposed Changes
Add a fixtures directory and a single iterating runner. Expectations are authored from the
**RD-06 event contract** (the spec), never by running the decoder and copying output.

## Implementation Details

### Fixture format

`test/fixtures/input-corpus/*.json` — each file is an array of records:

```jsonc
// keyboard.json + responses.json (illustrative)
[
  {
    "name": "arrow up (CSI A)",
    "bytesHex": "1b5b41",
    "chunks": null,                       // null = feed as one chunk
    "expectedEvents": [
      { "type": "key", "key": "up", "ctrl": false, "alt": false, "shift": false }
    ]
  },
  {
    "name": "printable 'a' (carries codepoint)",
    "bytesHex": "61",
    "chunks": null,
    "expectedEvents": [
      { "type": "key", "key": "a", "ctrl": false, "alt": false, "shift": false, "codepoint": 97 }
    ]
  },
  {
    "name": "paste split across two chunks",
    "bytesHex": "1b5b3230307e6869",       // ESC[200~  h i  (truncated illustration)
    "chunks": [4, 99],                     // byte offsets at which to split into decode() calls
    "expectedEvents": [ { "type": "paste", "text": "hi", "truncated": false } ]
  },
  {
    "name": "primary DA reply (classified, not a key)",
    "bytesHex": "1b5b3f3163",             // ESC[?1c
    "chunks": null,
    "expectedEvents": [],                  // a query reply never appears as an event (PL-9)
    "expectedQueries": [ { "kind": "da1" } ]
  }
]
```

- `bytesHex`: lowercase hex, **even length**, `[0-9a-f]` only. The runner rejects malformed hex (security: AR-6).
- `chunks`: `null` for a single `decode()` call, or an array of split offsets to exercise cross-chunk state threading (RD-06 RT-1). After the last chunk, the runner calls `flush()`.
- `expectedEvents`: the full ordered event list expected from `decode(...)` across all chunks **plus** `flush()`. Event shapes follow the RD-06 model exactly (KeyEvent/MouseEvent/WheelEvent/PasteEvent/FocusEvent). **Printable** keys MUST include `codepoint` (named keys omit it) per the RD-06 `KeyEvent` contract — `deepEqual` fails otherwise.
- `expectedQueries` (optional, default `[]`): the ordered list of query-reply classifications (`{ kind: 'da1' | 'da2' | 'xtversion' | 'decrpm' }`) expected on the decoder's separate `queries` channel. Query replies are routed to `result.queries`, **never** `result.events` (PL-9), so a reply physically cannot leak as a keystroke; the runner asserts both channels. Records with no query reply omit the field.

### Corpus files (one JSON per concern)

| File | Cases |
|------|-------|
| `keyboard.json` | printable, arrows, Home/End, PgUp/PgDn, F1–F12, Ctrl/Alt/Shift combos (gate item 3) |
| `mouse.json` | SGR press/drag/release; coordinates **beyond column 223** (gate item 4) |
| `wheel.json` | wheel up/down (gate item 5) |
| `paste.json` | bracketed paste as one `PasteEvent`; chunk-split paste; over-cap truncation flag |
| `responses.json` | DA1/DA2, DECRPM ?2026, XTVERSION — asserted via `expectedQueries` (classified on the `queries` channel, never emitted as keys). CPR/cursor-position is **out of scope**: `matchResponse` classifies only DA1/DA2/DECRPM/XTVERSION, not CPR |

### Runner

`test/input-corpus.spec.test.ts` (spec — immutable oracle):

```ts
// pseudocode
for (const file of loadCorpusFiles('test/fixtures/input-corpus')) {
  for (const c of file.cases) {
    test(`corpus: ${file.name} / ${c.name}`, () => {
      const bytes = hexToBytes(c.bytesHex);           // throws on malformed hex
      let state = createDecoderState();
      const events = [];
      const queries = [];
      for (const chunk of splitChunks(bytes, c.chunks)) {
        const r = decode(chunk, state, opts);
        events.push(...r.events); queries.push(...r.queries); state = r.state;
      }
      const f = flush(state, opts);
      events.push(...f.events); queries.push(...f.queries);
      assert.deepEqual(events, c.expectedEvents);
      // Assert query-reply classification (kind only); [] when none expected.
      assert.deepEqual(queries.map((q) => ({ kind: q.kind })), c.expectedQueries ?? []);
    });
  }
}
```

### Integration Points
- Consumes `createDecoderState`/`decode`/`flush` from `src/engine/input` via `../src/engine/index.js`.
- Joins the unit glob (AR-10) — runs under every `verify`.
- Feeds gate criteria 3 (keyboard), 4 (mouse), 5 (scroll), and the paste half of 7 (canonical RD-09 numbering); mapped in `docs/acceptance-gate.md`.

## Code Examples

### `hexToBytes` (security boundary)
```ts
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/.test(hex)) {
    throw new Error(`corpus: malformed bytesHex: ${JSON.stringify(hex)}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
```

## Error Handling

| Error Case                         | Handling Strategy                                              | AR Ref |
| ---------------------------------- | ------------------------------------------------------------- | ------ |
| Malformed `bytesHex` (odd / non-hex) | Runner throws a clear error — never silently mis-decodes       | AR-6   |
| `chunks` offset out of range        | Runner throws (fixture authoring bug surfaced loudly)         | AR-6   |
| Decoded events ≠ expected           | `assert.deepEqual` fails; **fix the engine, not the fixture** if the fixture matches the RD-06 contract | AR-8   |

> **Traceability:** decisions reference `00-ambiguity-register.md`.

## Testing Requirements
- Spec runner `input-corpus.spec.test.ts` iterating every fixture (FR-1).
- Impl tests `input-corpus.impl.test.ts`: `hexToBytes` rejects malformed hex; empty corpus file handled; single-chunk vs multi-chunk equivalence for a non-split case; a `responses.json` record asserts the `queries` channel (kind) while `events` stays empty.
