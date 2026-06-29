# Essentials Gate & Error Model: RD-08

> **Document**: 03-01-essentials-gate-and-errors.md
> **Parent**: [Index](00-index.md)
> **Files**: `src/engine/safety/essentials.ts`, `src/engine/safety/errors.ts`

## Overview

The essentials gate decides whether the SDK is allowed to start on the current terminal, and
classifies non-essential gaps as degradations rather than stops. The error model gives the gate
(and the logger) typed, `instanceof`-discriminable failures. Together they implement RD-08's
"refuse to run broken" runtime policy (AR-1, AR-7, AR-8).

## Architecture

### Current Architecture
No gate and no typed errors exist. The host enters modes unconditionally; failures propagate as
native `Error`s, with the host's crash path restoring the terminal before exit (`host.ts:113`).

### Proposed Changes
- `errors.ts` defines a `TuiError` base and two subclasses. *(AR-7)*
- `essentials.ts` defines a pure `evaluateEssentials()`, a boolean `essentialsMet()` convenience,
  and a throwing `assertEssentials()` that optionally logs degradations once. *(AR-1, AR-8)*
- The gate reads TTY `facts` (from `detectTty()`) + `caps`; no RD-02/RD-07 *type* changes. The
  additive `detectTty()` helper is factored from RD-07 `bindStreams` (PF-001). *(AR-2)*

## Implementation Details

### New Types/Interfaces (`errors.ts`)

```ts
/** Base class for every error the SDK throws, so consumers can catch `TuiError` broadly. [AR-7] */
export class TuiError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = new.target.name; // concrete subclass name in stacks
  }
}

/**
 * Thrown when the runtime essentials are not met and the SDK refuses to start. [AR-1, AR-2]
 * @property missing The unmet essential(s), e.g. `['interactive TTY (raw-mode keyboard input)']`.
 */
export class EssentialsNotMetError extends TuiError {
  public readonly missing: readonly string[];
  public constructor(missing: readonly string[]) {
    super(`Terminal does not meet the SDK essentials: ${missing.join(', ')}.`);
    this.missing = missing;
  }
}

/** Thrown by createLogger when a configured sink resolves to the UI output stream. [AR-7, AR-10] */
export class LoggerConfigError extends TuiError {}
```

### New Types/Interfaces (`essentials.ts`)

```ts
import type { CapabilityProfile } from '../capability/profile.js';

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
 * The minimal TTY facts the gate reads. Supply these from `detectTty()` (RD-07) **before**
 * `start()`. An RD-07 `Host` is structurally compatible, but `host.isTTY` is only populated
 * inside `start()` (`host.ts:138`), so do NOT pass an un-started host (PF-001). [AR-2]
 */
export interface HostFacts {
  readonly isTTY: boolean;
}
```

### New Functions/Methods (`essentials.ts`)

```ts
/**
 * Evaluate the runtime essentials. Pure — no I/O, no throw — so it is freely testable. [AR-1, AR-8]
 *
 * The single runtime essential is an interactive TTY (`facts.isTTY`, which also covers raw-mode
 * keyboard input — `setRawMode` is isTTY-guarded). Color is NOT gated: `ColorDepth` is a non-null
 * union, so a "colorDepth present" check is unreachable dead code (PF-007); monochrome counts.
 * Cursor addressing and screen clear are universal on any VT/ANSI terminal and therefore implied.
 * Supply `facts` from `detectTty()` before `start()` (PF-001). [AR-2]
 *
 * Non-essentials degrade (never stop): no mouse → keyboard-only; mono color → monochrome;
 * no alt-screen → inline fallback.
 *
 * @param caps Resolved capability profile (RD-02).
 * @param facts TTY facts from `detectTty()` (an un-started `Host` must NOT be passed — PF-001).
 * @returns The essentials report (met flag, missing list, degradations).
 */
export function evaluateEssentials(caps: CapabilityProfile, facts: HostFacts): EssentialsReport;

/** Convenience boolean: `evaluateEssentials(caps, facts).met`. [AR-8] */
export function essentialsMet(caps: CapabilityProfile, facts: HostFacts): boolean;

/**
 * Assert the essentials, throwing `EssentialsNotMetError` when unmet so the SDK does not start. [AR-1, AR-8]
 *
 * Side effects: when `options.logger` is provided, writes each degradation **once** to the
 * logger at `info` (a screen-safe notice — never the UI stream). Does not restore the terminal
 * itself; the caller's host owns guaranteed-restore on the throw path.
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
): EssentialsReport;
```

