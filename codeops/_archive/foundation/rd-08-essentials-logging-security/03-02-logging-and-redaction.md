# Logging & Redaction: RD-08

> **Document**: 03-02-logging-and-redaction.md
> **Parent**: [Index](00-index.md)
> **Files**: `src/engine/safety/logger.ts`, `src/engine/safety/redact.ts`

## Overview

A TUI library owns the screen, so it can never log to the UI stream. `logger.ts` provides a
screen-safe logger over three sinks (file / stderr / in-memory ring), env-gated and disabled by
default. `redact.ts` provides the pure redaction helpers that keep keystrokes and paste content
out of logs, plus the caps-summary debug dump. *(AR-5, AR-6, AR-9, AR-10, AR-12, AR-14)*

## Architecture

### Current Architecture
Nothing logs. The host writes ad-hoc diagnostics to stderr on the crash path only.

### Proposed Changes
- `createLogger(options?)` factory returning a `Logger` interface; disabled → no-op. *(AR-14)*
- Sink selection + UI-stream refusal (`LoggerConfigError`) at construction. *(AR-10)*
- `redactEvent()` (pure) + `dumpCaps()` (pure) in `redact.ts`. *(AR-9, AR-6, AR-12)*

## Implementation Details

### New Types/Interfaces (`logger.ts`)

```ts
/** Severity levels, coarsest to finest. [AR-10] */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** A structured log record (Should-Have structured format). [AR-6] */
export interface LogRecord {
  readonly level: LogLevel;
  /** Subsystem tag, e.g. 'input' | 'gate' | 'host'. */
  readonly component: string;
  readonly msg: string;
  /** Extra non-secret fields (e.g. a redacted event). Never raw input. */
  readonly fields?: Readonly<Record<string, unknown>>;
}

/** Where log records go. [AR-10] */
export type LogSink = 'auto' | 'file' | 'stderr' | 'ring';

/** Options for {@link createLogger}; all optional (env supplies defaults). [AR-10, AR-14] */
export interface LoggerOptions {
  /** Force enable/disable. Default: enabled iff `env.BLENDTUI_DEBUG === '1'`. */
  readonly enabled?: boolean;
  /** Minimum level emitted. Default: 'debug' when enabled. */
  readonly level?: LogLevel;
  /** Sink override. Default 'auto' (file if BLENDTUI_LOG set, else stderr-if-safe). */
  readonly sink?: LogSink;
  /** File path for the 'file' sink. Default: `env.BLENDTUI_LOG`. */
  readonly path?: string;
  /** Ring capacity in entries (sink==='ring'). Default 1024. */
  readonly size?: number;
  /** Environment to read flags from. Default: `process.env`. (Injectable for tests.) */
  readonly env?: NodeJS.ProcessEnv;
  /** UI output stream fd to refuse (screen-safety guard). Default: stdout fd (1). */
  readonly uiFd?: number;
}

/** The screen-safe logger. Returned by {@link createLogger}. [AR-14] */
export interface Logger {
  readonly enabled: boolean;
  debug(component: string, msg: string, fields?: Record<string, unknown>): void;
  info(component: string, msg: string, fields?: Record<string, unknown>): void;
  warn(component: string, msg: string, fields?: Record<string, unknown>): void;
  error(component: string, msg: string, fields?: Record<string, unknown>): void;
  /** Ring sink only: the buffered records (oldest→newest). Empty otherwise. For tests. */
  entries(): readonly LogRecord[];
  /** Flush/close the sink (closes the file handle). Idempotent. */
  close(): void;
}
```

### New Functions/Methods (`logger.ts`)

```ts
/**
 * Create a screen-safe logger. [AR-5, AR-10, AR-14]
 *
 * Enablement: `options.enabled ?? (env.BLENDTUI_DEBUG === '1')`. A disabled logger is a no-op
 * (every method returns without writing; `entries()` is empty) so a normal run writes zero
 * bytes (AC-5).
 *
 * Sink selection when enabled (sink==='auto'): if a path (`options.path ?? env.BLENDTUI_LOG`) is
 * set → file (append); else if stderr is not the UI stream → stderr; else no sink. The 'ring'
 * sink is always available via `sink:'ring'` regardless of env (used by tests).
 *
 * Screen-safety (AC-7): construction throws `LoggerConfigError` when a resolved sink targets the
 * UI stream. Detection is concrete: the **stderr** sink compares fd numbers (`2 === options.uiFd`,
 * default `uiFd` = 1); the **file** sink `realpath`s + `openSync`s the path, `fstatSync`s it, and
 * flags a collision iff `ino !== 0 && {dev,ino}` equal `fstatSync(options.uiFd)`'s — the
 * `ino !== 0` guard avoids false positives where unrelated pipes/consoles all report `ino: 0`. On
 * platforms without stable inodes (e.g. the Windows console) the file check is best-effort and
 * allows rather than blocks. A `stat`/fd seam is injectable so the guard is deterministically
 * testable (ST-22) without touching real device paths.
 *
 * @param options Optional configuration; env supplies defaults.
 * @returns A `Logger`. Disabled when not gated on.
 * @throws LoggerConfigError when a resolved sink targets the UI stream.
 */
export function createLogger(options?: LoggerOptions): Logger;
```

### New Functions/Methods (`redact.ts`)

