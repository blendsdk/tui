/**
 * Per-field layered resolution + reason recording (RD-02, plan doc 03-02).
 *
 * Composes the detection layers below the override (layer 1, applied by
 * {@link ./index.js}): runtime query (layer 2), environment (layer 3), the
 * known-terminal table (layer 4), and conservative defaults (layer 5). Each
 * top-level field group records the single highest-precedence layer that
 * contributed to it (the reason trace, PL-3). `colorDepth` uses the special
 * banded precedence of PL-5; `platform` is always taken from the resolved
 * platform input.
 *
 * Layers 2 (`runtime`) and 4 (`table`) are injected by later phases; when
 * absent they contribute nothing and fields fall through to env/default.
 */
import type {
  CapabilityProfile,
  CapabilityReasons,
  ColorDepth,
  DeepPartial,
  Platform,
  ReasonLayer,
} from './profile.js';
import { CONSERVATIVE_DEFAULTS } from './defaults.js';
import { readEnv, type ColorDepthSignal } from './env.js';

/** Inputs to {@link detectBase}: the ambient signals plus optional layers 2/4. */
export interface DetectInputs {
  /** Environment map for layer 3 (injected; never mutated or logged). */
  readonly env: NodeJS.ProcessEnv;
  /** Resolved host platform (always wins for the `platform` field). */
  readonly platform: Platform;
  /** Layer-2 runtime-query partial (phase 3); absent → skipped. */
  readonly runtime?: DeepPartial<CapabilityProfile>;
  /** Layer-4 known-terminal partial (phase 2); absent → skipped. */
  readonly table?: DeepPartial<CapabilityProfile>;
}

/** A precedence layer carrying a partial profile and the reason it stamps. */
interface OverlayLayer {
  readonly reason: ReasonLayer;
  readonly partial: DeepPartial<CapabilityProfile>;
}

/** A resolved field value paired with the layer that determined it. */
interface ResolvedField<T> {
  readonly value: T;
  readonly reason: ReasonLayer;
}

/**
 * Resolve the base profile (layers 2–5) and its reason trace, before the
 * caller applies the layer-1 override.
 *
 * @param inputs Ambient env/platform plus optional runtime/table layers.
 * @returns The composed `profile` and per-field `reasons`.
 */
export function detectBase(inputs: DetectInputs): {
  profile: CapabilityProfile;
  reasons: CapabilityReasons;
} {
  const envSignals = readEnv(inputs.env);

  // Overlay layers, ordered LOW → HIGH precedence (the default base sits below
  // all of them; the override sits above all of them and is applied later).
  const overlays: ReadonlyArray<OverlayLayer> = [
    { reason: 'table', partial: inputs.table ?? {} },
    { reason: 'env', partial: envSignals.profile },
    { reason: 'runtime', partial: inputs.runtime ?? {} },
  ];

  const mouse = resolveField('mouse', overlays);
  const unicode = resolveField('unicode', overlays);
  const osc = resolveField('osc', overlays);
  const sync2026 = resolveField('sync2026', overlays);
  const altScreen = resolveField('altScreen', overlays);
  const bracketedPaste = resolveField('bracketedPaste', overlays);
  const keyboard = resolveField('keyboard', overlays);
  const glyphs = resolveField('glyphs', overlays);
  const multiplexer = resolveField('multiplexer', overlays);
  const colorDepth = resolveColorDepth(envSignals.colorDepth, inputs.runtime, inputs.table);

  const profile: CapabilityProfile = {
    colorDepth: colorDepth.value,
    mouse: mouse.value,
    unicode: unicode.value,
    osc: osc.value,
    sync2026: sync2026.value,
    altScreen: altScreen.value,
    bracketedPaste: bracketedPaste.value,
    keyboard: keyboard.value,
    glyphs: glyphs.value,
    platform: inputs.platform,
    multiplexer: multiplexer.value,
  };

  const reasons: CapabilityReasons = {
    colorDepth: colorDepth.reason,
    mouse: mouse.reason,
    unicode: unicode.reason,
    osc: osc.reason,
    sync2026: sync2026.reason,
    altScreen: altScreen.reason,
    bracketedPaste: bracketedPaste.reason,
    keyboard: keyboard.reason,
    glyphs: glyphs.reason,
    // platform is always actively sourced from the resolved platform input.
    platform: 'env',
    multiplexer: multiplexer.reason,
  };

  return { profile, reasons };
}

/**
 * Resolve a single non-colorDepth field by merging each overlay layer (in
 * ascending precedence) over the conservative default. The reason is the
 * highest-precedence layer that contributed any value, or `'default'`.
 */
function resolveField<K extends keyof CapabilityProfile>(
  field: K,
  overlays: ReadonlyArray<OverlayLayer>,
): ResolvedField<CapabilityProfile[K]> {
  let value: CapabilityProfile[K] = CONSERVATIVE_DEFAULTS[field];
  let reason: ReasonLayer = 'default';

  for (const layer of overlays) {
    const part = layer.partial[field];
    if (part === undefined) continue;
    value = deepMerge(value, part);
    reason = layer.reason;
  }

  return { value, reason };
}

/**
 * Resolve `colorDepth` under the PL-5 banded precedence (override excluded —
 * applied later by the resolver):
 * `NO_COLOR/FORCE_COLOR (env.forced) > runtime > COLORTERM/TERM (env.soft) >
 * table > default`.
 */
function resolveColorDepth(
  signal: ColorDepthSignal,
  runtime: DeepPartial<CapabilityProfile> | undefined,
  table: DeepPartial<CapabilityProfile> | undefined,
): ResolvedField<ColorDepth> {
  if (signal.forced !== undefined) {
    return { value: signal.forced, reason: 'env' };
  }
  if (runtime?.colorDepth !== undefined) {
    return { value: runtime.colorDepth, reason: 'runtime' };
  }
  if (signal.soft !== undefined) {
    return { value: signal.soft, reason: 'env' };
  }
  if (table?.colorDepth !== undefined) {
    return { value: table.colorDepth, reason: 'table' };
  }
  return { value: CONSERVATIVE_DEFAULTS.colorDepth, reason: 'default' };
}

/** Type guard for a plain (non-array) object, used by {@link deepMerge}. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Immutably deep-merge a {@link DeepPartial} over a full base value, leaf by
 * leaf (PL-7). Plain objects recurse; every other value (primitive/array) is a
 * leaf the partial replaces when present. `undefined` partial values are
 * ignored so an explicitly-absent key never clears a base value. Never mutates
 * `base`.
 *
 * @param base Full base value (e.g. a resolved field or the whole profile).
 * @param partial Partial overlay whose set leaves win.
 * @returns A new value with the partial merged over the base.
 */
export function deepMerge<T>(base: T, partial: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(partial)) {
    // Leaf (or shape mismatch): the partial value wins when provided.
    return partial as T;
  }

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    const baseValue = base[key];
    result[key] = isPlainObject(baseValue) && isPlainObject(value) ? deepMerge(baseValue, value) : value;
  }
  return result as T;
}
