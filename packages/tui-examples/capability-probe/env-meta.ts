/**
 * Terminal / OS / environment metadata for the report (RD-03, plan doc 03-02).
 *
 * Security boundary (AR-17): ONLY the allowlisted env keys are read; no other
 * environment value is ever copied into the result. This guarantees the report
 * cannot leak secrets or PII even though the running process may hold them.
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import type { Platform } from '@jsvision/core';

/** Terminal/OS/env metadata recorded in the report (no secrets; allowlisted env). */
export interface EnvMeta {
  /** Best-effort terminal name (TERM_PROGRAM, else TERM, else 'unknown'). */
  readonly terminal: string;
  /** Terminal version from TERM_PROGRAM_VERSION; auto-probe may refine. */
  readonly version: string | null;
  /** Host OS. */
  readonly os: Platform;
  /** `TERM`. */
  readonly term: string | null;
  /** `COLORTERM`. */
  readonly colorterm: string | null;
  /** `TERM_PROGRAM`. */
  readonly termProgram: string | null;
  /** True under tmux/screen (TMUX set, or a screen/tmux TERM). */
  readonly multiplexer: boolean;
  /** ISO-8601 capture time (from an injected clock for determinism). */
  readonly timestamp: string;
}

/**
 * The complete env allowlist. Reading is restricted to these keys so no other
 * environment value can reach the report (AR-17).
 */
const ALLOWED_ENV = ['TERM', 'COLORTERM', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'TMUX'] as const;

type AllowedKey = (typeof ALLOWED_ENV)[number];

/**
 * Copy ONLY the allowlisted keys out of the environment, dropping empty values.
 * This is the structural enforcement of the security boundary: every later read
 * goes through this filtered snapshot, so a non-allowlisted value cannot reach
 * the report even by mistake (AR-17).
 */
function pickAllowed(env: NodeJS.ProcessEnv): Partial<Record<AllowedKey, string>> {
  const picked: Partial<Record<AllowedKey, string>> = {};
  for (const key of ALLOWED_ENV) {
    const value = env[key];
    if (value !== undefined && value !== '') {
      picked[key] = value;
    }
  }
  return picked;
}

/**
 * Collect terminal/OS/env metadata from injectable inputs.
 *
 * @param deps Injectable `env`, `platform`, and `now` (tests pass fixed values for
 *   determinism). Only the {@link ALLOWED_ENV} keys are read from `env`.
 * @returns The metadata block embedded in the report.
 */
export function gatherEnvMeta(deps: { env: NodeJS.ProcessEnv; platform: Platform; now: () => string }): EnvMeta {
  const allowed = pickAllowed(deps.env);
  const term = allowed.TERM ?? null;
  const colorterm = allowed.COLORTERM ?? null;
  const termProgram = allowed.TERM_PROGRAM ?? null;
  const version = allowed.TERM_PROGRAM_VERSION ?? null;
  const tmux = allowed.TMUX ?? null;

  const multiplexer = tmux !== null || (term !== null && /screen|tmux/.test(term));

  return {
    terminal: termProgram ?? term ?? 'unknown',
    version,
    os: deps.platform,
    term,
    colorterm,
    termProgram,
    multiplexer,
    timestamp: deps.now(),
  };
}
