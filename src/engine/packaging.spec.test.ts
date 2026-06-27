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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The public entry point under test. The `.js` specifier is required by
// NodeNext ESM resolution and is resolved to the .ts source by tsx at runtime.
import { VERSION } from './index.js';

const here = dirname(fileURLToPath(import.meta.url)); // src/engine
const repoRoot = resolve(here, '..', '..'); // repository root

/** Parse the repository's package.json fresh from disk. */
function readPackageJson(): Record<string, unknown> {
  const raw = readFileSync(resolve(repoRoot, 'package.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * Run `npm pack --dry-run --json` and return the list of file paths that would
 * be published (paths are package-root-relative, forward-slashed by npm).
 */
function packFileList(): string[] {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const stdout = execFileSync(npm, ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  // --json prints a JSON array; slice from the first '[' to be robust to any
  // leading notice lines some npm versions emit.
  const json = stdout.slice(stdout.indexOf('['), stdout.lastIndexOf(']') + 1);
  const parsed = JSON.parse(json) as Array<{ files: Array<{ path: string }> }>;
  return parsed.flatMap((entry) => entry.files.map((f) => f.path));
}

// ST-1 (AC-1, PL-7): VERSION is exported and is a non-empty string.
test('ST-1: VERSION is a non-empty string', () => {
  assert.equal(typeof VERSION, 'string');
  assert.ok(VERSION.length > 0, 'VERSION must be a non-empty string');
});

// ST-2 (PL-6, PL-7): exported VERSION equals package.json#version (0.1.0).
test('ST-2: VERSION equals package.json#version', () => {
  const pkg = readPackageJson();
  assert.equal(VERSION, pkg['version']);
  assert.equal(VERSION, '0.1.0');
});

// ST-3 (AC-3): every packed path is under dist/ or is an allowed root file.
test('ST-3: packed files are a subset of dist/** ∪ {package.json, README.md, LICENSE}', () => {
  const allowedRootFiles = new Set(['package.json', 'README.md', 'LICENSE']);
  const files = packFileList();
  assert.ok(files.length > 0, 'npm pack reported no files');
  for (const path of files) {
    const ok = path.startsWith('dist/') || allowedRootFiles.has(path);
    assert.ok(ok, `unexpected file in package: ${path}`);
  }
});

// ST-4 (AC-3): the package excludes sources, tests, and node_modules.
test('ST-4: packed files exclude src/, tests, and node_modules', () => {
  const files = packFileList();
  for (const path of files) {
    assert.ok(!path.startsWith('src/'), `src/ leaked into package: ${path}`);
    assert.ok(!/\.test\./.test(path), `test file leaked into package: ${path}`);
    assert.ok(!path.includes('node_modules'), `node_modules leaked: ${path}`);
  }
});

// ST-5 (AC-4): packaging fields declare an ESM, side-effect-free, dep-free package.
test('ST-5: package.json declares the ESM packaging contract', () => {
  const pkg = readPackageJson();
  assert.equal(pkg['type'], 'module');
  assert.equal(pkg['sideEffects'], false);
  const engines = pkg['engines'] as Record<string, unknown> | undefined;
  assert.equal(engines?.['node'], '>=18');
  const exportsMap = pkg['exports'] as Record<string, unknown> | undefined;
  assert.ok(exportsMap?.['.'], "exports['.'] must be present");
  const deps = pkg['dependencies'] as Record<string, unknown> | undefined;
  assert.equal(deps == null || Object.keys(deps).length === 0, true, 'dependencies must be empty/absent');
});

// ST-6 (AC-1, AR-6): exports['.'] is ESM-only (import + types, no require).
test("ST-6: exports['.'] has import + types and no require key", () => {
  const pkg = readPackageJson();
  const exportsMap = pkg['exports'] as Record<string, unknown>;
  const dot = exportsMap['.'] as Record<string, unknown>;
  assert.ok(dot['import'], "exports['.'].import must be present");
  assert.ok(dot['types'], "exports['.'].types must be present");
  assert.equal('require' in dot, false, "exports['.'] must not declare a require condition");
});

// ST-7 (AC-1, AC-3): the build emits both the JS entry and its declaration.
test('ST-7: build output contains dist/engine/index.js and index.d.ts', () => {
  assert.ok(existsSync(resolve(repoRoot, 'dist/engine/index.js')), 'dist/engine/index.js missing — run npm run build');
  assert.ok(existsSync(resolve(repoRoot, 'dist/engine/index.d.ts')), 'dist/engine/index.d.ts missing — run npm run build');
});
