# Monorepo Restructure — Implementation Plan

> **Feature**: Convert the single-package `@blendsdk/tui` repo into a yarn 1.x + Turborepo monorepo: all current code becomes `@blendsdk/tui-core`, examples become a private `@blendsdk/tui-examples` package, the test runner moves from `node:test` to vitest, and all public packages share one lockstep version.
> **Status**: Planning Complete
> **Created**: 2026-06-28
> **CodeOps Skills Version**: 2.0.0

## Overview

The foundation (RD-01…RD-10) currently ships as one package. This plan restructures
the repository into a **multi-package monorepo** without changing any runtime
behavior — the existing (migrated) test suite is the regression oracle that proves
the move preserved everything.

What changes:

- **Workspace**: a private root (`@blendsdk/tui-monorepo`) with yarn 1.x workspaces
  (`packages/*`) and Turborepo task orchestration. `package-lock.json` → `yarn.lock`.
- **`@blendsdk/tui-core`** (`packages/tui-core/`): the current `src/`, `bench/`, and
  the non-probe tests + fixtures. Renamed from `@blendsdk/tui`; `engines.node` `>=20`.
- **`@blendsdk/tui-examples`** (`packages/tui-examples/`, **private**): the
  `capability-probe` + `resize-demo` examples and the 15 probe test files, depending
  on `@blendsdk/tui-core` via the workspace.
- **vitest** replaces `node:test`/`tsx --test`: all assertions convert from
  `node:assert/strict` to `expect()` via a fixed, semantics-preserving mapping
  (AR-6); a separate vitest project runs the child-spawning `*.e2e.test.ts`.
- **Lockstep versions**: `scripts/sync-versions.mjs` writes the root `version` to
  every public package (skipping private ones) — new behavior, spec-tested first.
- **Shared config** at root (ESLint flat + Prettier + `tsconfig.base.json`); `docs/`
  and a single `CHANGELOG.md` stay at the root; the RD-09 acceptance gate moves to
  the root and orchestrates across packages.

Out of scope: any new functional package, a publish flow / Changesets (DEF-1/DEF-2),
and turbo remote caching (DEF-3).

## Document Index

| #   | Document | Description |
| --- | -------- | ----------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (audit trail) |
| 00  | [Index](00-index.md) | This document |
| 01  | [Requirements](01-requirements.md) | Feature requirements and scope |
| 02  | [Current State](02-current-state.md) | What exists today and what each piece becomes |
| 03-01 | [Workspace Foundation](03-01-workspace-foundation.md) | yarn workspaces, Turborepo, shared config, Node floor |
| 03-02 | [tui-core Package](03-02-tui-core-package.md) | Extract/rename the current package to `packages/tui-core` |
| 03-03 | [examples Package](03-03-examples-package.md) | Private `@blendsdk/tui-examples` + probe tests |
| 03-04 | [vitest Migration](03-04-vitest-migration.md) | node:test→vitest, assert→expect, e2e project |
| 03-05 | [Version Sync, Gate, CI & Docs](03-05-version-gate-ci-docs.md) | sync script, root gate, check:deps, CI, docs sync |
| 07  | [Testing Strategy](07-testing-strategy.md) | Specification test cases (ST-*) |
| 99  | [Execution Plan](99-execution-plan.md) | Phases, sessions, and task checklist |

## Quick Reference (target state)

```bash
yarn install                 # workspace install (yarn 1.x)
yarn turbo run verify        # typecheck + build + test across packages (cached)
yarn turbo run test          # vitest unit run per package
yarn workspace @blendsdk/tui-core test:e2e   # the separate e2e vitest project
yarn gate                    # root acceptance gate (core e2e + examples probe --auto)
yarn sync-versions           # write root version to all public packages
```

### Key Decisions

| Decision | Outcome | AR |
|----------|---------|----|
| Package manager | yarn 1.x workspaces | AR-3 |
| Orchestration | Turborepo | AR-4 |
| Test runner | vitest (Node 20+), assert→expect | AR-5, AR-6 |
| Node floor | drop 18 → `>=20`, CI 20/22/24 | AR-2 |
| Core package | `@blendsdk/tui-core` | AR-9 |
| examples | private `@blendsdk/tui-examples` | AR-10 |
| Versions | lockstep via root sync script | AR-8 |
| Gate | root, cross-package | AR-15 |

## Related Files

**New:** `package.json` (root), `turbo.json`, `tsconfig.base.json`, `yarn.lock`,
`packages/tui-core/**`, `packages/tui-examples/**`, `vitest.config.ts` (per package),
`scripts/sync-versions.mjs`, `test/sync-versions.spec.test.ts` (in root tooling).

**Moved:** `src/` → `packages/tui-core/src/`; non-probe `test/` + `bench/` →
`packages/tui-core/`; `examples/` + probe tests → `packages/tui-examples/`;
`scripts/gate.mjs` + `scripts/check-no-native-deps.mjs` → root (adapted).

**Deleted:** `package-lock.json`, `scripts/run-tests.mjs`, `tsconfig.examples.json`
(superseded by the examples package's own tsconfig).

**Updated:** `.github/workflows/ci.yml`, `README.md`, `CHANGELOG.md`, `CLAUDE.md`,
`docs/**`, `eslint.config.js`, `.gitignore`, `.prettierignore`.
