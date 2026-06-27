# RD-06: Input System

> **Document**: RD-06-input-system.md
> **Status**: Draft
> **Created**: 2026-06-27
> **Project**: @blendsdk/tui (Foundation)
> **Depends On**: RD-01
> **CodeOps Skills Version**: 2.0.0

---

## Feature Overview

Turns raw terminal bytes into a clean, typed stream of input events — keyboard, mouse,
scroll, and paste — through one consistent decoder. This is half of the project's
go/no-go gate: if keyboard + mouse + scroll cannot be decoded reliably, the project
stops. The decoder is a **pure function of bytes** (chunk-boundary-safe) so it is fully
unit-testable from recorded corpora, with no terminal required. It evolves the
prototype's `parseInput` (which already handles SGR mouse press and basic keys) into a
complete decoder.

---

## Functional Requirements

### Must Have
- [ ] **Full keyboard decoding**: printable chars (UTF-8), Enter/Tab/Backspace/Escape/Space, arrows, Home/End, PageUp/PageDown, Insert/Delete, F1–F12, and modifier combinations (Ctrl/Alt/Shift) per xterm encodings (`CSI 1;<mod><key>`, `modifyOtherKeys`).
- [ ] **Chunk-boundary-safe**: a control sequence split across two `data` chunks is buffered and decoded once complete; bytes are never misinterpreted at a boundary.
- [ ] **Mouse**: SGR (1006) decoding of press, **release**, **drag/motion**, with correct 1-based coordinates beyond column 223.
- [ ] **Scroll**: wheel up/down (button 64/65) and horizontal wheel (66/67) as scroll events.
- [ ] **Bracketed paste**: text between `CSI 200~` and `CSI 201~` delivered as a single `paste` event (not as keystrokes), with a configurable size cap.
- [ ] **Escape disambiguation**: a lone `ESC` vs the start of a CSI/SS3 sequence resolved by a bounded timeout (default ~50 ms) or by the next byte.
- [ ] **Capability-driven enablement**: the decoder understands CSI-u/Kitty keyboard sequences when `caps.keyboard.kittyFlags`, and falls back to classic xterm decoding otherwise (classic is the gate; CSI-u is progressive enhancement).
- [ ] A typed event model: `KeyEvent { key, ctrl, alt, shift, codepoint? }`, `MouseEvent { kind: 'down'|'up'|'move'|'drag', button, x, y }`, `WheelEvent { dir, x, y }`, `PasteEvent { text }`, `ResizeEvent` (from host), and an internal `QueryResponse` channel (consumed by RD-02, never surfaced to apps).

### Should Have
- [ ] Focus in/out events (`CSI I`/`CSI O`) when `caps` reports `?1004` support.
- [ ] A pluggable keymap so apps can name chords (a convenience over raw events).

### Won't Have (Out of Scope)
- Stream binding / raw-mode toggling / mode enable sequences — that is the host (RD-07); this RD is the **pure decoder** plus the event model.
- Widget focus routing / command dispatch — UI layer, out of phase.

---

## Technical Requirements

### Decoder shape (pure)
```
decode(buffer: Bytes, state: DecoderState) -> { events: InputEvent[], rest: Bytes }
  // 'rest' holds an incomplete trailing sequence carried to the next call
```

### Sequence coverage (non-exhaustive)
| Input | Bytes | Event |
|-------|-------|-------|
| Up | `ESC [ A` / `ESC O A` | KeyEvent{key:'up'} |
| Ctrl+Right | `ESC [ 1 ; 5 C` | KeyEvent{key:'right',ctrl:true} |
| F5 | `ESC [ 1 5 ~` | KeyEvent{key:'f5'} |
| Alt+x | `ESC x` | KeyEvent{key:'x',alt:true} |
| Mouse drag | `ESC [ < 32 ; x ; y M` | MouseEvent{kind:'drag'} |
| Wheel up | `ESC [ < 64 ; x ; y M` | WheelEvent{dir:'up'} |
| Paste | `ESC[200~ … ESC[201~` | PasteEvent{text} |
| DA reply | `ESC [ ? … c` | QueryResponse (to RD-02) |

### Demultiplexing
Terminal **query responses** (DA/version/`?2026`) are routed to the capability layer's
pending-query channel and are **never** emitted as `KeyEvent`s.

---

## Integration Points

### With RD-07 (Host)
- The host enables raw mode + the relevant input modes (mouse, bracketed paste, focus, keyboard protocol) based on `caps`, then feeds `data` chunks into `decode()` and dispatches events.

### With RD-02 (Capability)
- Routes query responses to detection; reads `caps.keyboard` to pick classic vs CSI-u decoding.

### With RD-08 (Security)
- Paste size cap and the no-keystroke-logging rule are defined in RD-08 and enforced here.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Decoder purity | stateful stream / pure (bytes,state)→(events,rest) | Pure function | Testable from corpora | AR-23 |
| Keyboard fidelity gate | require CSI-u / classic gate + CSI-u enhancement | Classic gate, CSI-u progressive | Works everywhere; better where supported | AR-13 |
| Paste | as keystrokes / single event + cap | Single event, size-capped | Correctness + DoS guard | AR-15, AR-24 |
| Query responses | surface as keys / demux to caps | Demultiplex to caps | Never corrupt app input | AR-24 (edge 3) |

---

## Security Considerations

- **Data sensitivity**: keystrokes and paste **may contain passwords/secrets**. The decoder must **never log raw input** at default levels (enforced with RD-08); paste contents are not retained beyond delivery.
- **Input validation**: all sequences parsed against explicit grammars; unrecognized/oversized sequences are dropped safely (bounded buffer) — a malformed or adversarial byte stream cannot cause unbounded memory growth or a crash.
- **Authentication & authorization**: n/a.
- **Injection risks**: input is decoded, never echoed/executed; query responses are isolated.
- **Encryption needs**: none.
- **Rate limiting**: paste size cap (default e.g. 1 MB, configurable) and a bounded incomplete-sequence buffer guard against flood/DoS.
- **Infrastructure**: none.

---

## Acceptance Criteria

1. [ ] `decode(b)` maps each of these exactly: `ESC[A`→`up`; `ESC[1;5C`→`right`+ctrl; `ESC[15~`→`f5`; `ESC x`→`x`+alt; `\r`→`enter`; `\x7f`→`backspace`; `\x03`→ctrl+c.
2. [ ] A sequence split across chunks — `decode("ESC[1")` then `decode(";5C")` — yields zero events on the first call (with `rest` carrying `ESC[1`) and one `right`+ctrl event on the second (proves chunk-boundary safety).
3. [ ] `ESC[<0;240;5M` decodes to `MouseEvent{kind:'down',button:0,x:240,y:5}` — coordinate 240 (>223) is correct (proves SGR extended coords).
4. [ ] `ESC[<64;10;3M` decodes to `WheelEvent{dir:'up'}`; `ESC[<65;...M` to `dir:'down'`.
5. [ ] `ESC[200~hello\x1b[201~` decodes to one `PasteEvent{text:'hello'}` and zero KeyEvents.
6. [ ] A DA response `ESC[?64;1;2c` fed through `decode()` produces a `QueryResponse` on the capability channel and **zero** KeyEvents (proves demultiplexing).
7. [ ] Boundary/security: a paste exceeding the configured cap is truncated to the cap and flagged `truncated:true` (no unbounded buffering); an incomplete sequence never grows the carry buffer past a bounded limit.
8. [ ] Security requirements verified: a fuzz corpus of random/adversarial byte streams produces no crash, no unbounded memory, and never logs raw bytes at default log level.