```ts
import type { InputEvent } from '../input/events.js';
import type { CapabilityResolution } from '../capability/profile.js';

/** A redacted, log-safe view of an input event — never carries raw content. [AR-9] */
export type RedactedEvent =
  | { readonly type: 'key'; readonly key?: string; readonly printable?: true;
      readonly ctrl: boolean; readonly alt: boolean; readonly shift: boolean }
  | { readonly type: 'mouse'; readonly kind: string; readonly button: number; readonly x: number; readonly y: number }
  | { readonly type: 'wheel'; readonly dir: string; readonly x: number; readonly y: number }
  | { readonly type: 'paste'; readonly length: number; readonly truncated: boolean }
  | { readonly type: 'focus'; readonly focused: boolean };

/**
 * Reduce an input event to a log-safe shape — the core no-secret-logging control. [AR-9]
 *
 * Keys: a printable key (`codepoint` present) becomes `{type:'key', printable:true, ctrl,alt,shift}`
 * — the character and codepoint are dropped. A named key (in `KEY_NAMES`, no `codepoint`) keeps
 * its name: `{type:'key', key:'enter', ctrl,alt,shift}`. A paste yields only `{type:'paste',
 * length, truncated}` — never its text. Mouse/wheel/focus carry no secrets and pass their
 * coordinates/direction/flag.
 *
 * Pure; never logs; never mutates its argument.
 *
 * @param event Any decoded input event (RD-06).
 * @returns The redacted, log-safe view.
 */
export function redactEvent(event: InputEvent): RedactedEvent;

/**
 * Render a one-line, secret-free capabilities summary from the RD-02 reason trace. [AR-6]
 *
 * Emits exactly one `field=value (layer)` pair per `CapabilityReasons` key (the per-group trace),
 * space-separated, in declaration order. Scalar fields render their value directly
 * (`colorDepth=256 (env) altScreen=true (table)`); object-valued groups render as a comma-joined
 * list of their enabled boolean members (`mouse=sgr,wheel (table)`; an all-false group →
 * `mouse=- (table)`); non-boolean nested fields render `name:value`. Contains no
 * input/clipboard/title text. ST-18 pins the exact format.
 *
 * @param resolution The RD-02 `CapabilityResolution` (`{ profile, reasons }`).
 * @returns A single screen-safe summary string.
 */
export function dumpCaps(resolution: CapabilityResolution): string;
```

## Integration Points

- **RD-06**: `redactEvent` imports `InputEvent` (type-only) and uses `codepoint` presence /
  `KEY_NAMES` membership as the printable-vs-named discriminator.
- **RD-02**: `dumpCaps` imports `CapabilityResolution` (type-only); reads `profile` + `reasons`.
- **`node:fs`**: the file sink uses `fs.openSync`/`fs.writeSync`/`fs.closeSync` (append mode);
  `fs.realpathSync` + `fs.fstatSync` back the UI-stream guard (`{dev,ino}` compare with the
  `ino !== 0` rule above), behind an injectable seam for ST-22. No third-party deps.
- **Gate**: `assertEssentials` calls `logger.info('gate', degradation.message, { cap, mode })`.
- **`index.ts`**: re-exports `createLogger`, `Logger`, `LogLevel`, `LogRecord`, `LogSink`,
  `LoggerOptions`, `redactEvent`, `RedactedEvent`, `dumpCaps`.

## Code Examples

### Example 1: Redacting a printable key vs a named key

```ts
redactEvent({ type:'key', key:'a', codepoint:0x61, ctrl:false, alt:false, shift:false });
// -> { type:'key', printable:true, ctrl:false, alt:false, shift:false }   (no 'a', no codepoint)

redactEvent({ type:'key', key:'enter', ctrl:false, alt:false, shift:false });
// -> { type:'key', key:'enter', ctrl:false, alt:false, shift:false }

redactEvent({ type:'paste', text:'super-secret-token', truncated:false });
// -> { type:'paste', length:18, truncated:false }
```

### Example 2: Disabled by default (AC-5)

```ts
const log = createLogger({ env: {} });   // BLENDTUI_DEBUG unset
log.enabled;                              // false
log.debug('input', 'key', redactEvent(e)); // no-op; zero bytes written
log.entries();                            // []
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| Resolved sink targets the UI stream (stderr: `fd === uiFd`; file: same `{dev,ino}`, `ino !== 0`) | Throw `LoggerConfigError` at construction (fail fast); file check best-effort where inodes are unstable | AR-7, AR-10 |
| `BLENDTUI_DEBUG` unset / `enabled:false` | Return a no-op `Logger`; zero writes (AC-5) | AR-10, AR-14 |
| Enabled, no path, stderr is the UI stream | No auto sink (records dropped); not an error | AR-10 |
| File open/write failure | Surface as the underlying `fs` error from `createLogger`/`close` (never swallow silently); never write raw input to any fallback | AR-10 |
| Record below the configured level | Dropped (not written) | AR-10 |

> **Traceability:** Every strategy references the Ambiguity Register. See `00-ambiguity-register.md`.

## Testing Requirements

- Unit (`redact`): printable key redaction (no char/codepoint), named key keeps name, paste→length
  only, mouse/wheel/focus pass-through; `dumpCaps` contains layer names and no event/paste text.
- Unit (`logger`): disabled no-op (zero bytes); ring captures/bounds at `size`; level filtering;
  structured record shape; file append; UI-stream sink → `LoggerConfigError`; stderr-only-when-safe.
- Integration: gate degradation → exactly one ring entry per degradation.
