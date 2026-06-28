/**
 * Capability data model (RD-02 §CapabilityProfile, plan doc 03-01).
 *
 * Defines the public, immutable contract every later subsystem (color, input,
 * rendering, host) reads to auto-configure: the {@link CapabilityProfile}, the
 * per-field {@link CapabilityReasons} trace, the resolve {@link ResolveOptions},
 * and the frozen {@link CapabilityResolution} return shape. The full shape is
 * defined now even where some fields are populated from the table/defaults until
 * RD-03 refines them (PL-2), so the type stays stable for RD-04+.
 *
 * All fields are `readonly`; {@link CapabilityResolution} is additionally
 * deep-frozen at runtime (PL-9) so mutation fails both at compile time and at
 * runtime.
 */

/** Color rendering depth, coarsest to richest. */
export type ColorDepth = 'mono' | '16' | '256' | 'truecolor';

/** The layer that determined a given field (the "reason trace", PL-3). */
export type ReasonLayer = 'override' | 'runtime' | 'env' | 'table' | 'default';

/** Mouse-reporting capabilities. */
export interface MouseCaps {
  readonly sgr: boolean;
  readonly drag: boolean;
  readonly wheel: boolean;
}

/** Unicode rendering capabilities. */
export interface UnicodeCaps {
  readonly utf8: boolean;
  readonly widthMode: 'wcwidth' | 'ambiguous-wide';
  readonly emoji: 'narrow' | 'wide' | 'unknown';
}

/** OSC (Operating System Command) escape-sequence capabilities. */
export interface OscCaps {
  readonly hyperlink8: boolean;
  readonly clipboard52: boolean;
  readonly title: boolean;
  readonly notify9: boolean;
  readonly notify777: boolean;
  readonly notify99: boolean;
  readonly progress9_4: boolean;
}

/** Keyboard-protocol capabilities. */
export interface KeyboardCaps {
  readonly kittyFlags: boolean;
  readonly modifyOtherKeys: boolean;
}

/** Line/box glyph rendering capabilities. */
export interface GlyphCaps {
  readonly boxDrawing: boolean;
  readonly halfBlocks: boolean;
}

/** Host platform, mirroring `process.platform`'s supported values for RD-02. */
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

/**
 * Per-field reason trace, mirroring the profile's top-level fields (one
 * {@link ReasonLayer} per field group, PL-3 — not every nested boolean).
 */
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

/**
 * Minimal byte-stream seam for layer-2 runtime queries (PL-1).
 *
 * Implemented by RD-06's input decoder later; RD-02 ships only the seam and a
 * stub-driven parser. When `options.query` is absent, layer 2 is skipped.
 */
export interface TerminalQuery {
  /** Write a query request (e.g. a DA request) to the terminal. */
  write(data: string): void;
  /** Async iterator of raw bytes received from the terminal. */
  read(): AsyncIterable<Uint8Array>;
}

/** Options for {@link resolveCapabilities}; every input is injectable for tests. */
export interface ResolveOptions {
  /** Force any subset of fields, bypassing detection (deep-merged, PL-7). */
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

/** Frozen result returned by {@link resolveCapabilities} (PL-6, PL-9). */
export interface CapabilityResolution {
  readonly profile: CapabilityProfile;
  readonly reasons: CapabilityReasons;
}
