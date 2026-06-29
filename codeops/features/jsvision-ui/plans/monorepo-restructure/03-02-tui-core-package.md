# `@blendsdk/tui-core` Package

> **Document**: 03-02-tui-core-package.md
> **Parent**: [Index](00-index.md) · AR-9, AR-11, AR-20

## Overview

Relocate and rename the current package into `packages/tui-core/` as
`@blendsdk/tui-core`, preserving its ESM/zero-dep/packaging contract. Content is
unchanged; only paths, the name, the Node floor, and per-package config move.

## Implementation Details

### Layout

```
packages/tui-core/
├── package.json          # @blendsdk/tui-core
├── tsconfig.json         # extends ../../tsconfig.base.json
├── vitest.config.ts      # unit + e2e projects (see 03-04)
├── src/engine/**         # MOVED verbatim from repo src/engine/**
├── bench/frame-bench.mjs # MOVED (AR-11; perf spec imports it intra-package)
└── test/                 # MOVED non-probe tests (76) + fixtures/ + helpers
```

`src/engine/**`, `bench/`, the non-probe `test/**`, `test/fixtures/`, and the test
helper modules (`golden-screen-helpers`, `host-doubles`, `input-corpus-helpers`,
`input-fuzz-helpers`) move with `git mv` (history preserved). The 15 `probe-*` /
`probe.e2e` test files do NOT move here — they go to `@blendsdk/tui-examples` (03-03).

### `packages/tui-core/package.json`

```jsonc
{
  "name": "@blendsdk/tui-core",              // AR-20 (was @blendsdk/tui)
  "version": "0.1.0",                        // synced by scripts/sync-versions.mjs (AR-8)
  "description": "Foundation engine for Turbo Vision-style terminal apps",
  "license": "MIT",
  "type": "module",
  "engines": { "node": ">=20" },             // AR-2
  "sideEffects": false,
  "types": "./dist/engine/index.d.ts",
  "exports": { ".": { "types": "./dist/engine/index.d.ts", "import": "./dist/engine/index.js" } },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --project unit",
    "test:e2e": "vitest run --project e2e",   // AR-7 (POSIX; explicit)
    "lint": "eslint . && prettier --check .",
    "check:deps": "node ../../scripts/check-no-native-deps.mjs .",  // AR-16
    "bench": "tsx bench/frame-bench.mjs",
    "verify": "tsc --noEmit && tsc && vitest run --project unit"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@xterm/headless": "^6.0.0",
    "esbuild": "^0.28.1",
    "tsx": "^4.19.2",
    "vitest": "^4"
  }
}
```

- `exports`/`files`/`sideEffects`/`types` are **byte-identical** to today — the RD-01
  packaging spec stays the oracle (it moves with the tests). Paths stay `dist/engine/*`
  because `src/engine/*` is preserved.
- `check:deps` invokes the root script with this package dir (`.`) — the script already
  takes a `projectRoot` arg (`check-no-native-deps.mjs:63`).
- README/LICENSE: a `packages/tui-core/README.md` is added (short, package-scoped,
  pointing at the root docs); LICENSE is referenced for the `files` allowlist.

### Import specifiers (unchanged)

Tests import the engine via the relative `../src/engine/index.js` (NodeNext `.js`),
which still resolves after the move because `src/` and `test/` move together. No test
import path changes for tui-core. *(grounding: tests use `from '../src/engine/index.js'`)*

### `version.ts` + the version spec (AR-8)

`src/engine/version.ts` keeps `export const VERSION = '...'`; the existing spec that
asserts `VERSION === package.json#version` moves with it. `scripts/sync-versions.mjs`
updates **both** so the spec stays green (see 03-05).

## Integration Points
- Consumed by `@blendsdk/tui-examples` (workspace dep) and by the root gate (e2e).
- `bench/frame-bench.mjs` imports `../src/engine/index.js`; `perf-budget.spec` imports
  `../bench/frame-bench.mjs` — both intra-package, unchanged (AR-11).

## Error Handling

| Error case | Strategy | AR |
|------------|----------|----|
| Packaging contract drift after move | RD-01 packaging spec (moved) asserts exports/`.d.ts`/`sideEffects`/`engines` | AR-9 |
| `dist/` path change breaks treeshake spec | Paths preserved (`src/engine` → `dist/engine`); spec `dist/engine/index.js` ref still valid | AR-9 |
| `engines` says `>=20` but a 0.1.0 consumer assumed 18 | Documented in CHANGELOG as the monorepo cutover | AR-2 |

## Testing Requirements
- All moved tui-core specs/impls stay green under vitest (regression oracle, AR-14).
- The RD-01 packaging spec and the RD-10 treeshake/perf specs verify the package
  contract survived the move (07: ST-3, ST-4).
