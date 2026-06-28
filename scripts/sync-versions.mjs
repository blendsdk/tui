#!/usr/bin/env node
/**
 * Lockstep version-sync (monorepo-restructure, AR-8).
 *
 * The root `package.json#version` is the single source of truth. This script
 * writes it to every PUBLIC workspace package under `packages/*`, skipping any
 * package marked `"private": true`. For `@blendsdk/tui-core` it also rewrites the
 * `VERSION` constant in `src/engine/version.ts`, keeping the packaging spec
 * (`VERSION === package.json#version`) green.
 *
 * Usage:
 *   node scripts/sync-versions.mjs [root]            # write the synced version
 *   node scripts/sync-versions.mjs --check [root]    # report drift, non-zero exit, no writes
 *
 * `root` defaults to the monorepo root (the parent of this script's directory).
 * Pure-Node ESM, mirroring scripts/check-no-native-deps.mjs.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const check = args.includes('--check');
const positional = args.find((a) => !a.startsWith('--'));
const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = positional ? resolve(positional) : resolve(scriptDir, '..');

/** Read + parse a package.json, or null if absent. */
function readPkg(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

const rootPkg = readPkg(join(root, 'package.json'));
if (!rootPkg || typeof rootPkg.version !== 'string') {
  process.stderr.write(`sync-versions: no version in ${join(root, 'package.json')}\n`);
  process.exit(1);
}
const target = rootPkg.version;

/** Every packages/<name>/package.json path. */
function workspacePackages() {
  const dir = join(root, 'packages');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const pkgPath = join(dir, name, 'package.json');
    if (statSync(join(dir, name)).isDirectory() && existsSync(pkgPath)) out.push(pkgPath);
  }
  return out;
}

/** Rewrite `export const VERSION = '...'` in a tui-core version.ts, if present. */
function syncVersionConstant(pkgDir) {
  const versionFile = join(pkgDir, 'src', 'engine', 'version.ts');
  if (!existsSync(versionFile)) return false;
  const src = readFileSync(versionFile, 'utf8');
  const next = src.replace(/(export const VERSION\s*=\s*)['"][^'"]*['"]/, `$1'${target}'`);
  if (next !== src) {
    if (!check) writeFileSync(versionFile, next);
    return true;
  }
  return false;
}

const drift = [];
const written = [];

for (const pkgPath of workspacePackages()) {
  const pkg = readPkg(pkgPath);
  if (!pkg || pkg.private === true) continue; // skip private packages (AR-8)
  const pkgDir = dirname(pkgPath);

  if (pkg.version !== target) {
    drift.push(`${pkg.name}: ${pkg.version} → ${target}`);
    if (!check) {
      pkg.version = target;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      written.push(pkg.name);
    }
  }
  // The VERSION constant must match the package version too.
  if (syncVersionConstant(pkgDir) && check) drift.push(`${pkg.name}: version.ts out of sync`);
}

if (check) {
  if (drift.length > 0) {
    process.stderr.write(`sync-versions --check: drift from root ${target}:\n  ${drift.join('\n  ')}\n`);
    process.exit(1);
  }
  process.stdout.write(`sync-versions --check: all public packages at ${target}.\n`);
  process.exit(0);
}

process.stdout.write(
  written.length > 0
    ? `sync-versions: set ${written.join(', ')} to ${target}.\n`
    : `sync-versions: all public packages already at ${target}.\n`,
);
process.exit(0);
