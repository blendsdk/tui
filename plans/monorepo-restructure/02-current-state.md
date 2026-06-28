# Current State: Monorepo Restructure

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## What exists today (single package `@blendsdk/tui` v0.1.0)

| Area | Today | Becomes |
|------|-------|---------|
| Package | one root `@blendsdk/tui` (ESM-only, zero runtime deps) | `packages/tui-core` = `@blendsdk/tui-core`; private root workspace |
| Source | `src/engine/**` (6 subsystems + `index.ts` + `version.ts`) | `packages/tui-core/src/engine/**` (unchanged content) |
| Tests | `test/` — 91 files (50 spec / 36 impl / 5 e2e) + 4 helpers + `fixtures/` (5) | 76 non-probe → `packages/tui-core/test/`; 15 probe → `packages/tui-examples/test/` |
| Bench | `bench/frame-bench.mjs` | `packages/tui-core/bench/` (perf spec imports it intra-package) |
| Examples | `examples/{capability-probe,resize-demo}/` | `packages/tui-examples/{...}/` |
| Test runner | `node:test` + `tsx --test` via `scripts/run-tests.mjs` | vitest (unit + separate e2e project); `run-tests.mjs` deleted |
| Assertions | `node:assert/strict` (1,056 calls, 0 bare) | vitest `expect()` via the AR-6 mapping |
| Build | `tsc` (rootDir `src`, src-only) | per-package `tsc` extending `tsconfig.base.json`; orchestrated by turbo |
| Lint | root flat ESLint + Prettier over `.` | root flat ESLint + Prettier over `packages/*` |
| Gate | `scripts/gate.mjs` (spawns `npx tsx --test` e2e + `probe --auto`) | root `scripts/gate.mjs` orchestrating across packages |
| Dep guard | `scripts/check-no-native-deps.mjs` (takes `projectRoot`) | root, scans each PUBLIC package |
| Package mgr | npm (`package-lock.json`), but `packageManager: yarn@1.22.22` declared | yarn 1.x workspaces + `yarn.lock` |
| CI | 3 OS × Node 18/20/22, npm | 3 OS × Node 20/22/24, yarn + turbo |
| Docs | `docs/` (techdocs) + `CHANGELOG.md` (root) | stay at root (monorepo-level) |

## Key grounding facts (verified)

- **`src/engine/version.ts`** hardcodes `export const VERSION = '0.1.0';` and a spec
  asserts it equals `package.json#version`. → the sync script must update both (AR-8).
- **`scripts/check-no-native-deps.mjs:63`** already accepts a `projectRoot` and reads
  `<root>/package.json#dependencies` — so it adapts to per-package scanning with a path arg.
- **`scripts/gate.mjs:43-44`** spawns `npx tsx --test test/host-tier3.e2e.test.ts` and
  `.../host-signals.e2e.test.ts`, and runs `probe --auto`. These commands all change
  under vitest + the package split (AR-7, AR-15).
- **`scripts/run-tests.mjs`** exists only to work around `node --test` glob support on
  Node 18/20 — vitest globs natively, so it is **deleted** (AR-5).
- **e2e child-spawning** (`test/*.e2e.test.ts`): compute a `repoRoot` and invoke either
  `process.execPath --import tsx <file>` (`host-tier3`) or `node_modules/.bin/tsx`
  (`probe`, `host-signals`). The `repoRoot` and bin path shift under the package move
  and must be recomputed relative to each package (AR-7).
- **`install.e2e.test.ts`** packs the package and asserts ESM import works + CJS
  `require()` is rejected → it packs `@blendsdk/tui-core` after the rename (AR-20).
- **Assertion histogram** (drives AR-6): `equal` 692, `ok` 210, `deepEqual` 92,
  `notEqual` 18, `match` 15, `throws` 14, `doesNotThrow` 13, `fail` 2, `notDeepEqual` 1.
  Zero bare `assert(...)`.
- **15 probe test files** (`probe-args`, `probe-auto`, `probe-envmeta`, `probe-manual`,
  `probe-matrix`, `probe-nontty`, `probe-readout`, `probe-report` × spec/impl + `probe.e2e`)
  test the probe harness in `examples/` → move with it to `@blendsdk/tui-examples`.
- **`tsconfig.json`** (rootDir `src`, include `src`) + **`tsconfig.examples.json`**
  (extends, includes `examples`). The latter is superseded by the examples package's
  own tsconfig.

## Relevant Files

| File | Role | Change |
|------|------|--------|
| `package.json` (root) | manifest + scripts | Split: private root (workspaces/turbo scripts) + `packages/tui-core/package.json` |
| `tsconfig.json` / `tsconfig.examples.json` | TS config | → `tsconfig.base.json` + per-package `tsconfig.json` |
| `eslint.config.js` / `.prettierignore` | lint | Globs extended for `packages/*`; ignore `.turbo`, `coverage` |
| `scripts/run-tests.mjs` | test discovery | **Deleted** (vitest globs) |
| `scripts/gate.mjs` | acceptance gate | Move to root; orchestrate across packages |
| `scripts/check-no-native-deps.mjs` | dep guard | Move to root; scan per public package |
| `.github/workflows/ci.yml` | CI | yarn + turbo; Node 20/22/24 |
| `package-lock.json` | npm lock | **Deleted** → `yarn.lock` |

## Dependencies

- **New dev deps**: `turbo`, `vitest` (+ `@vitest/*` as needed). Retained: `tsx`,
  `esbuild`, `@xterm/headless`, `typescript`, ESLint/Prettier stack. All dev-only,
  prebuilt/pure-JS — `check:deps` (runtime-only) stays green.
- **Internal**: `@blendsdk/tui-examples` depends on `@blendsdk/tui-core` via the workspace.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| assert→expect conversion changes an oracle's meaning | Med | High | Fixed AR-6 table; script the 1,028 simple cases, hand-verify the 29 matcher cases; spec values never edited |
| e2e child-spawn paths break after the move | High | Med | Recompute `repoRoot`/tsx-bin per package; run them in the e2e vitest project; keep the POSIX-only CI step |
| Turbo task graph misses the build→test dep (treeshake/perf read `dist/`) | Med | Med | Declare `test` `dependsOn: ["build"]` in `turbo.json`; verify the treeshake spec |
| Version desync between `version.ts` and `package.json` | Low | Med | Sync script updates both; the existing VERSION spec stays green |
| yarn hoisting breaks the e2e `node_modules/.bin/tsx` path | Med | Med | Resolve tsx via the package's own resolution; test e2e on POSIX in CI |
