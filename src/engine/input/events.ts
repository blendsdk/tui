/**
 * RD-06 input event model & decoder types (plan doc 03-01).
 *
 * Defines the public, typed event model the decoder emits plus the internal
 * decoder/paste state and per-decode options. All event types are `readonly`
 * plain data (no behaviour). Query responses are deliberately NOT part of the
 * {@link InputEvent} union (PL-9): they are routed through a separate `queries`
 * channel so a terminal reply physically cannot leak as a keystroke (AC-6).
 *
 * The `.js` extension in the import specifier is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
import type { CapabilityProfile } from '../capability/profile.js';

/** A printable or named key press. (AC-1) */
export interface KeyEvent {
  readonly type: 'key';
  /** Printable → the character; named key → a lowercase name (see {@link KEY_NAMES}). */
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

/** A focus in/out report (`CSI I` / `CSI O`), gated on `?1004` by the host (PL-7). */
export interface FocusEvent {
  readonly type: 'focus';
  readonly focused: boolean;
}

/** Any app-facing decoded event. Query responses are NOT in this union (PL-9). */
export type InputEvent = KeyEvent | MouseEvent | WheelEvent | PasteEvent | FocusEvent;

/**
 * A recognised terminal query reply, routed to the RD-02 capability channel only.
 *
 * Never part of {@link InputEvent}; returned in {@link DecodeResult.queries} so a
 * reply cannot be delivered as a keystroke (AC-6). `kind` mirrors the shared
 * classifier ({@link ../capability/responses.js}); `'unknown'` is reserved for
 * future grammars the decoder may route without classifying.
 */
export interface QueryResponse {
  /** The raw recognised bytes (for RD-02 to parse further). */
  readonly raw: Uint8Array;
  /** Classification from the shared responses classifier (`capability/responses.ts`). */
  readonly kind: 'da1' | 'da2' | 'xtversion' | 'decrpm' | 'unknown';
}

/** The result of one {@link decode}/{@link flush} call. */
export interface DecodeResult {
  readonly events: InputEvent[];
  readonly queries: QueryResponse[];
  /** Incomplete trailing bytes carried to the next decode() call. */
  readonly rest: Uint8Array;
}

/** Internal bracketed-paste accumulation state. */
export interface PasteState {
  readonly active: boolean;
  readonly bytes: number[];
  readonly truncated: boolean;
}

/**
 * Opaque carry between {@link decode} calls. Created by `createDecoderState()`.
 * The host carries `rest` forward as the next call's `carry`.
 */
export interface DecoderState {
  /** Incomplete trailing bytes from the previous call (bounded by RESPONSE_BUFFER_CAP, PL-6). */
  readonly carry: Uint8Array;
  /** In-progress bracketed-paste accumulation. */
  readonly paste: PasteState;
}

/**
 * Per-decode configuration. All optional; sensible defaults applied. `options`
 * is read-only and never mutated.
 */
export interface DecodeOptions {
  /** Capability profile; selects classic vs CSI-u branch (PL-4) and informs the host's focus gating (PL-7). */
  readonly caps?: CapabilityProfile;
  /** Override the paste size cap (default {@link PASTE_CAP_BYTES}, PL-5). */
  readonly pasteCap?: number;
}

/** Lone-ESC disambiguation window in ms — shipped for the RD-07 host's timer (PL-3). */
export const ESC_TIMEOUT_MS = 50;

/** Default bracketed-paste size cap in bytes (PL-5). Configurable via {@link DecodeOptions}. */
export const PASTE_CAP_BYTES = 1_048_576; // 1 MiB

/**
 * The named (non-printable) keys the decoder can emit, all lowercase (PL-11).
 * A printable key instead sets `key` to the decoded character plus `codepoint`.
 */
export const KEY_NAMES = [
  'up',
  'down',
  'left',
  'right',
  'enter',
  'tab',
  'backspace',
  'escape',
  'space',
  'home',
  'end',
  'pageup',
  'pagedown',
  'insert',
  'delete',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f11',
  'f12',
] as const;
