/**
 * Automatic probes (RD-03, plan doc 03-03).
 *
 * Drives the live terminal query through the public `resolveCapabilitiesAsync`
 * (which runs RD-02's bounded query loop internally), then maps the resolved
 * {@link CapabilityProfile} fields into `method:'auto'` results (RT-3). This keeps
 * the harness off `capability/` internals and reuses RD-02 as the single source of
 * truth. It always settles under the bounded timeout — a silent terminal yields
 * `supported:false` for query-only facts, never a hang or throw (AR-9, AR-15).
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import { resolveCapabilitiesAsync } from '@jsvision/core';
import type { Platform, TerminalQuery } from '@jsvision/core';
import type { ProbeResult } from './report.js';

/**
 * Run the automatic probes and return their results keyed by probe id.
 *
 * @param deps Injectable `query` (live terminal seam), `env`, `platform`, and an
 *   optional `timeoutMs` (forwarded to the RD-02 query loop).
 * @returns A map of `auto` probe ids to {@link ProbeResult}; always resolves.
 */
export async function runAutoProbes(deps: {
  query: TerminalQuery;
  env: NodeJS.ProcessEnv;
  platform: Platform;
  timeoutMs?: number;
}): Promise<Record<string, ProbeResult>> {
  const { profile } = await resolveCapabilitiesAsync({
    query: deps.query,
    env: deps.env,
    platform: deps.platform,
    timeoutMs: deps.timeoutMs,
    refresh: true,
  });

  const auto = (supported: boolean): ProbeResult => ({ supported, method: 'auto' });

  return {
    'output.sync2026': auto(profile.sync2026),
    'output.altScreen': auto(profile.altScreen),
    'input.bracketedPaste': auto(profile.bracketedPaste),
    'color.truecolor': auto(profile.colorDepth === 'truecolor'),
    'color.256': auto(profile.colorDepth === '256' || profile.colorDepth === 'truecolor'),
    'mouse.sgr': auto(profile.mouse.sgr),
    'unicode.utf8': auto(profile.unicode.utf8),
  };
}
