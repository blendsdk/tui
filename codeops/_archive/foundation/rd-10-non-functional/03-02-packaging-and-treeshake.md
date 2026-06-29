# Packaging & Tree-Shake: RD-10

> **Document**: 03-02-packaging-and-treeshake.md
> **Parent**: [Index](00-index.md) · ST-4, ST-5

## Overview

Verify the package is tree-shakeable with a real bundler (AC-4), and map the
already-enforced packaging contract (ESM-only, `.d.ts`, `sideEffects:false`,
`engines.node>=18`) to RD-01's `packaging.spec` rather than re-testing it (AR-8, AR-10).

## Implementation Details

### Tree-shake check — `test/treeshake.spec.test.ts` (ST-4)

New dev dep **`esbuild`** (dev-only, never in `dist`; ships a prebuilt platform
binary — no node-gyp/compile step, so it installs clean on all 3 OS; `check:deps`
stays green since it guards **runtime** deps only). The test bundles the built entry
two ways and asserts a **relational** size gap (AR-8/AR-13):

```ts
import { build } from 'esbuild';

async function bundleSize(importLine: string): Promise<number> {
  const out = await build({
    stdin: { contents: importLine, resolveDir: repoRoot, loader: 'ts' },
    bundle: true, format: 'esm', write: false, minify: true,
    // bundle against the built ESM entry so we measure shippable output
  });
  return out.outputFiles[0].text.length;
}

const full = await bundleSize(`import * as tui from './dist/engine/index.js'; console.log(tui);`);
const one = await bundleSize(`import { VERSION } from './dist/engine/index.js'; console.log(VERSION);`);

assert.ok(one < full * 0.5, `one-symbol import (${one}b) should be ≪ full (${full}b) — tree-shaking failed`);
```

- **Relational** assertion (single ≤ a set fraction of full) — machine/version-independent (AR-13).
- Bundles the **built** `dist/engine/index.js` (verify builds before test, AR from RD-09 toolchain fix), so it measures real shippable output, not source.
- `console.log(...)` keeps the imported binding live so a real tree-shaker can't drop it as dead.
- The exact fraction (start at `0.5`) is tuned during implementation so it passes with clear margin yet would catch a regression that pulls in the whole library.

### Packaging contract — **mapped**, not re-tested (FR-5, AR-10)

RD-01 `test/packaging.spec.test.ts` already asserts: ESM-only `exports` with no
`require` (ST-6), `.d.ts` shipped + built output present (ST-7), `sideEffects:false`
+ `engines.node>=18` (ST-5), and the file allowlist (ST-3/ST-4). RD-10 references
these; no new packaging assertions beyond the tree-shake gap.

### Integration Points
- `treeshake.spec.test.ts` joins the unit glob (runs under `verify`); it depends on `dist/` existing (guaranteed — `verify` builds before test).
- Adds `esbuild` to `devDependencies`; `check:deps` remains green (runtime deps unchanged: none).

## Error Handling

| Error case | Strategy | AR |
|------------|----------|----|
| One-symbol bundle not materially smaller | Spec fails — a `sideEffects` regression or accidental eager import | AR-4 |
| esbuild pulls a native/transitive dep | `check:deps` (runtime-only) + audit stay green; esbuild's platform binary is prebuilt (no compile) and dev-only | AR-4 |
| `dist/` missing at test time | Pre-empted: `verify` builds before test (toolchain ordering) | — |

> **Traceability:** decisions reference `00-ambiguity-register.md`.

## Testing Requirements
- `treeshake.spec.test.ts`: ST-4 (single ≪ full). No impl test needed (single relational assertion); the packaging contract is covered by the existing RD-01 spec.
