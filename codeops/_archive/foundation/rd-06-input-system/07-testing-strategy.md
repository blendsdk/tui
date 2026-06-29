# 07: Testing Strategy

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

Specification test cases (ST-*) are **immutable oracles** derived from RD-06's
acceptance criteria and the plan decisions — never from reading the implementation.
Expectations come from the spec. If an ST-* fails after implementation, the
implementation is wrong.

Conventions (inherited): `node:test` + `node:assert/strict` via `tsx`; tests under
`test/` only; `*.spec.test.ts` = oracle, `*.impl.test.ts` = edge cases. All inputs
are byte literals (`Uint8Array.from`/`Buffer.from`) so no terminal is required.

> Notation: `ESC` = `0x1b`. A "decode" means `decode(bytes, createDecoderState(), opts?)`
> unless a carried state is shown.

## Specification Test Cases

### ST-1 — Classic keyboard map (AC-1)
**Source**: AC-1. **File**: `test/input-keyboard.spec.test.ts`.
Each input decodes to exactly one `KeyEvent` as specified:
| Input bytes | Expected `KeyEvent` |
| ----------- | ------------------- |
| `ESC [ A` | `{key:'up'}` |
| `ESC O A` | `{key:'up'}` (SS3) |
| `ESC [ 1 ; 5 C` | `{key:'right', ctrl:true}` |
| `ESC [ 1 5 ~` | `{key:'f5'}` |
| `ESC x` | `{key:'x', alt:true}` |
| `\r` | `{key:'enter'}` |
| `\x7f` | `{key:'backspace'}` |
| `\x03` | `{key:'c', ctrl:true}` |

### ST-2 — Chunk-boundary safety (AC-2)
**Source**: AC-2. **File**: `test/input-decoder.spec.test.ts`.
`decode(ESC[1, s0)` → `events:[]`, `rest` carries `ESC[1`. Carry into `s1 = {...s0, carry: rest}`;
`decode(;5C, s1)` → exactly one `{key:'right', ctrl:true}`, `rest` empty.

### ST-3 — SGR mouse extended coordinates (AC-3)
**Source**: AC-3. **File**: `test/input-mouse.spec.test.ts`.
`decode(ESC[<0;240;5M)` → one `MouseEvent{kind:'down', button:0, x:240, y:5}` (coord 240 > 223 correct; 1-based, not converted).

### ST-4 — Wheel up/down (AC-4)
**Source**: AC-4. **File**: `test/input-mouse.spec.test.ts`.
`decode(ESC[<64;10;3M)` → `WheelEvent{dir:'up'}`; `decode(ESC[<65;10;3M)` → `WheelEvent{dir:'down'}`. Neither emits a `MouseEvent`.

### ST-5 — Bracketed paste as one event (AC-5)
**Source**: AC-5. **File**: `test/input-paste.spec.test.ts`.
`decode(ESC[200~hello\x1b[201~)` → exactly one `PasteEvent{text:'hello', truncated:false}` and **zero** `KeyEvent`s.

### ST-6 — Query-response demux (AC-6)
**Source**: AC-6, PL-9. **File**: `test/input-demux.spec.test.ts`.
`decode(ESC[?64;1;2c)` → `queries` has one `QueryResponse` (kind `'da1'`), `events` is empty (zero KeyEvents).

### ST-7 — Paste size cap & truncation (AC-7)
**Source**: AC-7, PL-5. **File**: `test/input-security.spec.test.ts`.
With `pasteCap:8`, `decode(ESC[200~ + 'X'*100 + ESC[201~)` → one `PasteEvent` with `text.length===8` and `truncated:true`. Memory does not grow with the 100 bytes beyond the cap.

### ST-8 — Carry buffer bound (AC-7)
**Source**: AC-7, PL-6. **File**: `test/input-security.spec.test.ts`.
Feeding an unterminated CSI longer than `RESPONSE_BUFFER_CAP` (e.g. `ESC[` + `'1;'*2000`) across chunks never grows `rest` past the bound; the decoder drops & resyncs, emits no event, and does not throw.

### ST-9 — Fuzz / security (AC-8)
**Source**: AC-8. **File**: `test/input-security.spec.test.ts`.
A deterministic corpus of random/adversarial byte streams (seeded, no `Math.random`), fed through `decode()` in varied chunk splits: no throw; `rest`/paste stay bounded; no `QueryResponse` ever appears in `events`; capturing `console.*` shows **zero** raw-byte/text logging at default level.

