# Report, Recommendation, Table & Matrix

> **Document**: 03-04-report-and-matrix.md
> **Parent**: [Index](00-index.md)

## Overview

The final phase: assemble the `Report` from env-meta + all probe results, derive the
`recommendation` block from `resolveCapabilities` (AR-10), render the human-readable
table, append to `terminal-matrix.json` (AR-6), and wire `--auto` + the e2e tests.

## Implementation Details

### Report builder (`report.ts`, Phase 5 portion) — pure

```ts
/** The recommendation block: key fields echoed from the resolved profile (AR-10). */
export interface Recommendation {
  readonly colorDepth: ColorDepth;
  readonly mouse: boolean;
  readonly unicodeWidth: 'wcwidth' | 'ambiguous-wide';
  readonly altScreen: boolean;
  readonly bracketedPaste: boolean;
}

/**
 * Derive the recommendation by folding auto-probe + manual confirmations into
 * resolveCapabilities as override evidence, then echoing key fields (AR-10).
 *
 * @param deps { baseEnv, results } — results that map cleanly onto profile fields are
 *   passed as `override` to resolveCapabilities; the resulting profile drives the block.
 */
export function deriveRecommendation(deps: {
  caps: CapabilityProfile;
  results: Record<string, ProbeResult>;
}): Recommendation;

/**
 * Assemble the final Report from metadata, the merged results map, and the
 * recommendation. Pure — no I/O. In --auto mode the caller pre-marks manual items
 * as { supported:null, method:'manual' } before calling (AR-11).
 */
export function buildReport(deps: {
  meta: EnvMeta;
  results: Record<string, ProbeResult>;
  recommendation: Recommendation;
}): Report;

/** Render the report as a human-readable, aligned table string (stdout, AR-5). */
export function renderTable(report: Report): string;

/** Serialize the report as pretty JSON (stdout in --auto; --out file). */
export function renderJson(report: Report): string;
```

The report contains **only** the schema fields — there is no free-form env map, so no
secret can leak (AR-17). `renderTable` groups rows by `ProbeGroup` with ✓/✗/? markers.

### Matrix (`matrix.ts`) — pure merge + injectable fs seam [AR-6]

```ts
/** Minimal fs seam so the merge logic is unit-testable without touching disk. */
export interface MatrixFs {
  readFile(path: string): string | null; // null when absent
  writeFile(path: string, data: string): void;
}

/**
 * Append a report to the matrix array. Reads the existing file (tolerating absent or
 * malformed-but-recoverable content by starting fresh with a logged note), pushes the
 * new report, returns the new array. Pure given the fs seam.
 *
 * @returns the updated array (also written via fs.writeFile).
 */
export function appendToMatrix(deps: {
  fs: MatrixFs;
  path: string;       // default: repo-root terminal-matrix.json
  report: Report;
}): readonly Report[];
```

Malformed-existing-file policy (resolved under AR-6 scope): if the file exists but is not
a JSON array, do not crash the run — start a new array and add a `note`; the run's
primary output (table/JSON) is unaffected.

### `--auto` wiring (`main.ts`) [AR-7, AR-11]

`--auto`: run only `runAutoProbes`; for every `PROBES` entry whose `method==='manual'`,
set `{ supported:null, method:'manual' }`; `buildReport`; print `renderJson` to stdout;
`appendToMatrix` unless `--no-matrix`; exit 0. No alt-screen, no prompts, headless-safe.

## Code Examples

```ts
const results = { ...auto, ...manual };
const recommendation = deriveRecommendation({ caps, results });
const report = buildReport({ meta, results, recommendation });
process.stdout.write(renderTable(report) + '\n');         // interactive
if (args.out) writeFileSync(args.out, renderJson(report)); // --out
if (args.matrix) appendToMatrix({ fs, path: MATRIX_PATH, report });
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| `terminal-matrix.json` absent | Start a new array | AR-6 |
| `terminal-matrix.json` malformed | Start fresh + add a note; never crash the run | AR-6 |
| `--out` write fails | Report error to stderr; matrix/table still emitted; non-zero exit | AR-5 |
| Result id not in `PROBES` | Impossible by construction (registry-sourced ids) | AR-14 |

> **Traceability:** Each row references the Ambiguity Register. See `00-ambiguity-register.md`.

## Testing Requirements

- Spec: `buildReport` schema completeness (ST-8); `--auto` manual items null (ST-9); `deriveRecommendation` key fields (ST-10); auto color depth recorded (ST-11); never-stop accumulation (ST-12); `appendToMatrix` empty→1 / N→N+1 / valid-array (ST-13/14/15); report excludes non-allowlisted env (ST-28).
- E2E: `--auto` over a pipe exits 0 with schema-valid JSON (ST-24); PTY run with Ctrl-C restores (ST-23).
- Impl: table alignment/markers; malformed-matrix recovery; `--out` path; pretty-JSON shape.
