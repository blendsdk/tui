/**
 * Specification tests — Package identity & build (RD-01, ST-1…ST-7).
 *
 * Immutable oracle: expectations derive from the acceptance criteria
 * (AC-1, AC-3, AC-4), the component spec (03-01-package-and-build.md), and the
 * Ambiguity Register (PL-6, PL-7) — never from reading the implementation. If a
 * test here fails after implementation, the implementation is wrong.
 *
 * Some cases (ST-3, ST-7) assert against produced artifacts and therefore
 * require `npm run build` / `npm pack` to be runnable; they invoke the real
 * tools rather than mocking (testing standard: prefer real objects).
 */
import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The public entry point under test. The `.js` specifier is required by
// NodeNext ESM resolution and is resolved to the .ts source by tsx at runtime.
import { VERSION } from '../src/engine/index.js';

const here = dirname(fileURLToPath(import.meta.url)); // test/
const repoRoot = resolve(here, '..'); // repository root

/** Parse the repository's package.json fresh from disk. */
function readPackageJson(): Record<string, unknown> {
  const raw = readFileSync(resolve(repoRoot, 'package.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * Run `npm pack --dry-run --json` and return the list of file paths that would
 * be published (paths are package-root-relative, forward-slashed by npm).
 */
let cachedPackFiles: string[] | undefined;
function packFileList(): string[] {
  // `npm pack` is slow (seconds, esp. on Windows); memoize so the file's pack
  // tests share one invocation.
  if (cachedPackFiles) return cachedPackFiles;
  const isWin = process.platform === 'win32';
  const npm = isWin ? 'npm.cmd' : 'npm';
  const stdout = execFileSync(npm, ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    // Node's post-CVE-2024-27980 hardening rejects execFile of a .cmd without a
    // shell on Windows (EINVAL); run through the shell there. Args are static.
    shell: isWin,
  });
  // --json prints a JSON array; slice from the first '[' to be robust to any
  // leading notice lines some npm versions emit.
  const json = stdout.slice(stdout.indexOf('['), stdout.lastIndexOf(']') + 1);
  const parsed = JSON.parse(json) as Array<{ files: Array<{ path: string }> }>;
  cachedPackFiles = parsed.flatMap((entry) => entry.files.map((f) => f.path));
  return cachedPackFiles;
}

/** Per-test timeout for `npm pack`-backed tests — generous for slow Windows runners. */
const PACK_TIMEOUT_MS = 60_000;

// ST-1 (AC-1, PL-7): VERSION is exported and is a non-empty string.
test('ST-1: VERSION is a non-empty string', () => {
  expect(typeof VERSION).toBe('string');
  expect(VERSION.length > 0).toBeTruthy();
});

// ST-2 (PL-6, PL-7): exported VERSION equals package.json#version (0.1.0).
test('ST-2: VERSION equals package.json#version', () => {
  const pkg = readPackageJson();
  expect(VERSION).toBe(pkg['version']);
  expect(VERSION).toBe('0.1.0');
});

// ST-3 (AC-3): every packed path is under dist/ or is an allowed root file.
test(
  'ST-3: packed files are a subset of dist/** ∪ {package.json, README.md, LICENSE}',
  () => {
    const allowedRootFiles = new Set(['package.json', 'README.md', 'LICENSE']);
    const files = packFileList();
    expect(files.length > 0).toBeTruthy();
    for (const path of files) {
      const ok = path.startsWith('dist/') || allowedRootFiles.has(path);
      expect(ok).toBeTruthy();
    }
  },
  PACK_TIMEOUT_MS,
);

// ST-4 (AC-3): the package excludes sources, tests, and node_modules.
test(
  'ST-4: packed files exclude src/, tests, and node_modules',
  () => {
    const files = packFileList();
    for (const path of files) {
      expect(!path.startsWith('src/')).toBeTruthy();
      expect(!/\.test\./.test(path)).toBeTruthy();
      expect(!path.includes('node_modules')).toBeTruthy();
    }
  },
  PACK_TIMEOUT_MS,
);

// ST-5 (AC-4): packaging fields declare an ESM, side-effect-free, dep-free package.
test('ST-5: package.json declares the ESM packaging contract', () => {
  const pkg = readPackageJson();
  expect(pkg['type']).toBe('module');
  expect(pkg['sideEffects']).toBe(false);
  const engines = pkg['engines'] as Record<string, unknown> | undefined;
  expect(engines?.['node']).toBe('>=20'); // AR-2: Node floor raised (18 dropped, EOL)
  const exportsMap = pkg['exports'] as Record<string, unknown> | undefined;
  expect(exportsMap?.['.']).toBeTruthy();
  const deps = pkg['dependencies'] as Record<string, unknown> | undefined;
  expect(deps == null || Object.keys(deps).length === 0).toBe(true);
});

// ST-6 (AC-1, AR-6): exports['.'] is ESM-only (import + types, no require).
test("ST-6: exports['.'] has import + types and no require key", () => {
  const pkg = readPackageJson();
  const exportsMap = pkg['exports'] as Record<string, unknown>;
  const dot = exportsMap['.'] as Record<string, unknown>;
  expect(dot['import']).toBeTruthy();
  expect(dot['types']).toBeTruthy();
  expect('require' in dot).toBe(false);
});

// ST-7 (AC-1, AC-3): the build emits both the JS entry and its declaration.
test('ST-7: build output contains dist/engine/index.js and index.d.ts', () => {
  expect(existsSync(resolve(repoRoot, 'dist/engine/index.js'))).toBeTruthy();
  expect(existsSync(resolve(repoRoot, 'dist/engine/index.d.ts'))).toBeTruthy();
});
