/**
 * End-to-end test for the event-loop demo (RD-04, PA-9; AC-20 e2e flavor).
 *
 * Immutable oracle (AR-59): the `demo:events` walkthrough runs standalone — no real host/TTY —
 * exits 0 and prints a non-empty themed ASCII frame across the focus → command → modal sequence,
 * resolving the awaited `execView` promise. Mirrors the view-demo / probe e2e child-process spawn;
 * heavier than the unit specs, so it lives outside the unit glob.
 */
import { test, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // packages/examples/test/
const pkgRoot = resolve(here, '..'); // the examples package root
const monorepoRoot = resolve(here, '../../..'); // tsx is hoisted to the monorepo root .bin
const tsxBin = join(monorepoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const mainPath = join(pkgRoot, 'event-demo', 'main.ts');

test('demo:events runs standalone, exits 0, and prints a focus + command + modal walkthrough', async () => {
  const result = await new Promise<{ code: number | null; stdout: string }>((resolvePromise, rejectPromise) => {
    const child = spawn(tsxBin, [mainPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    const guard = setTimeout(() => {
      child.kill('SIGKILL');
      rejectPromise(new Error('demo:events did not exit in time'));
    }, 15_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.on('error', (err) => {
      clearTimeout(guard);
      rejectPromise(err);
    });
    child.on('close', (code) => {
      clearTimeout(guard);
      resolvePromise({ code, stdout });
    });
    child.stdin.end();
  });

  expect(result.code).toBe(0); // standalone exit, no real host
  expect(result.stdout.length).toBeGreaterThan(0);
  expect(result.stdout).toContain('jsvision — Event Loop (RD-04)'); // the menu-bar title composed
  expect(result.stdout).toContain('OK'); // a focusable button
  expect(result.stdout).toContain("'ok' command handled"); // the command step narration
  expect(result.stdout).toContain('modal open'); // the execView step
  expect(result.stdout).toContain('Dialog resolved with: ok'); // the awaited promise resolved
});
