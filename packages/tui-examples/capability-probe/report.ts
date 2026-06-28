/**
 * Report data model for the capability-probe harness (RD-03, plan doc 03-02/03-04).
 *
 * Phase 1 defines the types every later phase populates; the builder,
 * recommendation derivation, table renderer, and JSON serializer land in Phase 5
 * (see plan doc 03-04). The schema contains ONLY these fields — there is no
 * free-form environment map — so no secret can leak through the report (AR-17).
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import type { CapabilityProfile, ColorDepth, Platform, UnicodeCaps } from '@jsvision/core';
import type { EnvMeta } from './env-meta.js';
import { PROBES } from './taxonomy.js';

/** How a capability result was obtained. */
export type ProbeMethod = 'auto' | 'manual';

/** One capability result. `supported: null` means "could not determine" (AR-11). */
export interface ProbeResult {
  readonly supported: boolean | null;
  readonly method: ProbeMethod;
  readonly note?: string;
}

/** The recommendation block: key fields echoed from the resolved profile (AR-10). */
export interface Recommendation {
  readonly colorDepth: ColorDepth;
  readonly mouse: boolean;
  readonly unicodeWidth: UnicodeCaps['widthMode'];
  readonly altScreen: boolean;
  readonly bracketedPaste: boolean;
}

/** The full per-run report; `terminal-matrix.json` is a JSON array of these. */
export interface Report {
  readonly terminal: string;
  readonly version: string | null;
  readonly os: Platform;
  readonly term: string | null;
  readonly colorterm: string | null;
  readonly termProgram: string | null;
  readonly multiplexer: boolean;
  readonly timestamp: string;
  readonly results: Record<string, ProbeResult>;
  readonly recommendation: Recommendation;
}

/**
 * Derive the recommendation by folding manual confirmations into the resolved
 * profile as override evidence, then echoing the key fields (AR-10). A confirmed
 * swatch raises the recommended color depth; a confirmed click/alt-screen probe
 * overrides the corresponding profile field; otherwise the profile stands.
 *
 * @param deps The resolved `caps` profile and the merged probe `results`.
 * @returns The recommendation block.
 */
export function deriveRecommendation(deps: {
  caps: CapabilityProfile;
  results: Record<string, ProbeResult>;
}): Recommendation {
  const { caps, results } = deps;
  const confirmed = (id: string): boolean => results[id]?.supported === true;

  const colorDepth: ColorDepth = confirmed('color.swatch.truecolor')
    ? 'truecolor'
    : confirmed('color.swatch.256')
      ? '256'
      : confirmed('color.swatch.16')
        ? '16'
        : caps.colorDepth;

  return {
    colorDepth,
    mouse: confirmed('mouse.click') || caps.mouse.sgr,
    unicodeWidth: caps.unicode.widthMode,
    altScreen: confirmed('host.altScreen') || caps.altScreen,
    bracketedPaste: caps.bracketedPaste,
  };
}

/**
 * Assemble the final report. Every probe id in the taxonomy is present: ids not
 * in `results` default to `supported: null` with their taxonomy method, so the
 * report records everything (never-stop, AR-15) and `--auto` leaves manual items
 * unverified (AR-11). Contains only schema fields — no free-form env (AR-17).
 *
 * @param deps The `meta`, the merged `results`, and the `recommendation`.
 * @returns The complete {@link Report}.
 */
export function buildReport(deps: {
  meta: EnvMeta;
  results: Record<string, ProbeResult>;
  recommendation: Recommendation;
}): Report {
  const results: Record<string, ProbeResult> = {};
  for (const probe of PROBES) {
    results[probe.id] = deps.results[probe.id] ?? { supported: null, method: probe.method };
  }
  return { ...deps.meta, results, recommendation: deps.recommendation };
}

/** Render a support marker for the human table. */
function mark(supported: boolean | null): string {
  if (supported === true) return 'yes';
  if (supported === false) return ' no';
  return '  ?';
}

/**
 * Render the report as a human-readable, group-organised table (AR-5).
 *
 * @param report The report to render.
 * @returns A multi-line string for stdout.
 */
export function renderTable(report: Report): string {
  const lines: string[] = [];
  lines.push(
    `Terminal: ${report.terminal}   OS: ${report.os}   TERM: ${report.term ?? '-'}   COLORTERM: ${report.colorterm ?? '-'}`,
  );
  lines.push(`Time: ${report.timestamp}`);
  lines.push('');

  let group = '';
  for (const probe of PROBES) {
    if (probe.group !== group) {
      group = probe.group;
      lines.push(`[${group}]`);
    }
    const result = report.results[probe.id];
    lines.push(`  ${mark(result.supported)}  ${probe.label} (${result.method})`);
  }

  const rec = report.recommendation;
  lines.push('');
  lines.push(
    `Recommendation: colorDepth=${rec.colorDepth} mouse=${rec.mouse} ` +
      `unicodeWidth=${rec.unicodeWidth} altScreen=${rec.altScreen} bracketedPaste=${rec.bracketedPaste}`,
  );
  return lines.join('\n');
}

/** Serialize the report as pretty JSON (stdout in `--auto`; `--out` file). */
export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}
