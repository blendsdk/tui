/**
 * Capability-probe harness entry point / orchestrator (RD-03, plan doc 03-02).
 *
 * Parses CLI flags, then branches: `--help` prints usage; `--auto` runs the
 * non-interactive auto-only pipeline (Phase 5); otherwise it runs the interactive
 * survey — but only after confirming a TTY (AR-8). The interactive body enters
 * alt-screen + raw mode via the host and guarantees full restore on every exit
 * path (RD-07). The auto/manual/readout probe phases are inserted into the marked
 * interactive section in Phases 2–4; this foundation proves the lifecycle, the
 * guards, and the metadata plumbing.
 *
 * Every OS/process touchpoint is injectable via {@link ProbeDeps} so the
 * orchestrator is testable headlessly (RT-2); production defaults read `process.*`
 * and the RD-08 `detectTty` probe.
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { createHost, createTerminalQuery, detectTty, resolveCapabilities, ScreenBuffer } from '@jsvision/core';
import type { InputEvent, Platform, TerminalQuery } from '@jsvision/core';
import { parseArgs, USAGE } from './args.js';
import type { ProbeArgs } from './args.js';
import { gatherEnvMeta } from './env-meta.js';
import { runAutoProbes } from './auto-probes.js';
import { runManualProbes } from './manual-probes.js';
import { runLiveReadout } from './live-readout.js';
import { MANUAL_PROBES } from './taxonomy.js';
import { buildReport, deriveRecommendation, renderJson, renderTable } from './report.js';
import type { ProbeResult, Report } from './report.js';
import { appendToMatrix } from './matrix.js';
import type { MatrixFs } from './matrix.js';

/** Whole-step timeout for the upfront auto-probe query phase (ms). */
const AUTO_TIMEOUT_MS = 200;

/** The checked-in cross-terminal evidence matrix, at the repo root (AR-6). */
const MATRIX_PATH = fileURLToPath(new URL('../../terminal-matrix.json', import.meta.url));

/** Real-filesystem {@link MatrixFs} for production matrix appends. */
const nodeMatrixFs: MatrixFs = {
  readFile: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
  writeFile: (path, data) => writeFileSync(path, data),
};

/** Persist optional artifacts: a standalone `--out` JSON copy and the matrix append. */
function persist(report: Report, args: ProbeArgs): void {
  if (args.out) {
    writeFileSync(args.out, `${renderJson(report)}\n`);
  }
  if (args.matrix) {
    appendToMatrix({ fs: nodeMatrixFs, path: MATRIX_PATH, report });
  }
}

/** Injectable OS/process boundary for {@link main}; production uses `process.*`. [RT-2] */
export interface ProbeDeps {
  /** Argument list after `node <script>` (default `process.argv.slice(2)`). */
  argv: readonly string[];
  /** Environment (default `process.env`). */
  env: NodeJS.ProcessEnv;
  /** Host OS (default narrowed from `process.platform`). */
  platform: Platform;
  /** Human/JSON output stream (default `process.stdout`). */
  stdout: NodeJS.WritableStream;
  /** Diagnostic stream (default `process.stderr`). */
  stderr: NodeJS.WritableStream;
  /** Interactive input stream (default `process.stdin`); bound by the host + readout. */
  input: NodeJS.ReadStream;
  /** Interactive output stream (default `process.stdout`); bound by the host. */
  output: NodeJS.WriteStream;
  /** Process exit (default `process.exit`); typed `void` so tests continue after a call. */
  exit: (code: number) => void;
  /** Interactive-TTY probe (default the RD-08 `detectTty`). */
  isTty: () => boolean;
  /** ISO-8601 clock (default `() => new Date().toISOString()`). */
  now: () => string;
}

/** Narrow `process.platform` to the SDK's {@link Platform} union without an unsafe cast. */
function currentPlatform(): Platform {
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'win32') return 'win32';
  return 'linux';
}

/**
 * Run the capability probe.
 *
 * @param deps Optional injectable overrides; anything omitted falls back to the
 *   real `process.*` / `detectTty` defaults.
 * @returns Resolves when the run is complete; never rejects across the CLI
 *   boundary (parse errors and the non-TTY case call `exit` and return).
 */
