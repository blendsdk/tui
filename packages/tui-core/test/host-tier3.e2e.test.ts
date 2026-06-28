/**
 * Tier-3 PTY-style integration (RD-09 FR-3, plan doc 03-03).
 *
 * Extends the project's no-node-pty harness (the `host-signals.e2e` pattern) to
 * the Tier-3 assertions beyond SIGINT: alt-screen + mouse enter sequences during
 * run, and **full restore** on normal exit, `throw`, SIGTERM, and SIGHUP
 * (ST-12…ST-16). A real child process runs the real `createHost`; its piped
 * stdout is captured and asserted for the enter/leave control sequences. No
 * pseudo-terminal, no native dependency.
 *
 * Immutable oracle: the asserted sequences derive from the RD-04/RD-07 contracts
 * (the `modes` table: alt-screen `?1049h/l`, cursor `?25l/h`, SGR mouse
 * `?1006h/l` + `?1000h/l`) and the AR-6 exit-code matrix (SIGTERM→143, SIGHUP→129),
 * not from running the child first. SIGINT→130 is proven by `host-signals.e2e`
 * (RD-07 ST-12) and is mapped, not re-implemented. Real SIGWINCH resize delivery
 * needs a real PTY and is deferred (DEF-3).
 *
 * Heavier than the unit specs, so it lives outside the unit glob; run explicitly:
 * `npx tsx --test test/host-tier3.e2e.test.ts`.
 */
import { test, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // test/
const repoRoot = resolve(here, '..');
const engineUrl = pathToFileURL(join(repoRoot, 'src', 'engine', 'index.ts')).href;

// Run the child as `node --import tsx <file>` rather than via the `tsx` bin wrapper.
// The wrapper forwards SIGINT/SIGTERM to the script but NOT SIGHUP, which would make
// the SIGHUP case (ST-16) hang; running under node directly delivers every signal to
// the host's own handlers (the process we signal IS the script). [RD-09 runtime]
const CHILD_RUNNER = { cmd: process.execPath, preArgs: ['--import', 'tsx'] };

/** What the child does after `start()` + READY: self-exit cleanly, throw, or wait for a signal. */
type ChildMode = 'normal' | 'throw' | 'wait';

/**
 * Build a real host child program. It advertises piped streams as TTYs (no pty,
 * AR-2), enters TUI mode with alt-screen + SGR mouse, prints READY, then performs
 * the mode-specific action. The `mouse` override is a `MouseCaps` object so the
 * host actually emits the mouse-enable sequences (gated on `caps.mouse.sgr`).
 */
function buildChild(mode: ChildMode): string {
  const action =
    mode === 'normal'
      ? `setTimeout(async () => { await host.stop(); process.exit(0); }, 50);`
      : mode === 'throw'
        ? `setTimeout(() => { throw new Error('tier3-boom'); }, 50);`
        : `setInterval(() => {}, 1000);`; // 'wait': keep alive until the parent signals
  return `
import { createHost, resolveCapabilities } from ${JSON.stringify(engineUrl)};
import { Writable } from 'node:stream';

const caps = resolveCapabilities({
  env: {},
  platform: process.platform,
  override: { altScreen: true, mouse: { sgr: true, drag: true, wheel: true } },
}).profile;

const realOut = process.stdout;
const output = new Writable({ write(chunk, _enc, cb) { realOut.write(chunk); cb(); } });
output.isTTY = true;
output.columns = 80;
output.rows = 24;
output.fd = 1;

const input = process.stdin;
input.isTTY = true;
if (typeof input.setRawMode !== 'function') input.setRawMode = () => input;

void (async () => {
  const host = createHost({ caps, input, output });
  await host.start();
  realOut.write('READY\\n');
  ${action}
})();
`;
}

/** Spawn one child, optionally deliver a signal once READY, and capture its outcome. */
function runChild(
  mode: ChildMode,
  signal?: NodeJS.Signals,
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  const work = mkdtempSync(join(tmpdir(), 'rd09-tier3-'));
  const childPath = join(work, 'host-child.ts');
  writeFileSync(childPath, buildChild(mode));

  return new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>(
    (resolvePromise, rejectPromise) => {
      const child = spawn(CHILD_RUNNER.cmd, [...CHILD_RUNNER.preArgs, childPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let sent = false;
      const guard = setTimeout(() => {
        child.kill('SIGKILL');
        rejectPromise(new Error('child did not exit in time'));
      }, 15_000);

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        if (!sent && signal && stdout.includes('READY')) {
          sent = true;
          child.kill(signal);
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', (err) => {
        clearTimeout(guard);
        rejectPromise(err);
      });
      child.on('close', (code, sig) => {
        clearTimeout(guard);
        resolvePromise({ code, signal: sig, stdout, stderr });
      });
    },
  ).finally(() => rmSync(work, { recursive: true, force: true }));
}

/** Assert the captured output contains the full restore sequence (leave alt-screen + show cursor). */
function assertRestored(stdout: string, context: string): void {
  expect(stdout.includes('?1049l'), context).toBeTruthy();
  expect(stdout.includes('?25h'), context).toBeTruthy();
}

test('ST-12: alt-screen + mouse enter sequences appear during run', async () => {
  const r = await runChild('normal');
  expect(r.stdout.includes('?1049h')).toBeTruthy();
  expect(r.stdout.includes('?1006h')).toBeTruthy();
  expect(r.stdout.includes('?1000h')).toBeTruthy();
  // Enter must precede teardown.
  expect(r.stdout.indexOf('?1049h') < r.stdout.indexOf('?1049l')).toBeTruthy();
});

test('ST-13: normal exit via host.stop() restores and exits 0', async () => {
  const r = await runChild('normal');
  assertRestored(r.stdout, 'normal exit');
  expect(r.stdout.includes('?1000l')).toBeTruthy();
  expect(r.code).toBe(0);
});

test('ST-14: a throw after start() restores and exits non-zero', async () => {
  const r = await runChild('throw');
  assertRestored(r.stdout, 'throw');
  expect(r.code).not.toBe(0);
});

test('ST-15: SIGTERM restores and exits 143 (128 + SIGTERM)', async () => {
  const r = await runChild('wait', 'SIGTERM');
  assertRestored(r.stdout, 'SIGTERM');
  expect(r.code).toBe(143);
});

test('ST-16: SIGHUP restores and exits 129 (128 + SIGHUP)', async () => {
  const r = await runChild('wait', 'SIGHUP');
  assertRestored(r.stdout, 'SIGHUP');
  expect(r.code).toBe(129);
});
