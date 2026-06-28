/**
 * End-to-end packaging spec test (RD-01, ST-13/ST-14).
 *
 * Immutable oracle: expectations derive from AC-1 / AR-6, not from the
 * implementation. Packs the real tarball, installs it into a throwaway consumer
 * project, and asserts:
 *   - ST-13: ESM `import { VERSION } from '@jsvision/core'` resolves and the
 *     installed package ships `.d.ts` declarations.
 *   - ST-14: CJS `require('@jsvision/core')` fails with an ESM-related error.
 *
 * This is heavier than the unit specs (real `npm pack` + `npm install`) and so
 * runs in the vitest `e2e` project (not the unit run); run it explicitly via
 * `vitest run --project e2e`.
 */
import { test, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // test/
const repoRoot = resolve(here, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** Build the tarball into `dest` and return its absolute path. */
function packInto(dest: string): string {
  const out = execFileSync(npm, ['pack', '--json', '--pack-destination', dest], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const json = out.slice(out.indexOf('['), out.lastIndexOf(']') + 1);
  const parsed = JSON.parse(json) as Array<{ filename: string }>;
  return join(dest, parsed[0].filename);
}

test('ST-13/ST-14: packed tarball installs; ESM import works, CJS require fails', () => {
  const work = mkdtempSync(join(tmpdir(), 'rd01-e2e-'));
  try {
    const tarball = packInto(work);

    // A minimal consumer project that installs the tarball.
    const consumer = join(work, 'consumer');
    mkdirSync(consumer, { recursive: true });
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'consumer', version: '1.0.0', private: true }),
    );
    execFileSync(npm, ['install', tarball, '--no-audit', '--no-fund', '--no-save'], {
      cwd: consumer,
      encoding: 'utf8',
    });

    // ST-13: the installed package ships its declaration file.
    const installedDts = join(consumer, 'node_modules', '@blendsdk', 'tui-core', 'dist', 'engine', 'index.d.ts');
    expect(existsSync(installedDts)).toBeTruthy();

    // ST-13: ESM import resolves and yields the version.
    writeFileSync(join(consumer, 'esm.mjs'), "import { VERSION } from '@jsvision/core';\nconsole.log(VERSION);\n");
    const esm = spawnSync(process.execPath, ['esm.mjs'], { cwd: consumer, encoding: 'utf8' });
    expect(esm.status).toBe(0);
    expect(esm.stdout.trim()).toBe('0.1.0');

    // ST-14: CJS require fails with an ESM-related error.
    writeFileSync(join(consumer, 'cjs.cjs'), "require('@jsvision/core');\n");
    const cjs = spawnSync(process.execPath, ['cjs.cjs'], { cwd: consumer, encoding: 'utf8' });
    expect(cjs.status).not.toBe(0);
    expect(
      /ERR_REQUIRE_ESM|ERR_PACKAGE_PATH_NOT_EXPORTED|require\(\) of ES Module|Must use import/i.test(cjs.stderr),
    ).toBeTruthy();
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
