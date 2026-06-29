# RD-06 Input System Implementation Plan

> **Feature**: A **pure byte→event decoder** for `@blendsdk/tui` — turns raw terminal bytes into a typed stream of keyboard, mouse, scroll, paste, and focus events through one consistent, chunk-boundary-safe decoder, demultiplexing terminal query responses to the RD-02 capability channel. This is half of the project's go/no-go gate.
> **Status**: Planning Complete
> **Created**: 2026-06-27
> **Implements**: RD-06
> **CodeOps Skills Version**: 2.0.0

## Overview

RD-06 decodes the input half of the terminal contract. Its core is a **pure
function of bytes** — `decode(bytes, state) → { events, queries, rest }` — so the
entire decoder is unit-testable from recorded corpora with no terminal attached
(PL-1). It evolves the archived prototype's `parseInput` (SGR mouse press + a few
keys) into a complete classic-xterm decoder: full keyboard (printable UTF-8, nav,
function keys, Ctrl/Alt/Shift modifiers), SGR mouse (press/release/drag/move with
coordinates beyond column 223), wheel/scroll, bracketed paste, focus in/out, and
escape disambiguation.

Two seams keep the decoder pure and DRY:

- **Timing lives in the host (PL-3).** A lone trailing `ESC` is held in state; the
  RD-07 host's ~50 ms timer calls `flush(state)` to emit it as Escape. `decode()`
  itself never owns a clock.
- **Query responses are demultiplexed structurally (PL-2, PL-9).** The decoder
  recognises DA/`?2026`/XTVERSION replies using the shared classifier extracted to
  `capability/responses.ts` and routes them into a **separate** `queries` array —
  never the app `events` union — so a query reply physically cannot leak as a
  keystroke (AC-6).

Full CSI-u/Kitty progressive decoding is **deferred to Phase B (DEF-1)**; classic
decoding is the gate and the `caps.keyboard.kittyFlags` branch + fallback are wired
now. Raw-mode toggling and mode-enable sequences are **out of scope** — that is the
RD-07 host; this RD is the pure decoder plus the event model.

## Document Index

| #   | Document | Description |
| --- | -------- | ----------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (audit trail) |
| 00  | [Index](00-index.md) | This document — overview and navigation |
| 01  | [Requirements](01-requirements.md) | Feature requirements and scope |
| 02  | [Current State](02-current-state.md) | Prototype `parseInput` + RD-02 seam analysis |
| 03-01 | [Event Model & Types](03-01-event-model-and-types.md) | `InputEvent` union, `QueryResponse`, `DecodeResult`, `DecoderState` |
| 03-02 | [Keyboard Decoder & State](03-02-keyboard-decoder-and-state.md) | Classic keys, modifiers, chunk-boundary carry, ESC flush |
| 03-03 | [Mouse, Paste, Focus & Demux](03-03-mouse-paste-focus-and-demux.md) | SGR mouse/wheel, bracketed paste + cap, focus, query-response demux |
| 03-04 | [Keymap & Security](03-04-keymap-and-security.md) | `createKeymap`, paste/carry bounds, fuzz-safety, public API |
| 07  | [Testing Strategy](07-testing-strategy.md) | Specification test cases (ST-*) and verification |
| 99  | [Execution Plan](99-execution-plan.md) | Phases, sessions, and task checklist |

## Quick Reference

### Usage Examples

```ts
import { createDecoderState, decode, flush, createKeymap } from '@blendsdk/tui';

let state = createDecoderState();

// Feed raw stdin chunks (Uint8Array). Pure: no terminal required.
const { events, queries, rest } = decode(chunk, state);
state = { ...state, carry: rest }; // carry the incomplete trailing bytes

for (const ev of events) {
  if (ev.type === 'key') console.log(ev.key, ev.ctrl, ev.alt, ev.shift);
  if (ev.type === 'mouse') console.log(ev.kind, ev.button, ev.x, ev.y);
}
// `queries` go to the RD-02 capability channel, never to the app.

// Host's ~50 ms timer fires with no new bytes → resolve a lone ESC:
const flushed = flush(state); // emits KeyEvent{key:'escape'}

// Optional convenience: name chords.
const keymap = createKeymap({ 'ctrl+s': 'save', 'alt+x': 'exit' });
keymap.lookup({ type: 'key', key: 's', ctrl: true, alt: false, shift: false }); // 'save'
```

### Key Decisions

| Decision | Outcome | Ref |
| -------- | ------- | --- |
| Decoder input unit | `Uint8Array` (chunk-boundary-safe) | PL-1 |
| Query-response demux | Shared classifier in `capability/responses.ts`; `query.ts` refactored to reuse | PL-2 |
| ESC disambiguation | Pure decoder + host-driven `flush()`; `ESC_TIMEOUT_MS=50` shipped | PL-3 |
| CSI-u/Kitty | Classic now; full CSI-u deferred to Phase B (DEF-1) | PL-4 |
| Paste cap | `PASTE_CAP_BYTES = 1 MiB`, configurable; truncate + `truncated:true` | PL-5 |
| Carry bound | Reuse `RESPONSE_BUFFER_CAP = 1024`; drop & resync on overflow | PL-6 |
| Should-haves | Focus events + pluggable keymap, both now | PL-7 |
| Module layout | `src/engine/input/` subfolder + `capability/responses.ts` | PL-8 |
| `decode()` return | `{ events, queries, rest }` (structural query channel) | PL-9 |
| Keymap API | Functional `createKeymap(bindings) → lookup` | PL-10 |

## Related Files

**Created by this plan:**
- `src/engine/input/events.ts` — event model: `KeyEvent`, `MouseEvent`, `WheelEvent`, `PasteEvent`, `FocusEvent`, `InputEvent`, `QueryResponse`, `DecodeResult`, `DecoderState`
- `src/engine/input/keys.ts` — classic xterm keyboard grammar (printable UTF-8, nav, F-keys, modifiers)
- `src/engine/input/mouse.ts` — SGR (1006) mouse + wheel decoding
- `src/engine/input/paste.ts` — bracketed paste assembly + size cap
- `src/engine/input/decoder.ts` — core `decode()`/`flush()`/`createDecoderState()`, carry buffering, demux
- `src/engine/input/keymap.ts` — `createKeymap` chord lookup (PL-10)
- `src/engine/input/index.ts` — input subsystem public surface
- `src/engine/capability/responses.ts` — shared query-response classifier (extracted from `query.ts`, PL-2)

**Modified:**
- `src/engine/capability/query.ts` — refactored to import the shared classifier (behaviour unchanged)
- `src/engine/index.ts` — re-export the input public API + types
- `README.md` — add an "Input decoding (RD-06)" section
- Tests under `test/` (per the project test-layout convention)