### Degradation construction (deterministic, per AR-8)

```
!caps.mouse.sgr      -> { cap:'mouse',     mode:'keyboard-only', message:'Mouse unavailable: keyboard-only mode.' }
caps.colorDepth==='mono' -> { cap:'color', mode:'monochrome',    message:'No color: monochrome rendering.' }
!caps.altScreen      -> { cap:'altScreen', mode:'inline',        message:'No alternate screen: inline fallback.' }
```

`missing` for a non-interactive terminal is `['interactive TTY (raw-mode keyboard input)']` so the
AC-1 message names "interactive TTY". `colorDepth` is **not** part of the essentials check: the
`ColorDepth` union is non-null, so the check would be unreachable dead code (PF-007). A short
comment at the implementation site records why color is intentionally not gated.

## Integration Points

- **RD-02**: imports `CapabilityProfile` (type-only) and reads `colorDepth`, `mouse.sgr`,
  `altScreen`.
- **RD-07**: TTY facts come from the additive `detectTty()` helper (factored from `bindStreams`,
  shares its `/dev/tty` detection) — `host.isTTY` is only valid after `start()`, so it cannot feed
  a pre-start gate (PF-001). AC-6's restore-before-exit reuses the host's existing crash path. No
  RD-07 *type* change.
- **Logger**: `assertEssentials` depends on the `Logger` type from `logger.ts` (same subsystem).
- **`index.ts`**: re-exports `evaluateEssentials`, `essentialsMet`, `assertEssentials`,
  `EssentialsReport`, `Degradation`, `TuiError`, `EssentialsNotMetError`, `LoggerConfigError`.

## Code Examples

### Example 1: Refuse to start on a pipe (non-TTY)

```ts
const { profile: caps } = resolveCapabilities();
const facts = { isTTY: detectTty() };          // false on a pipe; true via /dev/tty when available
assertEssentials(caps, facts);                 // throws EssentialsNotMetError('... interactive TTY ...')
// Thrown BEFORE createHost/start(): no modes entered, terminal untouched (nothing to restore).
```

### Example 2: Start in keyboard-only mode (degradation, not stop)

```ts
const facts = { isTTY: detectTty() };           // isTTY === true here
const report = evaluateEssentials(caps, facts); // caps with mouse.sgr === false
report.met;                                     // true — mouse is non-essential
report.degradations;                            // [{ cap:'mouse', mode:'keyboard-only', message:... }]
assertEssentials(caps, facts, { logger });      // does NOT throw; logs the notice once
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| `detectTty()` reports `isTTY === false` | `assertEssentials` throws `EssentialsNotMetError(['interactive TTY (raw-mode keyboard input)'])` before `start()`; terminal untouched | AR-1, AR-2 |
| Non-essential gap (mouse/color/alt-screen) | Returned as a `Degradation`; never throws; logged once when a logger is passed | AR-8 |
| `evaluateEssentials` called with valid inputs | Pure; never throws (caller decides via `assertEssentials`) | AR-1 |
| Error thrown later from the app loop | Reaches the host's existing `handleFatal` → restore precedes exit (AC-6) | AR-1 |

> **Traceability:** Every strategy references the Ambiguity Register. See `00-ambiguity-register.md`.

## Testing Requirements

- Unit: `evaluateEssentials` for met/unmet and each degradation combination; `essentialsMet`
  boolean; `assertEssentials` throw vs no-throw; `EssentialsNotMetError.missing` + message text;
  `TuiError`/subclass `instanceof` chain.
- Integration: `assertEssentials({ logger })` writes exactly one entry per degradation.
- E2E: error thrown through the host crash path restores before exit (AC-6).
