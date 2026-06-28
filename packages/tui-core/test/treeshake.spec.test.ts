/**
 * Tree-shake / bundle-size check (RD-10 FR-6, plan doc 03-02; ST-4).
 *
 * Specification oracle (ST-4): the package declares `sideEffects:false`, so a real
 * bundler must be able to drop the modules a consumer does not import. We bundle
 * the BUILT ESM entry (`dist/engine/index.js`) two ways with esbuild — once
 * importing a single symbol, once importing everything — and assert the
 * one-symbol bundle is materially smaller. This is a RELATIONAL assertion (a
 * fraction of the full bundle), so it is machine- and version-independent (AR-8,
 * AR-13) — never an absolute byte count.
 *
 * Depends on `dist/` existing; `verify` builds before test, so it is present
 * (RD-09 toolchain ordering). The `console.log(...)` in each entry keeps the
 * imported binding live so a correct tree-shaker cannot drop it as dead code.
 *
 * The `.js` extension on the dist specifier is the real shipped path; esbuild
 * resolves it against `resolveDir` (the repo root).
 */
import { test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** Repo root — the parent of `test/`; esbuild resolves `./dist/...` against it. */
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Bundle a one-line ESM entry against the built engine and return the minified
 * byte length of the single output file.
 */
async function bundleSize(importLine: string): Promise<number> {
  const out = await build({
    stdin: { contents: importLine, resolveDir: repoRoot, loader: 'ts' },
    bundle: true,
    format: 'esm',
    // The engine imports Node built-ins (node:fs/tty); target Node so esbuild
    // treats them as externals rather than failing to resolve them.
    platform: 'node',
    write: false,
    minify: true,
  });
  return out.outputFiles[0].text.length;
}

// ST-4: a one-symbol import must bundle materially smaller than all exports.
test('ST-4: a one-symbol import tree-shakes far smaller than the full library', async () => {
  const full = await bundleSize(`import * as tui from './dist/engine/index.js'; console.log(tui);`);
  const one = await bundleSize(`import { VERSION } from './dist/engine/index.js'; console.log(VERSION);`);

  expect(full > 0 && one > 0).toBeTruthy();
  // 0.5 has clear margin in practice (VERSION pulls in ~nothing; the full surface
  // pulls in every subsystem) yet still fails loudly if `sideEffects` regresses
  // and the whole library is dragged into a single-symbol import.
  expect(one < full * 0.5).toBeTruthy();
});
