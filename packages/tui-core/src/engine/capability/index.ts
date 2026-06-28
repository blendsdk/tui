/**
 * Public entry point of the RD-02 capability subsystem (plan doc 03-02).
 *
 * Exposes two resolvers (RT-2):
 * - {@link resolveCapabilities} — **synchronous**; composes layers 1/3/4/5 and
 *   caches the ambient resolution per-process (PL-14). Cannot run a live query.
 * - {@link resolveCapabilitiesAsync} — **asynchronous**; additionally runs the
 *   layer-2 runtime query (PL-1) when a {@link TerminalQuery} seam is supplied,
 *   then delegates to the same compose → override → freeze core.
 *
 * Both return an immutable {@link CapabilityResolution} (`{ profile, reasons }`):
 * the layer-1 override is deep-merged (PL-7) and the result is deep-frozen (PL-9).
 */
import type {
  CapabilityProfile,
  CapabilityReasons,
  CapabilityResolution,
  DeepPartial,
  Platform,
  ReasonLayer,
  ResolveOptions,
} from './profile.js';
import { detectBase, deepMerge } from './detect.js';
import { lookupTable } from './table.js';
import { runQueries, DEFAULT_QUERY_TIMEOUT_MS } from './query.js';

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
 * Options for the synchronous {@link resolveCapabilities}. Layer 2 is async, so
 * `query`/`timeoutMs` are excluded here (RT-2) — passing a query is a compile
 * error; use {@link resolveCapabilitiesAsync} for live queries.
 */
export type SyncResolveOptions = Omit<ResolveOptions, 'query' | 'timeoutMs'>;

/**
 * Per-process cache of the ambient resolution (PL-14). Holds only the result of
 * a call with no per-call inputs (no override/env/platform/query); a call with
 * any such input bypasses the cache and never poisons it.
 */
let ambientCache: CapabilityResolution | undefined;

/**
 * Resolve the running terminal's capabilities **synchronously** (layers 1/3/4/5).
 *
 * Detection is fully injectable via {@link SyncResolveOptions} (env, platform)
 * so callers and tests stay hermetic. With no options the ambient resolution is
 * computed once and cached; `refresh: true` recomputes and replaces the cache.
 * For a live layer-2 query, use {@link resolveCapabilitiesAsync}.
 *
 * @param options Optional override, injected env/platform, and `refresh` flag.
 * @returns A deep-frozen `{ profile, reasons }`.
 */
export function resolveCapabilities(options: SyncResolveOptions = {}): CapabilityResolution {
  const isAmbient = options.override === undefined && options.env === undefined && options.platform === undefined;

  if (isAmbient && options.refresh !== true && ambientCache !== undefined) {
    return ambientCache;
  }

  const env = options.env ?? process.env;
  const platform = options.platform ?? toPlatform(process.platform);
  const result = composeResolution({ env, platform, override: options.override });

  if (isAmbient) {
    // Cache (or, on refresh, replace) the ambient resolution only.
    ambientCache = result;
  }
  return result;
}

/**
 * Resolve the running terminal's capabilities **asynchronously**, additionally
 * running the layer-2 runtime query when `options.query` is supplied (PL-1).
 *
 * Always resolves, never rejects: a silent/oversized/malformed response falls
 * back to layers 3/4/5 (AC-3/AC-7). This path never reads or writes the ambient
 * cache — a query (or any injected input) is a per-call concern.
 *
 * @param options Override, injected env/platform, the live-query seam, and
 *   `timeoutMs`.
 * @returns A promise of a deep-frozen `{ profile, reasons }`.
 */
export async function resolveCapabilitiesAsync(options: ResolveOptions = {}): Promise<CapabilityResolution> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? toPlatform(process.platform);

  let runtime: DeepPartial<CapabilityProfile> | undefined;
  if (options.query !== undefined) {
    const { parsed } = await runQueries(options.query, options.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS);
    runtime = parsed;
  }

  return composeResolution({ env, platform, runtime, override: options.override });
}

/**
 * Shared resolution core for both entry points: compose layers 2–5 via
 * {@link detectBase}, apply the layer-1 override, and deep-freeze the result.
 */
function composeResolution(params: {
  env: NodeJS.ProcessEnv;
  platform: Platform;
  runtime?: DeepPartial<CapabilityProfile>;
  override?: ResolveOptions['override'];
}): CapabilityResolution {
  const table = lookupTable(params.env);
  const base = detectBase({
    env: params.env,
    platform: params.platform,
    table,
    runtime: params.runtime,
  });
  const merged = applyOverride(base, params.override);
  return freezeResolution(merged);
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
