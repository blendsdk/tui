/**
 * Specification tests — Toolchain enforcement (RD-01, ST-8…ST-11).
 *
 * Immutable oracle: expectations derive from the acceptance criteria
 * (AC-2, AC-5, AC-6), the component specs (03-02, 03-03), and the Ambiguity
 * Register (PL-8) — never from reading the implementation. If a test here fails
 * after implementation, the implementation is wrong.
 *
 * All cases exercise real tools (tsc, the guard script, the test runner) against
 * real temp fixtures rather than mocking (testing standard: prefer real objects).
 */
import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { monorepoRoot } from './monorepo-root.js';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url)); // packages/tui-core/test/
const repoRoot = resolve(here, '..'); // the tui-core package root (its tsconfig)

/** Create a fresh temp directory; the caller is responsible for cleanup. */
function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Resolve the local TypeScript compiler entry as a node-runnable script. */
function tscCli(): string {
  return require.resolve('typescript/bin/tsc');
}

/** Run the dependency-policy guard against a project root; never throws. */
function runGuard(rootDir: string): { status: number | null; stdout: string; stderr: string } {
  const scriptPath = resolve(monorepoRoot, 'scripts/check-no-native-deps.mjs');
  const res = spawnSync(process.execPath, [scriptPath, rootDir], { encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

// ST-8 (AC-5): an unused import fails typecheck under the project's compiler
// options (noUnusedLocals). The fixture tsconfig extends the real project config
// so the assertion proves the project posture, not an ad-hoc flag set.
test('ST-8: a source file with an unused import fails tsc', () => {
  const dir = makeTempDir('rd01-st8-');
  try {
    writeFileSync(join(dir, 'fixture.ts'), "import { readFileSync } from 'node:fs';\nexport const value = 1;\n");
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        extends: resolve(repoRoot, 'tsconfig.json'),
        compilerOptions: { noEmit: true, rootDir: '.', outDir: './out' },
        include: ['fixture.ts'],
      }),
    );
    const res = spawnSync(process.execPath, [tscCli(), '-p', join(dir, 'tsconfig.json')], { encoding: 'utf8' });
    expect(res.status).not.toBe(0);
    const output = `${res.stdout}${res.stderr}`;
    expect(/6133|declared but never used|never read/.test(output)).toBeTruthy();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ST-9 (AC-6): the guard passes for a manifest with empty dependencies.
test('ST-9: guard exits 0 for empty dependencies', () => {
  const dir = makeTempDir('rd01-st9-');
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', dependencies: {} }));
    const res = runGuard(dir);
    expect(res.status).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ST-10 (AC-6): the guard fails and names the offending dep when a runtime dep
// declares a native install signal (gypfile:true on the installed manifest).
test('ST-10: guard fails and names a native runtime dependency', () => {
  const dir = makeTempDir('rd01-st10-');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0', dependencies: { nativelib: '1.0.0' } }),
    );
    const depDir = join(dir, 'node_modules', 'nativelib');
    mkdirSync(depDir, { recursive: true });
    writeFileSync(join(depDir, 'package.json'), JSON.stringify({ name: 'nativelib', version: '1.0.0', gypfile: true }));
    const res = runGuard(dir);
    expect(res.status).not.toBe(0);
    expect(/nativelib/.test(`${res.stdout}${res.stderr}`)).toBeTruthy();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ST-11 (AC-2 structure, AR-4, AR-23): the CI workflow covers the full matrix.
test('ST-11: ci.yml declares the 3×3 OS/Node matrix and runs verify', () => {
  const yml = readFileSync(resolve(monorepoRoot, '.github/workflows/ci.yml'), 'utf8');
  for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    expect(yml.includes(os)).toBeTruthy();
  }
  for (const node of ['20', '22', '24']) {
    // AR-2: Node 18 dropped (EOL); the matrix moved to 20/22/24.
    expect(new RegExp(`(^|[^0-9])${node}([^0-9]|$)`, 'm').test(yml)).toBeTruthy();
  }
  expect(/yarn verify/.test(yml)).toBeTruthy();
});

// ST-12 removed (runtime AR-22): it tested the custom scripts/run-tests.mjs
// discovery runner, which vitest replaces (AR-5). vitest owns test discovery via
// its `include` globs — self-evidently exercised by the full suite it finds.
