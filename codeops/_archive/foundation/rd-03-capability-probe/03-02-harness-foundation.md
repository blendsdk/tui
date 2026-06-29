# Harness Foundation: CLI, Orchestrator, Lifecycle, Env-Meta

> **Document**: 03-02-harness-foundation.md
> **Parent**: [Index](00-index.md)

## Overview

The skeleton of the harness under `examples/capability-probe/`: the CLI arg parser
(`args.ts`), the orchestrator entry point (`main.ts`) that owns the host lifecycle and
guaranteed restore, the environment/terminal metadata gatherer (`env-meta.ts`), and the
report **types** every later phase populates. No probe logic yet — phases 2–5 fill it.

## Architecture

### Proposed Changes

```
examples/capability-probe/
├── main.ts        # orchestrator: parse args → branch (--help / --auto / interactive) → run phases → emit
├── args.ts        # pure hand-rolled CLI parser (zero deps)
├── env-meta.ts    # gather terminal/OS/env metadata with a strict env allowlist
└── report.ts      # (types defined here in Phase 1; builder/table in Phase 5 — see 03-04)
```

Toolchain (AR-12): add `tsconfig.examples.json` and the `probe`/`typecheck:examples`
scripts; update `verify`.

## Implementation Details

### CLI args (`args.ts`) — pure [AR-7]

```ts
/** Parsed CLI options. */
export interface ProbeArgs {
  readonly auto: boolean;       // --auto
  readonly out: string | null;  // --out <path>
  readonly matrix: boolean;     // !--no-matrix (default true)
  readonly help: boolean;       // --help
}

/** Discriminated result so main() can print an error + non-zero exit without throwing across the CLI boundary. */
export type ParseResult =
  | { readonly ok: true; readonly args: ProbeArgs }
  | { readonly ok: false; readonly error: string };

/**
 * Parse argv (the slice after `node script`). Unknown flags, `--out` without a
 * value, or a repeated flag yield `{ ok: false, error }`. Defaults:
 * auto=false, out=null, matrix=true, help=false. [AR-7]
 */
export function parseArgs(argv: readonly string[]): ParseResult;

/** The usage text printed by --help and on parse error. */
export const USAGE: string;
```

### Env-meta (`env-meta.ts`) — security boundary [AR-17]

```ts
/** Terminal/OS/env metadata recorded in the report (no secrets, allowlisted env). */
export interface EnvMeta {
  readonly terminal: string;          // best-effort name from TERM_PROGRAM/TERM
  readonly version: string | null;    // from TERM_PROGRAM_VERSION (auto-probe may refine)
  readonly os: 'linux' | 'darwin' | 'win32';
  readonly term: string | null;       // TERM
  readonly colorterm: string | null;  // COLORTERM
  readonly termProgram: string | null;// TERM_PROGRAM
  readonly multiplexer: boolean;      // TERM/TMUX heuristic (reuses RD-02 signal)
  readonly timestamp: string;         // ISO-8601, from an injected clock
}

/**
 * Collect metadata from an injectable env + platform + clock. ONLY the allowlisted
 * env keys (TERM, COLORTERM, TERM_PROGRAM, TERM_PROGRAM_VERSION, TMUX) are read; no
 * other environment value is ever copied into the result (AR-17).
 *
 * @param deps Injectable { env, platform, now } — tests pass fixed values for determinism.
 */
export function gatherEnvMeta(deps: {
  env: NodeJS.ProcessEnv;
  platform: 'linux' | 'darwin' | 'win32';
  now: () => string; // returns an ISO timestamp; real impl: () => new Date().toISOString()
}): EnvMeta;
```

### Report types (`report.ts`, Phase 1 portion)

```ts
export type ProbeMethod = 'auto' | 'manual';
/** One capability result. supported:null = could not determine (AR-11). */
export interface ProbeResult {
  readonly supported: boolean | null;
  readonly method: ProbeMethod;
  readonly note?: string;
}
export interface Report {
  readonly terminal: string; readonly version: string | null;
  readonly os: 'linux' | 'darwin' | 'win32';
  readonly term: string | null; readonly colorterm: string | null;
  readonly termProgram: string | null; readonly multiplexer: boolean;
  readonly timestamp: string;
  readonly results: Record<string, ProbeResult>;
  readonly recommendation: Recommendation; // shape in 03-04
}
```

### Orchestrator (`main.ts`)

Flow (AR-2, AR-5, AR-9):

1. `parseArgs(process.argv.slice(2))`. On error → `stderr` + exit non-zero. On `--help` → print `USAGE`, exit 0.
2. Build `caps = resolveCapabilities()` and `meta = gatherEnvMeta(...)`.
3. **`--auto` branch (AR-7):** no alt-screen, no prompts. Run only the auto-probe phase (raw mode briefly via a minimal host or direct stream control), mark every manual item `{ supported: null, method: 'manual' }`, build the report, print JSON to stdout, append matrix (unless `--no-matrix`), exit 0.
4. **Interactive branch:** if `!detectTty()` → print the AC-6 message to stderr, exit without alt-screen/raw mode (AR-8). Else `createHost({ caps, onInput, onResize })`, `await host.start()` (enters alt-screen + raw mode), then run phases 2→3→4 (auto, manual, readout). On every exit path call `host.stop()` (guaranteed restore, RD-07). After leaving alt-screen, print the human table to stdout; write `--out` JSON if given; append matrix unless `--no-matrix`.
5. Wrap the interactive body so a thrown error still restores (host's panic backstop + an explicit `try/finally { host.stop() }`), then rethrows/exit non-zero (AC-7).

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| Unknown/malformed flag | `parseArgs` → `{ok:false}`; `main` prints error + `USAGE`, exits non-zero | AR-7 |
| Interactive on a non-TTY | `detectTty()` false → message + exit, no alt-screen/raw mode | AR-8 |
| Thrown error mid-probe | `try/finally host.stop()`; host panic backstop guarantees restore; exit non-zero | AR-15 |
| Ctrl-C | Host signal path restores + exits (RD-07 `exitOnSignal`) | AR-8 |
| Non-allowlisted env present | Never copied into `EnvMeta` (allowlist read only) | AR-17 |

> **Traceability:** Each row references the Ambiguity Register. See `00-ambiguity-register.md`.

## Testing Requirements

- Spec: `parseArgs` (ST-1…ST-7), `gatherEnvMeta` allowlist/redaction (ST-28), non-TTY boundary (ST-22).
- Impl: `--help`/usage text presence; ISO timestamp via injected clock; multiplexer heuristic; `--out` path threading.
- The non-TTY boundary and full restore are additionally covered by e2e (ST-22 piped, ST-23 PTY) — see [03-04](03-04-report-and-matrix.md) and §07.
