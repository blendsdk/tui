# Capability Model & Types: RD-02

> **Document**: 03-01-capability-model-and-types.md
> **Parent**: [Index](00-index.md)

## Overview

Defines the public data model: `CapabilityProfile`, the reason trace, the resolve
options, and the return shape. These types are the stable contract every later RD
consumes (PL-2), so the **full** shape is defined now even where values come from
table/defaults until RD-03 refines them.

## `src/engine/capability/profile.ts`

```ts
/** Color rendering depth, coarsest to richest. */
export type ColorDepth = 'mono' | '16' | '256' | 'truecolor';

/** The layer that determined a given field (the "reason trace"). PL-3. */
export type ReasonLayer = 'override' | 'runtime' | 'env' | 'table' | 'default';

export interface MouseCaps {
  readonly sgr: boolean;
  readonly drag: boolean;
  readonly wheel: boolean;
}

export interface UnicodeCaps {
  readonly utf8: boolean;
  readonly widthMode: 'wcwidth' | 'ambiguous-wide';
  readonly emoji: 'narrow' | 'wide' | 'unknown';
}

export interface OscCaps {
  readonly hyperlink8: boolean;
  readonly clipboard52: boolean;
  readonly title: boolean;
  readonly notify9: boolean;
  readonly notify777: boolean;
  readonly notify99: boolean;
  readonly progress9_4: boolean;
}

export interface KeyboardCaps {
  readonly kittyFlags: boolean;
  readonly modifyOtherKeys: boolean;
}

export interface GlyphCaps {
  readonly boxDrawing: boolean;
  readonly halfBlocks: boolean;
}

export type Platform = 'linux' | 'darwin' | 'win32';

/** Immutable description of the running terminal (RD-02 §CapabilityProfile). */
export interface CapabilityProfile {
  readonly colorDepth: ColorDepth;
  readonly mouse: MouseCaps;
  readonly unicode: UnicodeCaps;
  readonly osc: OscCaps;
  readonly sync2026: boolean;
  readonly altScreen: boolean;
  readonly bracketedPaste: boolean;
  readonly keyboard: KeyboardCaps;
  readonly glyphs: GlyphCaps;
  readonly platform: Platform;
  /** True when running under tmux/screen; consumers apply passthrough policy. */
  readonly multiplexer: boolean;
}

/** Per-field reason trace, mirroring the profile's leaf fields. */
export interface CapabilityReasons {
  readonly colorDepth: ReasonLayer;
  readonly mouse: ReasonLayer;
  readonly unicode: ReasonLayer;
  readonly osc: ReasonLayer;
  readonly sync2026: ReasonLayer;
  readonly altScreen: ReasonLayer;
  readonly bracketedPaste: ReasonLayer;
  readonly keyboard: ReasonLayer;
  readonly glyphs: ReasonLayer;
  readonly platform: ReasonLayer;
  readonly multiplexer: ReasonLayer;
}

/** Recursive partial used by the override API (PL-7). */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Minimal byte-stream seam for layer-2 runtime queries (PL-1). Implemented by RD-06. */
export interface TerminalQuery {
  /** Write a query request (e.g. a DA request) to the terminal. */
  write(data: string): void;
  /** Async iterator of raw bytes received from the terminal. */
  read(): AsyncIterable<Uint8Array>;
}

export interface ResolveOptions {
  /** Force any subset of fields, bypassing detection (deep-merged). PL-7. */
  readonly override?: DeepPartial<CapabilityProfile>;
  /** Environment to read from; defaults to `process.env`. (Injectable for tests.) */
  readonly env?: NodeJS.ProcessEnv;
  /** Platform to assume; defaults to `process.platform`. */
  readonly platform?: Platform;
  /** Optional live-query seam; when absent, layer 2 is skipped (PL-1). */
  readonly query?: TerminalQuery;
  /** Live-query timeout in ms (default 200, PL-11). */
  readonly timeoutMs?: number;
  /** Force re-resolution, ignoring the per-process cache (PL-14). */
  readonly refresh?: boolean;
}

/** Frozen result returned by `resolveCapabilities` (PL-6, PL-9). */
export interface CapabilityResolution {
  readonly profile: CapabilityProfile;
  readonly reasons: CapabilityReasons;
}
```

## Design Notes

- **Reason granularity (PL-3):** reasons mirror the profile's **top-level** fields
  (one `ReasonLayer` per field group), not every nested boolean — enough for RD-03's
  report without a parallel deep tree. Recorded against RD-02's "reason trace" Should-have.
- **`multiplexer` field:** RD-02's Must-have "detect tmux/screen … passthrough policy"
  is modelled as a `multiplexer: boolean` profile field (not in RD-02's field table,
  but required by the Must-have). Added here; AR-traced to that requirement.
- **Immutability (PL-9):** `resolveCapabilities` deep-`Object.freeze`s both `profile`
  and `reasons` before returning; the `readonly` types make mutation a compile error too.

## Integration Points
- `src/engine/index.ts` re-exports `resolveCapabilities` and these types.
- RD-04/05/06/07 import `CapabilityProfile`; RD-03 imports `CapabilityReasons`.

## Testing Requirements
- The type contract is exercised indirectly by the resolve ST-cases (07). A dedicated
  impl test asserts the returned objects are frozen (ST-12) and that `DeepPartial`
  override merges nested fields (ST-9).
