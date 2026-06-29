# Requirements: Monorepo Restructure

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Restructure the repository from a single package into a yarn 1.x + Turborepo monorepo
of versioned packages, migrate the test runner to vitest, and enforce a single shared
version across all public packages — **preserving all existing runtime behavior**.

## Functional Requirements

### Must Have — Workspace & tooling
- [ ] **FR-1 — yarn 1.x workspaces**: a private root package declares
  `workspaces: ["packages/*"]`; `package-lock.json` is removed and a committed
  `yarn.lock` replaces it; `yarn install` resolves the workspace. *(AR-3)*
- [ ] **FR-2 — Turborepo**: a `turbo.json` defines the task pipeline
  (`build`→`typecheck`→`test`→`lint`→`check:deps`) with correct task dependencies
  (the treeshake/perf tests depend on `build`); root scripts delegate to `turbo run`. *(AR-4)*
- [ ] **FR-3 — Node floor**: `engines.node` is `>=20` everywhere; CI runs Node 20/22/24. *(AR-2)*
- [ ] **FR-4 — Shared config**: one root ESLint flat config + Prettier; a root
  `tsconfig.base.json` each package extends with its own `rootDir`/`outDir`. *(AR-13)*

### Must Have — Packages
- [ ] **FR-5 — `@blendsdk/tui-core`**: the current package moves to `packages/tui-core`
  and is renamed; it keeps `src/`, `bench/`, the non-probe tests + `test/fixtures/`,
  and its `exports`/`files`/`sideEffects:false`/`types` contract. *(AR-9)*
- [ ] **FR-6 — `@blendsdk/tui-examples`**: a new **private** (unpublished, version-
  excluded) package holds `capability-probe` + `resize-demo` and the 15 probe test
  files, depending on `@blendsdk/tui-core` via the workspace. *(AR-10)*
- [ ] **FR-7 — Future-package convention**: new packages are `@blendsdk/tui-<name>`
  under `packages/tui-<name>`, documented in CLAUDE.md. *(AR-17)*

### Must Have — Test runner
- [ ] **FR-8 — vitest**: vitest replaces `node:test` + `tsx --test` +
  `scripts/run-tests.mjs` (deleted); each package has a vitest config globbing
  `*.spec.test.ts` / `*.impl.test.ts`. *(AR-5)*
- [ ] **FR-9 — assert→expect**: every `node:assert/strict` call converts to vitest
  `expect()` via the fixed AR-6 mapping; **expected values are unchanged** (a syntax
  migration, not an oracle change). *(AR-6)*
- [ ] **FR-10 — e2e project**: the 5 child-spawning `*.e2e.test.ts` run under a
  separate vitest project (single-fork, no parallel, extended timeout), excluded from
  the default unit run; children still spawn via `tsx`. *(AR-7, AR-21)*

### Must Have — Versioning & governance
- [ ] **FR-11 — Lockstep versions**: `scripts/sync-versions.mjs` writes the root
  `package.json#version` to every PUBLIC package (its `package.json#version` and
  `tui-core`'s `src/engine/version.ts`), skipping private packages. *(AR-8)*
- [ ] **FR-12 — Root acceptance gate**: `scripts/gate.mjs` moves to the root and
  orchestrates across packages (core e2e via vitest + examples `probe --auto`);
  `docs/acceptance-gate.md` stays at root. *(AR-15)*
- [ ] **FR-13 — Dependency guard**: `scripts/check-no-native-deps.mjs` scans each
  PUBLIC package's runtime deps and stays green (turbo/vitest/esbuild/tsx are dev-only). *(AR-16)*
- [ ] **FR-14 — CI**: the workflow uses `yarn install --frozen-lockfile` + `turbo run`
  across the 20/22/24 matrix; e2e (POSIX) + audit + pack + informational bench preserved. *(AR-2, AR-15)*
- [ ] **FR-15 — Docs sync**: `docs/`, a single root `CHANGELOG.md`, README install, and
  CLAUDE.md are updated to the monorepo + `@blendsdk/tui-core` name. *(AR-12, AR-20)*

### Won't Have (Out of Scope)
- A new functional package, or scaffolding a sample package (AR-14).
- Changesets / automated release / per-package CHANGELOG (DEF-1).
- Publishing `@blendsdk/tui-core` to npm, with provenance (DEF-2 / RD-10 DEF-1).
- Turbo remote caching (DEF-3).
- Any change to runtime behavior or public API surface of the engine.

## Technical Requirements

### Compatibility
- `engines.node >=20` (latest vitest dropped Node 18; Node 18 is EOL). New dev deps
  (`turbo`, `vitest`, retained `tsx`/`esbuild`) ship prebuilt binaries / pure JS — no
  node-gyp — so `check:deps` (runtime-only) stays green and installs stay clean. *(AR-2, AR-16)*

### Behavior preservation
- The migrated existing test suite (76 in tui-core + 15 in examples) is the regression
  oracle: `verify` and `gate` must be green at the end of each phase. No expected
  value in any `*.spec.test.ts` may change (AR-6). *(AR-6, AR-14)*

### Security
- No secrets/PII introduced. The dependency-policy guard and `npm audit` (CI) remain
  enforced per public package. *(AR-16)*

## Acceptance Criteria

1. [ ] `yarn install` resolves the workspace; `yarn.lock` committed; no `package-lock.json`. *(FR-1)*
2. [ ] `yarn turbo run verify` is green across all packages; turbo caches tasks. *(FR-2)*
3. [ ] `packages/tui-core` is `@blendsdk/tui-core` (`engines.node >=20`); `packages/tui-examples` is the private `@blendsdk/tui-examples`. *(FR-5, FR-6)*
4. [ ] All tests run under vitest; `scripts/run-tests.mjs` is gone; the e2e project runs the 5 e2e files green (POSIX). *(FR-8, FR-10)*
5. [ ] No `*.spec.test.ts` expected value changed — only assertion syntax (AR-6). *(FR-9)*
6. [ ] `yarn sync-versions` sets every public package to the root version and skips private ones; the `VERSION === package.json#version` spec stays green. *(FR-11)*
7. [ ] `yarn gate` (root) passes, orchestrating core e2e + examples probe; CI green on 20/22/24. *(FR-12, FR-14)*
8. [ ] `check:deps` clean per public package; `npm audit` 0 high. *(FR-13)*
9. [ ] Docs/README/CHANGELOG/CLAUDE.md reflect the monorepo + `@blendsdk/tui-core`. *(FR-15)*
