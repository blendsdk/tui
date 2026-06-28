/**
 * Public entry point of the RD-08 safety subsystem.
 *
 * Re-exports the subsystem's public API so the SDK's top-level
 * `src/engine/index.ts` can surface it: the canonical {@link sanitize} injection
 * boundary (relocated from RD-04's render module, AR-3/AR-13), the typed
 * {@link TuiError} model, the screen-safe {@link createLogger}, and the pure
 * {@link redactEvent}/{@link dumpCaps} redaction helpers, and the essentials gate
 * ({@link evaluateEssentials}/{@link essentialsMet}/{@link assertEssentials}).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */

// Canonical output sanitizer — the primary injection boundary.
export { sanitize } from './sanitize.js';

// Essentials gate.
export { evaluateEssentials, essentialsMet, assertEssentials } from './essentials.js';
export type { EssentialsReport, Degradation, HostFacts } from './essentials.js';

// Typed error model.
export { TuiError, EssentialsNotMetError, LoggerConfigError } from './errors.js';

// Screen-safe logger.
export { createLogger } from './logger.js';
export type { Logger, LoggerOptions, LogLevel, LogRecord, LogSink, LoggerFs } from './logger.js';

// Pure redaction helpers.
export { redactEvent, dumpCaps } from './redact.js';
export type { RedactedEvent } from './redact.js';