export async function main(deps: Partial<ProbeDeps> = {}): Promise<void> {
  const argv = deps.argv ?? process.argv.slice(2);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const exit = deps.exit ?? ((code: number): void => void process.exit(code));
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? currentPlatform();
  const now = deps.now ?? ((): string => new Date().toISOString());
  const isTty = deps.isTty ?? ((): boolean => detectTty());

  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    stderr.write(`${parsed.error}\n\n${USAGE}\n`);
    exit(1);
    return;
  }
  const args = parsed.args;
  if (args.help) {
    stdout.write(`${USAGE}\n`);
    exit(0);
    return;
  }

  const { profile } = resolveCapabilities({ env, platform });
  const meta = gatherEnvMeta({ env, platform, now });
  const input = deps.input ?? process.stdin;
  const output = deps.output ?? process.stdout;

  if (args.auto) {
    // Non-interactive (CI-safe): no alt-screen, no prompts. A null query keeps
    // query escape sequences off stdout, which carries the JSON report (RT-6);
    // auto facts come from env/table resolution. Manual items default to null.
    async function* noResponses(): AsyncGenerator<Uint8Array> {
      /* a headless run has no responding terminal */
    }
    const nullQuery: TerminalQuery = { write(): void {}, read: () => noResponses() };
    const auto = await runAutoProbes({ query: nullQuery, env, platform, timeoutMs: AUTO_TIMEOUT_MS });
    const report = buildReport({
      meta,
      results: auto,
      recommendation: deriveRecommendation({ caps: profile, results: auto }),
    });
    stdout.write(`${renderJson(report)}\n`);
    persist(report, args);
    return;
  }

  if (!isTty()) {
    stderr.write(
      'capability-probe: no interactive terminal (stdin/stdout is not a TTY).\n' +
        'Run inside a terminal, or use --auto for non-interactive detection.\n',
    );
    exit(1);
    return;
  }

  // Interactive: enter alt-screen + raw mode via the host and guarantee restore
  // on every exit path. The dedicated auto-probe phase runs first (AR-9), then the
  // guided manual probes; the live readout is inserted after them in Phase 4.
  const events: InputEvent[] = [];
  let waiter: ((event: InputEvent) => void) | null = null;
  const pushEvent = (event: InputEvent): void => {
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(event);
    } else {
      events.push(event);
    }
  };
  const nextEvent = (): Promise<InputEvent> => {
    const queued = events.shift();
    return queued ? Promise.resolve(queued) : new Promise((resolve) => (waiter = resolve));
  };
  const nextKey = async (): Promise<'y' | 'n' | 's'> => {
    for (;;) {
      const event = await nextEvent();
      if (event.type === 'key' && (event.key === 'y' || event.key === 'n' || event.key === 's')) {
        return event.key;
      }
    }
  };
  async function* eventStream(): AsyncGenerator<InputEvent> {
    for (;;) yield await nextEvent();
  }
  const style = { fg: 'default', bg: 'default' } as const;

  const host = createHost({ caps: profile, input, output, onInput: pushEvent });
  let auto: Record<string, ProbeResult> = {};
  let manual: Record<string, ProbeResult> = {};
  try {
    await host.start();
    const query = createTerminalQuery({ input, output });
    try {
      auto = await runAutoProbes({ query, env, platform, timeoutMs: AUTO_TIMEOUT_MS });
    } finally {
      query.close();
    }
    manual = await runManualProbes({
      render: (buffer) => host.render(buffer),
      emit: (sequence) => void output.write(sequence),
      nextKey,
      probes: MANUAL_PROBES,
      caps: profile,
    });
    await runLiveReadout({
      events: eventStream(),
      render: (lines) => {
        const buffer = new ScreenBuffer(80, 24, style);
        buffer.text(0, 0, 'Live input readout — press keys / mouse / paste; q to finish.', style);
        lines.forEach((line, index) => buffer.text(0, index + 2, line, style));
        host.render(buffer);
      },
    });
  } finally {
    await host.stop();
  }

  // After leaving the alternate screen, print the human-readable table to stdout
  // and persist the standalone JSON (--out) + matrix append (AR-5, AR-6, AR-11).
  const results = { ...auto, ...manual };
  const report = buildReport({
    meta,
    results,
    recommendation: deriveRecommendation({ caps: profile, results }),
  });
  stdout.write(`${renderTable(report)}\n`);
  persist(report, args);
}

// Auto-run when executed directly (e.g. `npm run probe`), but not when imported by a test.
const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  void main();
}
