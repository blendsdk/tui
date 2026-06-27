/**
 * Layer-3 environment-signal reader (RD-02, plan doc 03-02).
 *
 * Pure function over an injected {@link NodeJS.ProcessEnv}. Reads only the
 * non-sensitive variables listed below and never logs their values (AC-8). It
 * returns the fields the environment determines plus the split colorDepth
 * signal, because colorDepth has a special precedence (PL-5): `NO_COLOR` and
 * `FORCE_COLOR` outrank the layer-2 runtime query, whereas `COLORTERM`/`TERM`
 * rank below it. The resolver ({@link ./detect.js}) wires these into the
 * per-field precedence; this module makes no precedence decision beyond the
 * env-internal `NO_COLOR > FORCE_COLOR > COLORTERM > TERM` order.
 *
 * | Var(s) | Effect |
 * | ------ | ------ |
 * | `NO_COLOR` (present, any value, PL-12) | forced colorDepth `mono` |
 * | `FORCE_COLOR=0\|1\|2\|3` | forced colorDepth `mono\|16\|256\|truecolor` |
 * | `COLORTERM=truecolor\|24bit` | soft colorDepth `truecolor` |
 * | `TERM` contains `256color` | soft colorDepth `256` |
 * | `TERM` set (other) | soft colorDepth `16` |
 * | `LC_ALL`/`LC_CTYPE`/`LANG` contains `UTF-8` (ci) | `unicode.utf8 = true` |
 * | `$TMUX` set, or `TERM` starts `screen`/`tmux` | `multiplexer = true` |
 */
import type { ColorDepth, DeepPartial, CapabilityProfile } from './profile.js';

/** FORCE_COLOR numeric level → colorDepth (PL-5); other values are invalid. */
const FORCE_COLOR_LEVELS: Readonly<Record<string, ColorDepth>> = {
  '0': 'mono',
  '1': '16',
  '2': '256',
  '3': 'truecolor',
};

/** COLORTERM values that indicate 24-bit color (case-insensitive match). */
const TRUECOLOR_COLORTERMS: ReadonlySet<string> = new Set(['truecolor', '24bit']);

/**
 * The colorDepth signals derived from the environment, split by precedence band
 * so the resolver can slot each at the correct rank relative to layer 2 (PL-5).
 */
export interface ColorDepthSignal {
  /** From `NO_COLOR`/`FORCE_COLOR` — outranks the runtime query. */
  readonly forced?: ColorDepth;
  /** From `COLORTERM`/`TERM` — ranks below the runtime query. */
  readonly soft?: ColorDepth;
}

/** Result of reading layer-3 environment signals. */
export interface EnvSignals {
  /** Fields (other than colorDepth) the environment fully determines. */
  readonly profile: DeepPartial<CapabilityProfile>;
  /** The split colorDepth signal (see {@link ColorDepthSignal}). */
  readonly colorDepth: ColorDepthSignal;
}

/**
 * Read layer-3 capability signals from an environment map.
 *
 * @param env The environment to read (injected; never mutated, never logged).
 * @returns The determined non-colorDepth fields plus the split colorDepth signal.
 */
export function readEnv(env: NodeJS.ProcessEnv): EnvSignals {
  const profile: { unicode?: { utf8: boolean }; multiplexer?: boolean } = {};

  if (detectUtf8(env)) {
    profile.unicode = { utf8: true };
  }

  // Running under tmux/screen → flag the multiplexer (consumers apply a
  // passthrough policy). Caps stay conservative: nothing rich is asserted here.
  if (detectMultiplexer(env)) {
    profile.multiplexer = true;
  }

  return { profile, colorDepth: readColorDepth(env) };
}

/**
 * Resolve the colorDepth signal with the env-internal precedence
 * `NO_COLOR > FORCE_COLOR > COLORTERM > TERM` (PL-5). `NO_COLOR` and
 * `FORCE_COLOR` produce a `forced` value; `COLORTERM`/`TERM` produce a `soft`
 * value. An invalid `FORCE_COLOR` (e.g. `9`) is ignored and falls through.
 */
function readColorDepth(env: NodeJS.ProcessEnv): ColorDepthSignal {
  // NO_COLOR: presence with any value (including empty string) forces mono (PL-12).
  if (env.NO_COLOR !== undefined) {
    return { forced: 'mono' };
  }

  // FORCE_COLOR: only the exact levels 0..3 are honored; anything else is invalid.
  const force = env.FORCE_COLOR;
  if (force !== undefined && force in FORCE_COLOR_LEVELS) {
    return { forced: FORCE_COLOR_LEVELS[force] };
  }

  const soft = readSoftColorDepth(env);
  return soft === undefined ? {} : { soft };
}

/** The lower-precedence colorDepth hint from `COLORTERM` then `TERM`. */
function readSoftColorDepth(env: NodeJS.ProcessEnv): ColorDepth | undefined {
  const colorterm = env.COLORTERM?.toLowerCase();
  if (colorterm !== undefined && TRUECOLOR_COLORTERMS.has(colorterm)) {
    return 'truecolor';
  }

  const term = env.TERM;
  if (term !== undefined && term.length > 0) {
    return term.includes('256color') ? '256' : '16';
  }

  return undefined;
}

/**
 * Detect UTF-8 from the effective locale, honoring POSIX precedence
 * `LC_ALL > LC_CTYPE > LANG` (the first variable that is set wins).
 */
function detectUtf8(env: NodeJS.ProcessEnv): boolean {
  const effectiveLocale = env.LC_ALL ?? env.LC_CTYPE ?? env.LANG;
  if (effectiveLocale === undefined) {
    return false;
  }
  return /utf-?8/i.test(effectiveLocale);
}

/**
 * Detect a tmux/screen multiplexer: `$TMUX` set, or a `TERM` beginning with
 * `screen` or `tmux` (the canonical multiplexer TERM prefixes).
 */
function detectMultiplexer(env: NodeJS.ProcessEnv): boolean {
  if (env.TMUX !== undefined) {
    return true;
  }
  const term = env.TERM;
  return term !== undefined && (term.startsWith('screen') || term.startsWith('tmux'));
}
