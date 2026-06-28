/**
 * CLI argument parser for the capability-probe harness (RD-03, plan doc 03-02).
 *
 * Pure, hand-rolled (zero dependencies). Recognises the four documented flags
 * (`--auto`, `--out <path>`, `--no-matrix`, `--help`); any unknown flag or a
 * missing `--out` value yields a discriminated error result so `main()` can print
 * a message and exit non-zero without throwing across the CLI boundary (AR-7).
 */

/** Parsed CLI options. */
export interface ProbeArgs {
  /** Non-interactive CI mode: auto facts only, manual items marked unverified. */
  readonly auto: boolean;
  /** Standalone JSON report path, or null when not requested. */
  readonly out: string | null;
  /** Whether to append to `terminal-matrix.json` (default true; `--no-matrix` disables). */
  readonly matrix: boolean;
  /** Whether `--help` was requested. */
  readonly help: boolean;
}

/** Discriminated parse result: success with options, or failure with a message. */
export type ParseResult =
  { readonly ok: true; readonly args: ProbeArgs } | { readonly ok: false; readonly error: string };

/** Usage text printed by `--help` and on a parse error. */
export const USAGE = [
  'Usage: npm run probe [-- <flags>]',
  '',
  'Flags:',
  '  --auto         Non-interactive mode: record only auto-detectable facts (CI).',
  '  --out <path>   Also write a standalone JSON report to <path>.',
  '  --no-matrix    Do not append the run to terminal-matrix.json.',
  '  --help         Show this help and exit.',
].join('\n');

/**
 * Parse the argv slice after `node <script>`.
 *
 * @param argv The raw argument list (e.g. `process.argv.slice(2)`).
 * @returns `{ ok: true, args }` with defaults `auto=false, out=null, matrix=true,
 *   help=false`, or `{ ok: false, error }` for an unknown flag or a missing
 *   `--out` value.
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  let auto = false;
  let out: string | null = null;
  let matrix = true;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--auto':
        auto = true;
        break;
      case '--no-matrix':
        matrix = false;
        break;
      case '--help':
        help = true;
        break;
      case '--out': {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) {
          return { ok: false, error: 'Flag --out requires a <path> value.' };
        }
        out = value;
        i += 1; // consume the value
        break;
      }
      default:
        return { ok: false, error: `Unknown flag: ${token}` };
    }
  }

  return { ok: true, args: { auto, out, matrix, help } };
}