### ST-10 — ESC disambiguation via flush (PL-3)
**Source**: PL-3, RD-06 "Escape disambiguation". **File**: `test/input-decoder.spec.test.ts`.
`decode(ESC, s0)` → `events:[]`, `rest` carries `ESC`. `flush({...s0, carry: rest})` → exactly one `KeyEvent{key:'escape'}`, `rest` empty. (And: `decode(ESC, s0)` then `decode([, s1)` continues a sequence rather than emitting Escape.)

### ST-11 — Mouse release / drag / move (Must-Have mouse completeness)
**Source**: RD-06 Must-Have (press/release/drag/motion). **File**: `test/input-mouse.spec.test.ts`.
`ESC[<0;5;5m` → `{kind:'up'}`; `ESC[<32;5;5M` → `{kind:'drag', button:0}`; `ESC[<35;5;5M` → `{kind:'move'}`.

### ST-12 — Focus in/out (Should-Have, PL-7)
**Source**: RD-06 Should-Have, PL-7. **File**: `test/input-demux.spec.test.ts`.
`decode(ESC[I)` → `FocusEvent{focused:true}`; `decode(ESC[O)` → `FocusEvent{focused:false}`.

### ST-13 — Keymap chord lookup (Should-Have, PL-10)
**Source**: PL-10. **File**: `test/input-keymap.spec.test.ts`.
`createKeymap({'ctrl+s':'save','alt+x':'exit'})`: `lookup({key:'s',ctrl:true,alt:false,shift:false})` → `'save'`; an unbound chord → `undefined`; an invalid binding (e.g. `'ctrl+'`) throws at build.

### ST-14 — Shared classifier refactor safety (PL-2)
**Source**: PL-2. **File**: `test/input-demux.spec.test.ts` + the *existing* RD-02 query suites.
`matchResponse` classifies DA1 (`ESC[?…c`), DA2 (`ESC[>…c`), DECRPM (`ESC[?2026;1$y`), XTVERSION DCS (`ESC P … ESC\`). **And** RD-02's `test/capability-query.spec.test.ts` + `test/capability-parser.impl.test.ts` remain green unchanged after `query.ts` is refactored to use the shared classifier.

## Implementation Test Cases (impl)

Edge/internal coverage in `*.impl.test.ts`:
- **Keyboard**: every nav/F-key (`f1`–`f12`, home/end/pageup/pagedown/insert/delete), SS3 `ESC O P/Q/R/S` (f1–f4), modifier matrix (`<mod>` = 2/3/5/6/8 → shift/alt/ctrl/ctrl+shift/meta), Ctrl-letter range `\x01`–`\x1a`.
- **UTF-8**: 2-/3-/4-byte code points decoded; a multibyte char split across chunks carried in `rest` then completed; invalid UTF-8 dropped without crash.
- **Mouse**: middle/right buttons, wheel `66/67` → left/right, coords at 223/224 boundary.
- **Paste**: paste split across many chunks; a paste containing bytes that look like escape sequences stays literal; empty paste → `text:''`.
- **Carry/resync**: exact `RESPONSE_BUFFER_CAP` boundary; resync after dropping garbage recovers the next valid token.
- **Keymap**: modifier order independence (`'shift+ctrl+up'` === `'ctrl+shift+up'`), single-char vs named-key bindings.

## Verification Gate

Per task: `npm run verify` (typecheck + test + build). Per phase: `npm run verify && npm run lint`.
Final: `npm run verify && npm run lint && npm run check:deps && npm audit` — zero new
runtime deps; RD-02 suites still green; AC-1…AC-8 all covered by passing ST-*.

## Traceability

| AC | ST | | Decision | ST |
| -- | -- |-| -------- | -- |
| AC-1 | ST-1 | | PL-3 (flush) | ST-10 |
| AC-2 | ST-2 | | PL-7 (focus) | ST-12 |
| AC-3 | ST-3 | | PL-10 (keymap) | ST-13 |
| AC-4 | ST-4 | | PL-2 (shared classifier) | ST-14 |
| AC-5 | ST-5 | | mouse completeness | ST-11 |
| AC-6 | ST-6 | | | |
| AC-7 | ST-7, ST-8 | | | |
| AC-8 | ST-9 | | | |
