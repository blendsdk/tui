/**
 * The essentials gate (RD-08 §Essentials evaluation; AR-1, AR-2, AR-8).
 *
 * Decides whether the SDK may start on the current terminal, and classifies
 * non-essential capability gaps as degradations rather than stops. The single
 * runtime essential is an interactive TTY (which also covers raw-mode keyboard
 * input — `setRawMode` is isTTY-guarded); cursor addressing and screen clear are
 * universal on any VT/ANSI terminal and therefore implied. Color is NOT gated:
 * `ColorDepth` is a non-null union, so a "color present" check is unreachable
 * dead code (PF-007); monochrome counts and degrades instead.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
import type { CapabilityProfile } from '../capability/profile.js';

import { EssentialsNotMetError } from './errors.js';
import type { Logger } from './logger.js';

/** A non-essential capability gap the SDK degrades around instead of stopping. [AR-8] */
export interface Degradation {
  readonly cap: 'mouse' | 'color' | 'altScreen';
  /** The reduced mode the SDK runs in for this gap. */
  readonly mode: 'keyboard-only' | 'monochrome' | 'inline';
  /** A short, screen-safe human notice (no secrets). */
  readonly message: string;
}

/** Result of evaluating the runtime essentials against caps + host facts. [AR-8] */
export interface EssentialsReport {
  /** True when every essential is satisfied (the SDK may start). */
  readonly met: boolean;
  /** Names of the unmet essentials (empty when `met`). */
  readonly missing: readonly string[];
  /** Non-essential gaps the SDK degrades around (may be present even when `met`). */
  readonly degradations: readonly Degradation[];
}

/**
 * The minimal TTY facts the gate reads. Supply these from `detectTty()` (RD-07)
 * **before** `start()`. An RD-07 `Host` is structurally compatible, but
 * `host.isTTY` is only populated inside `start()`, so do NOT pass an un-started
 * host (PF-001). [AR-2]
 */
export interface HostFacts {
  readonly isTTY: boolean;
}

/** The name reported for the single runtime essential when it is unmet (AC-1). */
const TTY_ESSENTIAL = 'interactive TTY (raw-mode keyboard input)';

/**
 * Build the deterministic degradation list for a profile (mouse → color →
 * altScreen order, per AR-8). Color gating is intentionally absent (PF-007).
 */
function collectDegradations(caps: CapabilityProfile): Degradation[] {
  const degradations: Degradation[] = [];
  if (!caps.mouse.sgr) {
    degradations.push({ cap: 'mouse', mode: 'keyboard-only', message: 'Mouse unavailable: keyboard-only mode.' });
  }
  if (caps.colorDepth === 'mono') {
    degradations.push({ cap: 'color', mode: 'monochrome', message: 'No color: monochrome rendering.' });
  }
  if (!caps.altScreen) {
    degradations.push({ cap: 'altScreen', mode: 'inline', message: 'No alternate screen: inline fallback.' });
  }
  return degradations;
}

/**
 * Evaluate the runtime essentials. Pure — no I/O, no throw — so it is freely
 * testable. [AR-1, AR-8]
 *
 * The single runtime essential is an interactive TTY (`facts.isTTY`). Supply
 * `facts` from `detectTty()` before `start()` (PF-001). Non-essentials degrade
 * (never stop): no mouse → keyboard-only; mono color → monochrome; no alt-screen
 * → inline fallback.
 *
 * @param caps Resolved capability profile (RD-02).
 * @param facts TTY facts from `detectTty()` (an un-started `Host` must NOT be passed — PF-001).
 * @returns The essentials report (met flag, missing list, degradations).
 */
export function evaluateEssentials(caps: CapabilityProfile, facts: HostFacts): EssentialsReport {
  const missing: string[] = [];
  if (!facts.isTTY) missing.push(TTY_ESSENTIAL);
  return { met: missing.length === 0, missing, degradations: collectDegradations(caps) };
}

/**
 * Convenience boolean: `evaluateEssentials(caps, facts).met`. [AR-8]
 *
 * @param caps Resolved capability profile.
 * @param facts TTY facts from `detectTty()`.
 * @returns true when every essential is satisfied.
 */
export function essentialsMet(caps: CapabilityProfile, facts: HostFacts): boolean {
  return evaluateEssentials(caps, facts).met;
}

/**
 * Assert the essentials, throwing `EssentialsNotMetError` when unmet so the SDK
 * does not start. [AR-1, AR-8]
 *
 * Side effects: when `options.logger` is provided, writes each degradation
 * **once** to the logger at `info` (a screen-safe notice — never the UI stream).
 * Does not restore the terminal itself; the caller's host owns guaranteed-restore
 * on the throw path.
 *
 * @param caps Resolved capability profile.
 * @param facts TTY facts from `detectTty()` (see PF-001).
 * @param options Optional `{ logger }` to emit the one-time degradation notices.
 * @returns The `EssentialsReport` when essentials are met (degradations included).
 * @throws EssentialsNotMetError when an essential is unmet.
 */
export function assertEssentials(
  caps: CapabilityProfile,
  facts: HostFacts,
  options?: { readonly logger?: Logger },
): EssentialsReport {
  const report = evaluateEssentials(caps, facts);
  if (!report.met) throw new EssentialsNotMetError(report.missing);
  const logger = options?.logger;
  if (logger) {
    for (const degradation of report.degradations) {
      logger.info('gate', degradation.message, { cap: degradation.cap, mode: degradation.mode });
    }
  }
  return report;
}
