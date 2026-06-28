/**
 * Specification test — lockstep version-sync script (monorepo-restructure, ST-5).
 *
 * Immutable oracle (AR-8): `scripts/sync-versions.mjs <root>` writes the root
 * `package.json#version` (the source of truth) to every PUBLIC workspace package,
 * skipping `private` ones; `--check` reports drift via a non-zero exit without
 * writing. Derived from the AR-8 decision, never from the script's behavior.
 *
 * Runs the real script against a throwaway fixture workspace (testing standard:
 * prefer real objects over mocks). The script is at the MONOREPO root; this test
 * is in packages/tui-core/test/.
 */
import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoPath } from './monorepo-root.js';

const script = repoPath('scripts', 'sync-versions.mjs');

/** Build a fixture workspace: root @ 9.9.9, one public pkg @ 1.0.0, one private @ 0.0.1. */
function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'sync-ver-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'root', private: true, version: '9.9.9' }));
  mkdirSync(join(root, 'packages', 'pub'), { recursive: true });
  mkdirSync(join(root, 'packages', 'priv'), { recursive: true });
  writeFileSync(join(root, 'packages', 'pub', 'package.json'), JSON.stringify({ name: '@x/pub', version: '1.0.0' }));
  writeFileSync(
    join(root, 'packages', 'priv', 'package.json'),
    JSON.stringify({ name: '@x/priv', private: true, version: '0.0.1' }),
  );
  return root;
}

const readVersion = (root: string, pkg: string): string =>
  JSON.parse(readFileSync(join(root, 'packages', pkg, 'package.json'), 'utf8')).version;

test('ST-5: sync writes the root version to public packages and skips private ones', () => {
  const root = makeFixture();
  try {
    const res = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
    expect(res.status, res.stderr).toBe(0);
    expect(readVersion(root, 'pub')).toBe('9.9.9'); // public → root version
    expect(readVersion(root, 'priv')).toBe('0.0.1'); // private → untouched
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ST-5: --check exits 0 when public packages are in lockstep, non-zero on drift', () => {
  const root = makeFixture();
  try {
    // Drift present initially (pub at 1.0.0 ≠ root 9.9.9) → --check fails.
    const drift = spawnSync(process.execPath, [script, '--check', root], { encoding: 'utf8' });
    expect(drift.status).not.toBe(0);
    // After a sync, --check passes.
    spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
    const ok = spawnSync(process.execPath, [script, '--check', root], { encoding: 'utf8' });
    expect(ok.status, ok.stderr).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
