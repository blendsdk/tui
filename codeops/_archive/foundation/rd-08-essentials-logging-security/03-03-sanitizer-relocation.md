# Sanitizer Relocation: RD-08

> **Document**: 03-03-sanitizer-relocation.md
> **Parent**: [Index](00-index.md)
> **Files**: `src/engine/safety/sanitize.ts` (new home), `src/engine/render/{sanitize.ts,buffer.ts,osc.ts,index.ts}`, `src/engine/index.ts`

## Overview

`sanitize()` is the project's primary injection boundary. RD-04 shipped it provisionally under
`render/`; RD-08 owns it as the canonical security primitive and relocates it into `safety/`.
The move is **behavior-preserving**: strip-only, identical signature — only the file location and
import paths change. *(AR-3, AR-13)*

## Architecture

### Current Architecture
`src/engine/render/sanitize.ts` defines `sanitize(text: string): string`. It is imported by
`render/buffer.ts:20` (`text()`) and `render/osc.ts:16` (hyperlink/clipboard/title/notify), and
re-exported from `render/index.ts:35` and the top-level `src/engine/index.ts:60`. The public
symbol `@blendsdk/tui` → `sanitize` is consumed by tests and downstream code.

### Proposed Changes
1. **Move** the file verbatim to `src/engine/safety/sanitize.ts` (same body, same signature).
   Update its module JSDoc: drop the "provisional (PL-16)" note; state it is the canonical RD-08
   injection boundary.
2. **Rewire render imports** to the new path:
   - `render/buffer.ts:20`: `import { sanitize } from './sanitize.js'` → `from '../safety/sanitize.js'`.
   - `render/osc.ts:16`: same rewrite.
3. **Drop the render re-export**: remove `export { sanitize } from './sanitize.js'`
   (`render/index.ts:35`) and update the module JSDoc (`render/index.ts:8`) to no longer claim
   the sanitizer.
4. **Delete** `src/engine/render/sanitize.ts` (no shim — DRY / no dead code).
5. **Update the public entry point** `src/engine/index.ts`: remove `sanitize` from the RD-04
   render re-export block (`index.ts:60`) and add a new RD-08 `safety/` re-export block that
   exports `sanitize` (plus the rest of the safety surface). The public `@blendsdk/tui` →
   `sanitize` symbol is **unchanged**. *(AR-3)*

The sanitizer's behavior, rule table, and signature are untouched (AR-13): ESC (and `ESC \` ST),
BEL, single-byte ST, C0 except tab/newline, and C1 are stripped; printable/UTF-8 (incl. astral)
passes; iteration is by code point.

## Implementation Details

### New file `src/engine/safety/sanitize.ts`

Identical implementation to the current `render/sanitize.ts:27` (`sanitize(text: string): string`),
with refreshed JSDoc:

```ts
/**
 * The canonical output sanitizer — the project's primary injection boundary (RD-08 §Sanitizer
 * rule; AC-3/AC-8). Strips terminal-control bytes from untrusted text before it reaches the
 * stream, so app- or network-supplied strings cannot open/close escape or OSC sequences.
 *
 * Every text-accepting output path routes through this: RD-04 buffer `text()`, the OSC features
 * (`hyperlink`/`setClipboard`/`setTitle`/`notify`), and the window title. Strip-only,
 * behavior-identical to the RD-04 provisional version it replaces (RD-08 AR-13).
 *
 * @param text Untrusted input (app- or network-supplied).
 * @returns `text` with ESC/BEL/ST and C0/C1 control bytes removed (tab/newline kept). Pure;
 *          never logs its input.
 */
export function sanitize(text: string): string { /* moved verbatim */ }
```

### `src/engine/safety/index.ts` (new subsystem entry point)

Re-exports the full RD-08 public surface so the top-level index can surface it:

```ts
export { sanitize } from './sanitize.js';
export { evaluateEssentials, essentialsMet, assertEssentials } from './essentials.js';
export type { EssentialsReport, Degradation, HostFacts } from './essentials.js';
export { TuiError, EssentialsNotMetError, LoggerConfigError } from './errors.js';
export { createLogger } from './logger.js';
export type { Logger, LoggerOptions, LogLevel, LogRecord, LogSink } from './logger.js';
export { redactEvent, dumpCaps } from './redact.js';
export type { RedactedEvent } from './redact.js';
```

### `src/engine/index.ts` edits

- Remove `sanitize,` from the RD-04 render `export { ... } from './render/index.js'` block
  (`index.ts:60`).
- Add an RD-08 block: `export { sanitize, evaluateEssentials, essentialsMet, assertEssentials,
  TuiError, EssentialsNotMetError, LoggerConfigError, createLogger, redactEvent, dumpCaps } from
  './safety/index.js';` plus the corresponding `export type { ... }`.

## Integration Points

- **RD-04 render**: continues to call `sanitize()` from every text path — behavior unchanged; only
  the import specifier differs.
- **Public API**: `@blendsdk/tui` still exports `sanitize` identically (AR-3); no consumer break.
- **Tests**: `render-security.spec.test.ts:16` and `render-sanitize.impl.test.ts:10` import
  `sanitize` from `../src/engine/render/sanitize.js` — both paths update to the relocated module
  (see `07-testing-strategy.md`). The `render-security.spec.test.ts` oracle keeps proving render
  paths sanitize; if it fails after the move, the relocation is wrong (AR-13).

## Code Examples

### Example 1: Injection neutralized (unchanged behavior, AC-3)

```ts
sanitize('a\x1b]0;x\x07b'); // -> 'a]0;xb'  (ESC + BEL stripped; OSC injection neutralized)
sanitize('café\tnewline\n😀'); // -> 'café\tnewline\n😀'  (UTF-8/astral, tab, newline preserved)
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| `sanitize` receives control bytes | Strip per the rule table (never throws) | AR-13 |
| Relocation changes observable behavior | Not permitted — move is verbatim; spec tests (incl. RD-04 oracle) must stay green | AR-3, AR-13 |
| Lingering import of the old `render/sanitize.js` path | Build/typecheck fails (no shim left) — caught by `npm run verify` | AR-3 |

> **Traceability:** Every strategy references the Ambiguity Register. See `00-ambiguity-register.md`.

## Testing Requirements

- The new canonical spec test `safety-sanitize.spec.test.ts` covers the full rule table
  (ESC/`ESC \`/BEL/ST/C0/C1, tab/newline kept, UTF-8/astral pass).
- The relocated `safety-sanitize.impl.test.ts` covers edge cases (empty string, all-control input,
  mixed runs).
- Regression: the existing RD-04 `render-security.spec.test.ts` stays green with only its import
  path updated.
