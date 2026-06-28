/**
 * End-to-end real-signal test (RD-07, ST-12 / AC-2 / AR-6, AR-13).
 *
 * Immutable oracle: expectation derives from the AR-6 exit-code matrix and AR-13,
 * not the implementation. The injectable adapter proves the host's logic
 * in-process; this is the one irreducible proof that a **real** SIGINT delivered
 * to a **real** process triggers the host's real signal handler → real
 * `process.exit(130)` and a real restore (leave-mode written to real stdout).
 *
 * No `node-pty` (AR-13): the child advertises its piped streams as TTYs with a
 * no-op `setRawMode`, so the real `realRuntime` adapter, the real `process`
 * SIGINT handler, and the real `process.exit` are all exercised — only the TTY
 * flag is accommodated. Heavier than the unit specs, so it lives outside the
 * unit glob; run explicitly: `npx tsx --test test/host-signals.e2e.test.ts`.
 */
import { test, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // test/
const repoRoot = resolve(here, '..');
const tsxBin = join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const engineUrl = pathToFileURL(join(repoRoot, 'src', 'engine', 'index.ts')).href;

/** A tiny real host program: enters TUI mode, signals READY, then waits for SIGINT. */
const CHILD = `
import { createHost, resolveCapabilities } from ${JSON.stringify(engineUrl)};
import { Writable } from 'node:stream';

const caps = resolveCapabilities({ env: {}, platform: process.platform, override: { altScreen: true } }).profile;

// Forward to the real stdout fd but advertise a TTY (no pty available, AR-13).
const realOut = process.stdout;
const output = new Writable({ write(chunk, _enc, cb) { realOut.write(chunk); cb(); } });
output.isTTY = true;
output.columns = 80;
output.rows = 24;
output.fd = 1;

// Real stdin, advertised as a TTY with a no-op setRawMode (it is piped here).
const input = process.stdin;
input.isTTY = true;
if (typeof input.setRawMode !== 'function') input.setRawMode = () => input;

// Wrapped in an async IIFE: the temp file resolves as CJS (no package.json in
// tmpdir), where top-level await is unsupported.
void (async () => {
  const host = createHost({ caps, input, output });
  await host.start();
  realOut.write('READY\\n');
})();
`;

test('ST-12: a real SIGINT exits 130 and restores the terminal', async () => {
  const work = mkdtempSync(join(tmpdir(), 'rd07-e2e-'));
  const childPath = join(work, 'host-child.ts');
  writeFileSync(childPath, CHILD);

  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }>(
      (resolvePromise, rejectPromise) => {
        const child = spawn(tsxBin, [childPath], { stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        let sent = false;
        const guard = setTimeout(() => {
          child.kill('SIGKILL');
          rejectPromise(new Error('child did not exit in time'));
        }, 15_000);

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
          if (!sent && stdout.includes('READY')) {
            sent = true;
            child.kill('SIGINT'); // the real signal under test
          }
        });
        child.on('error', (err) => {
          clearTimeout(guard);
          rejectPromise(err);
        });
        child.on('close', (code, signal) => {
          clearTimeout(guard);
          resolvePromise({ code, signal, stdout });
        });
      },
    );

    expect(result.code).toBe(130);
    expect(result.stdout.includes('?1049l')).toBeTruthy();
    expect(result.stdout.includes('?25h')).toBeTruthy();
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
