#!/usr/bin/env node
/**
 * Dependency-policy guard (RD-01, AC-6, AR-2, AR-21).
 *
 * Fails the build if any **runtime** dependency requires native compilation or a
 * platform-specific install step. `jsvision` must stay pure-JS and portable
 * across Linux/macOS/Windows (a clean install must never invoke node-gyp).
 *
 * Usage: `node scripts/check-no-native-deps.mjs [projectRoot]`
 *   - projectRoot defaults to the current working directory.
 *   - Reads `<projectRoot>/package.json` and, for each runtime dependency,
 *     inspects its installed manifest under `<projectRoot>/node_modules/<dep>`.
 *
 * Exit codes: 0 = policy satisfied (no native runtime deps); 1 = a violation was
 * found (the offending dependency and reason are printed to stderr).
 *
 * Pure-Node ESM, no shell-isms, so it behaves identically on every OS (AR-4).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';

/** Install-script commands that signal native compilation. */
const NATIVE_SCRIPT_PATTERN = /node-gyp|node-pre-gyp|prebuild|prebuildify|cmake-js|cmake|\bgyp\b/i;
/** Lifecycle scripts that run on install and could trigger a native build. */
const INSTALL_SCRIPTS = ['install', 'preinstall', 'postinstall'];

/**
 * Inspect one installed dependency manifest for native-install signals.
 * @param {string} depDir Absolute path to the dependency's package directory.
 * @param {Record<string, unknown>} manifest Parsed dependency package.json.
 * @returns {string|null} A human-readable reason if native, otherwise null.
 */
function nativeReason(depDir, manifest) {
  if (manifest.gypfile === true) {
    return 'declares "gypfile": true';
  }
  if (existsSync(join(depDir, 'binding.gyp'))) {
    return 'ships a binding.gyp (node-gyp build)';
  }
  const scripts = /** @type {Record<string, string>} */ (manifest.scripts ?? {});
  for (const name of INSTALL_SCRIPTS) {
    const cmd = scripts[name];
    if (typeof cmd === 'string' && NATIVE_SCRIPT_PATTERN.test(cmd)) {
      return `runs a native build in "scripts.${name}": ${cmd}`;
    }
  }
  // A `cpu`/`os` constraint marks a platform-specific (native) artifact.
  if (Array.isArray(manifest.cpu) && manifest.cpu.length > 0) {
    return `declares a "cpu" constraint: ${manifest.cpu.join(', ')}`;
  }
  if (Array.isArray(manifest.os) && manifest.os.length > 0) {
    return `declares an "os" constraint: ${manifest.os.join(', ')}`;
  }
  return null;
}

/**
 * Run the policy check against a project root.
 * @param {string} projectRoot Directory containing package.json.
 * @returns {{ offenders: string[], unresolved: string[] }}
 */
function checkProject(projectRoot) {
  const pkgPath = join(projectRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const deps = pkg.dependencies ?? {};
  const offenders = [];
  const unresolved = [];

  for (const dep of Object.keys(deps)) {
    const depDir = join(projectRoot, 'node_modules', dep);
    const depManifestPath = join(depDir, 'package.json');
    if (!existsSync(depManifestPath)) {
      // Not installed at this root — cannot inspect; report so it is not a silent pass.
      unresolved.push(dep);
      continue;
    }
    const manifest = JSON.parse(readFileSync(depManifestPath, 'utf8'));
    const reason = nativeReason(depDir, manifest);
    if (reason) {
      offenders.push(`${dep}: ${reason}`);
    }
  }

  return { offenders, unresolved };
}

const arg = process.argv[2];
const projectRoot = arg ? (isAbsolute(arg) ? arg : resolve(process.cwd(), arg)) : process.cwd();

try {
  const { offenders, unresolved } = checkProject(projectRoot);

  for (const dep of unresolved) {
    process.stderr.write(`check:deps: warning — runtime dependency "${dep}" is not installed; cannot verify.\n`);
  }

  if (offenders.length > 0) {
    process.stderr.write('check:deps: FAILED — native runtime dependencies are not allowed:\n');
    for (const offender of offenders) {
      process.stderr.write(`  - ${offender}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('check:deps: OK — no native runtime dependencies.\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(`check:deps: ERROR — ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
}
