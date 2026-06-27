# 03-01: Event Model & Types

> **Document**: 03-01-event-model-and-types.md
> **Parent**: [Index](00-index.md)
> **Decisions**: PL-1, PL-9, PL-11, PL-12, PL-13

Defines the public, typed event model the decoder emits and the internal decoder
state. All types are `readonly`; events are plain data (no behaviour). File:
`src/engine/input/events.ts`.

## Discriminated union (PL-11)

Every app-facing event carries a `type` discriminator. `MouseEvent` additionally
keeps the RD's own `kind` sub-discriminator.

```ts
/** A printable or named key press. (AC-1) */
export interface KeyEvent {
  readonly type: 'key';
  /** Printable → the character; named key → a lowercase name (see KEY_NAMES). */
  readonly key: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  /** Unicode code point when `key` is a printable character; omitted for named keys. */
  readonly codepoint?: number;
}

/** An SGR (1006) mouse report. Coordinates are 1-based as the terminal sends them (PL-11, AC-3). */
export interface MouseEvent {
  readonly type: 'mouse';
  readonly kind: 'down' | 'up' | 'move' | 'drag';
  readonly button: number;
  readonly x: number;
  readonly y: number;
}

/** A wheel/scroll report (SGR buttons 64–67). (AC-4) */
export interface WheelEvent {
  readonly type: 'wheel';
  readonly dir: 'up' | 'down' | 'left' | 'right';
  readonly x: number;
  readonly y: number;
}

/** A completed bracketed paste. `truncated` is true when the size cap clipped it (PL-5, AC-7). */
export interface PasteEvent {
  readonly type: 'paste';
  readonly text: string;
  readonly truncated: boolean;
}

/** A focus in/out report (`CSI I` / `CSI O`), gated on `?1004` (PL-7). */
export interface FocusEvent {
  readonly type: 'focus';
  readonly focused: boolean;
}

/** Any app-facing decoded event. Query responses are NOT in this union (PL-9). */
export type InputEvent = KeyEvent | MouseEvent | WheelEvent | PasteEvent | FocusEvent;
```

## Query-response channel (PL-9, PL-12)

`QueryResponse` is **never** part of `InputEvent`. It is returned in a separate
`queries` array so a terminal reply physically cannot leak as a keystroke (AC-6).

```ts
/** A recognised terminal query reply, routed to the RD-02 capability channel only. */
export interface QueryResponse {
  /** The raw recognised bytes (for RD-02 to parse further). */
  readonly raw: Uint8Array;
  /** Classification from the shared responses classifier (capability/responses.ts). */
  readonly kind: 'da1' | 'da2' | 'xtversion' | 'decrpm' | 'unknown';
}
```

## Decode result & state (PL-1, PL-13)

```ts
/** The result of one decode()/flush() call. */
export interface DecodeResult {
  readonly events: InputEvent[];
  readonly queries: QueryResponse[];
  /** Incomplete trailing bytes carried to the next decode() call. */
  readonly rest: Uint8Array;
}

/** Opaque carry between decode() calls. Created by createDecoderState(). */
export interface DecoderState {
  /** Incomplete trailing bytes from the previous call (bounded by RESPONSE_BUFFER_CAP). */
  readonly carry: Uint8Array;
  /** In-progress bracketed-paste accumulation. */
  readonly paste: PasteState;
}

/** Internal bracketed-paste accumulation state. */
export interface PasteState {
  readonly active: boolean;
  readonly bytes: number[];
  readonly truncated: boolean;
}
```

## Constants (PL-13, PL-5, PL-6)

```ts
/** Lone-ESC disambiguation window in ms — shipped for the RD-07 host's timer (PL-3). */
export const ESC_TIMEOUT_MS = 50;

/** Default bracketed-paste size cap in bytes (PL-5). Configurable via DecodeOptions. */
export const PASTE_CAP_BYTES = 1_048_576; // 1 MiB

// The carry-buffer bound reuses RESPONSE_BUFFER_CAP from capability/query.ts (PL-6).
```

## Named keys (PL-11)

`key` for a named (non-printable) key is one of, lowercase:

```
up down left right
enter tab backspace escape space
home end pageup pagedown insert delete
f1 f2 f3 f4 f5 f6 f7 f8 f9 f10 f11 f12
```

For a printable key, `key` is the decoded character and `codepoint` is its Unicode
code point. Ctrl/Alt combinations over a letter set `key` to the lowercase letter
with the matching modifier flag (e.g. `\x03` → `{ key:'c', ctrl:true }`, AC-1).

## Decode options

```ts
/** Per-decode configuration. All optional; sensible defaults applied. */
export interface DecodeOptions {
  /** Capability profile; selects classic vs CSI-u branch (PL-4) and gates focus (PL-7). */
  readonly caps?: CapabilityProfile;
  /** Override the paste size cap (default PASTE_CAP_BYTES, PL-5). */
  readonly pasteCap?: number;
}
```

> `decode(bytes, state, options?)` — `options` is read-only and never mutated. When
> `caps` is absent the decoder assumes classic xterm decoding and treats focus
> reporting as enabled-tolerant (it decodes `CSI I/O` if seen; the host decides
> whether the mode was enabled).
