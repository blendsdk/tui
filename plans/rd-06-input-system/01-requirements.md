# Requirements: RD-06 Input System

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-06](../../requirements/RD-06-input-system.md)

## Feature Overview

Turn raw terminal bytes into a clean, typed stream of input events — keyboard,
mouse, scroll, paste, and focus — through one consistent **pure decoder**. This is
half of the project's go/no-go gate: if keyboard + mouse + scroll cannot be decoded
reliably, the project stops. The decoder is a **pure function of bytes**
(`decode(bytes, state) → { events, queries, rest }`), chunk-boundary-safe, fully
unit-testable from recorded corpora with no terminal required. It evolves the
archived prototype's `parseInput` into a complete classic-xterm decoder and
demultiplexes terminal query responses to the RD-02 capability channel.

## Functional Requirements

### Must Have
- [ ] **Full classic keyboard decoding**: printable chars (UTF-8), Enter/Tab/Backspace/Escape/Space, arrows, Home/End, PageUp/PageDown, Insert/Delete, F1–F12, and Ctrl/Alt/Shift modifier combinations per xterm encodings (`CSI 1;<mod><key>`). (PL-4: classic is the gate; CSI-u deferred to DEF-1.)
- [ ] **Chunk-boundary-safe**: a control sequence (or UTF-8 multibyte char) split across two `data` chunks is buffered in `rest`/state and decoded once complete; bytes are never misinterpreted at a boundary. (PL-1: byte-level decoding.)
- [ ] **Mouse**: SGR (1006) decoding of press, release, drag/motion, with correct 1-based coordinates beyond column 223. (PL-11: coords reported 1-based as the terminal sends them.)
- [ ] **Scroll**: wheel up/down (button 64/65) and horizontal wheel (66/67) as `WheelEvent`s.
- [ ] **Bracketed paste**: text between `CSI 200~` and `CSI 201~` delivered as a single `PasteEvent` (not keystrokes), with a configurable size cap (PL-5).
- [ ] **Escape disambiguation**: a lone `ESC` vs the start of a CSI/SS3 sequence resolved by a host-driven `flush()` (PL-3) or by the next byte; `ESC_TIMEOUT_MS = 50` default shipped for the host.
- [ ] **Capability-driven enablement**: the decoder branches on `caps.keyboard.kittyFlags` and falls back to classic xterm decoding otherwise (classic is the gate; CSI-u is DEF-1).
- [ ] **Typed event model**: `KeyEvent`, `MouseEvent`, `WheelEvent`, `PasteEvent`, `FocusEvent`, and an internal `QueryResponse` channel (consumed by RD-02, never surfaced to apps via a separate `queries` array, PL-9).

### Should Have
- [ ] Focus in/out events (`CSI I`/`CSI O`) when `caps` reports `?1004` support. (PL-7: included.)
- [ ] A pluggable keymap so apps can name chords — `createKeymap(bindings) → lookup` (PL-7, PL-10: included).

### Won't Have (Out of Scope)
- Stream binding / raw-mode toggling / mode-enable sequences — that is the host (RD-07); this RD is the **pure decoder** plus the event model.
- Widget focus routing / command dispatch — UI layer, out of phase.
- Full CSI-u/Kitty progressive keyboard parsing — **deferred to Phase B (DEF-1)**; the branch point + classic fallback are wired now.

## Technical Requirements

### Decoder shape (pure)
```
decode(bytes: Uint8Array, state: DecoderState)
  -> { events: InputEvent[], queries: QueryResponse[], rest: Uint8Array }
  // 'rest' carries an incomplete trailing sequence to the next call
flush(state: DecoderState)
  -> { events: InputEvent[], queries: QueryResponse[], rest: Uint8Array }
  // emits a held lone ESC as KeyEvent{key:'escape'} (host's ~50 ms timer)
```

### Demultiplexing
Terminal **query responses** (DA / XTVERSION / `?2026`) are recognised by the shared
classifier (`capability/responses.ts`, PL-2), returned in the `queries` array, and
**never** emitted as `KeyEvent`s (AC-6, PL-9).

### Performance / Compatibility
- Decoding is synchronous and pure; no runtime perf budget beyond bounded memory.
- Cross-platform: pure byte processing; no platform-specific input APIs (those are RD-07).
- Node active-LTS 18/20/22 (inherited from RD-01).

### Security
- Keystrokes and paste **may contain passwords/secrets**: the decoder **never logs
  raw input** at default levels; paste contents are not retained beyond delivery (AC-8).
- All sequences parsed against explicit grammars; unrecognised/oversized sequences
  are dropped safely. The carry buffer is bounded (`RESPONSE_BUFFER_CAP = 1024`, PL-6)
  and the paste buffer is capped (`PASTE_CAP_BYTES = 1 MiB`, PL-5) — a malformed or
  adversarial byte stream cannot cause unbounded memory growth or a crash (AC-7/AC-8).
- Input is decoded, never echoed/executed; query responses are isolated to `queries`.
- No `eval` of terminal data; no injection surface.

## Acceptance Criteria

> Mirrors RD-06's acceptance criteria; all are locally verifiable against the pure
> decoder with byte-string corpora (no terminal required).

1. [ ] **(AC-1)** `decode(b)` maps each exactly: `ESC[A`→`up`; `ESC[1;5C`→`right`+ctrl; `ESC[15~`→`f5`; `ESC x`→`x`+alt; `\r`→`enter`; `\x7f`→`backspace`; `\x03`→ctrl+c. — ST-1
2. [ ] **(AC-2)** A split sequence — `decode("ESC[1")` then `decode(";5C")` — yields zero events on the first call (`rest` carries `ESC[1`) and one `right`+ctrl on the second. — ST-2
3. [ ] **(AC-3)** `ESC[<0;240;5M` → `MouseEvent{kind:'down',button:0,x:240,y:5}` — coordinate 240 (>223) correct. — ST-3
4. [ ] **(AC-4)** `ESC[<64;10;3M` → `WheelEvent{dir:'up'}`; `ESC[<65;…M` → `dir:'down'`. — ST-4
5. [ ] **(AC-5)** `ESC[200~hello\x1b[201~` → one `PasteEvent{text:'hello'}` and zero KeyEvents. — ST-5
6. [ ] **(AC-6)** A DA response `ESC[?64;1;2c` through `decode()` produces a `QueryResponse` in `queries` and **zero** KeyEvents. — ST-6
7. [ ] **(AC-7)** A paste exceeding the cap is truncated to the cap and flagged `truncated:true`; an incomplete sequence never grows the carry buffer past the bound. — ST-7, ST-8
8. [ ] **(AC-8)** Security: a fuzz corpus of random/adversarial byte streams produces no crash, no unbounded memory, and never logs raw bytes at default level. — ST-9
9. [ ] All ST-* pass; `npm run verify` exits 0 locally; `npm run lint`/`check:deps` clean; RD-02's `query.ts` spec tests remain green after the shared-classifier refactor; no dead code; register fully traced.
