/**
 * Public entry point of the RD-02 capability subsystem (plan doc 03-02).
 *
 * Exposes {@link resolveCapabilities}: resolve an immutable
 * {@link CapabilityResolution} (`{ profile, reasons }`) from the layered
 * detection in {@link ./detect.js}, then apply the caller's layer-1 override
 * (PL-7), deep-freeze the result (PL-9), and cache the ambient resolution
 * per-process (PL-14).
 *
 * Layer 2 (runtime query) and layer 4 (known-terminal table) are wired in by
 * later phases; until then the resolver relies on layers 1/3/5.
 */
import type {
  CapabilityProfile,
  CapabilityReasons,
  CapabilityResolution,
  Platform,
  ReasonLayer,
  ResolveOptions,
} from './profile.js';
import { detectBase, deepMerge } from './detect.js';

export type {
  CapabilityProfile,
  CapabilityReasons,
  CapabilityResolution,
  ColorDepth,
  DeepPartial,
  GlyphCaps,
  KeyboardCaps,
  MouseCaps,
  OscCaps,
  Platform,
  ReasonLayer,
  ResolveOptions,
  TerminalQuery,
  UnicodeCaps,
} from './profile.js';

/**
 * Per-process cache of the ambient resolution (PL-14). Holds only the result of
 * a call with no per-call inputs (no override/env/platform/query); a call with
 * any such input bypasses the cache and never poisons it.
 */
let ambientCache: CapabilityResolution | undefined;

/**
 * Resolve the running terminal's capabilities.
 *
 * Detection is fully injectable via {@link ResolveOptions} (env, platform,
 * query) so callers and tests stay hermetic. With no options the ambient
 * resolution is computed once and cached; `refresh: true` recomputes and
 * replaces the cache.
 *
 * @param options Optional override, injected env/platform/query, timeout, and
 *   `refresh` flag.
 * @returns A deep-frozen `{ profile, reasons }`.
 */
export function resolveCapabilities(options: ResolveOptions = {}): CapabilityResolution {
  const isAmbient =
    options.override === undefined &&
    options.env === undefined &&
    options.platform === undefined &&
    options.query === undefined;

  if (isAmbient && options.refresh !== true && ambientCache !== undefined) {
    return ambientCache;
  }

  const env = options.env ?? process.env;
  const platform = options.platform ?? toPlatform(process.platform);

  // Layers 2 (runtime) and 4 (table) are injected by later phases; until then
  // detection composes layers 3/5 only.
  const base = detectBase({ env, platform });

  const merged = applyOverride(base, options.override);
  const result = freezeResolution(merged);

  if (isAmbient) {
    // Cache (or, on refresh, replace) the ambient resolution only.
    ambientCache = result;
  }
  return result;
}

/**
 * Apply the layer-1 override (PL-7): deep-merge it over the detected profile
 * and stamp every overridden top-level field's reason as `'override'`.
 */
function applyOverride(
  base: { profile: CapabilityProfile; reasons: CapabilityReasons },
  override: ResolveOptions['override'],
): { profile: CapabilityProfile; reasons: CapabilityReasons } {
  if (override === undefined) {
    return base;
  }

  const profile = deepMerge(base.profile, override);
  const reasons: Record<keyof CapabilityReasons, ReasonLayer> = { ...base.reasons };

  // `keyof CapabilityReasons` === `keyof CapabilityProfile`; both share the
  // same top-level field names, so an override key maps to a reason key.
  for (const key of Object.keys(reasons) as (keyof CapabilityReasons)[]) {
    if (override[key] !== undefined) {
      reasons[key] = 'override';
    }
  }

  return { profile, reasons };
}

/** Deep-freeze both halves of the resolution before returning (PL-9). */
function freezeResolution(resolution: {
  profile: CapabilityProfile;
  reasons: CapabilityReasons;
}): CapabilityResolution {
  return {
    profile: deepFreeze(resolution.profile),
    reasons: deepFreeze(resolution.reasons),
  };
}

/**
 * Recursively `Object.freeze` an object graph. Untouched field groups may share
 * a reference with the (immutable) conservative defaults; freezing those is a
 * harmless no-op since the defaults are constants.
 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/** Narrow `process.platform` to the supported {@link Platform} set (AR-4). */
function toPlatform(platform: NodeJS.Platform): Platform {
  return platform === 'darwin' || platform === 'win32' ? platform : 'linux';
}
