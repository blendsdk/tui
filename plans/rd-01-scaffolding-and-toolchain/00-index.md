# RD-01 Scaffolding & Toolchain Implementation Plan

> **Feature**: Stand up the `@blendsdk/tui` package skeleton — ESM/TypeScript build, test toolchain, linting, CI matrix, packaging, and the clean `src/engine/` foundation entry point — on a clean slate after archiving the Ink prototype.
> **Status**: Planning Complete
> **Created**: 2026-06-27
> **Implements**: RD-01
> **CodeOps Skills Version**: 2.0.0

## Overview

RD-01 is the foundation every other RD lands on. It does **not** ship runtime/UI
code; it produces a clean, typed, tree-shakeable **ESM-only** npm package named
`@blendsdk/tui` with **zero native runtime dependencies**, a `node:test`-based test
toolchain, ESLint + Prettier linting, and a GitHub Actions CI matrix
(ubuntu/macos/windows × Node 18/20/22) running the `verify` script.

Per the plan's Zero-Ambiguity Gate (PL-1), the existing Ink/React Turbo Vision
prototype is **archived and replaced by a clean slate**: `src/engine/` is created
fresh with a single public entry point (`index.ts`), and the prototype's reusable
primitives are (re)built in their owning RDs (RD-04/05/06) later, taking inspiration
from the archived sources rather than being migrated in place. This deliberately
supersedes RD-01's "primitives are migrated… not rewritten" Must-item; no RD-01
acceptance criterion depends on migration.

Because this environment is **not a git repository** and has no GitHub remote, the
plan initialises git and authors the CI workflow, but the actual 9-cell CI run
(AC-2) and the publish dry-run in CI (AC-7) are verified later once a remote exists
(PL-3). Everything else is verifiable locally via `npm run verify` and
`npm pack --dry-run`.

## Document Index

| #   | Document                                                   | Description                                          |
| --- | ---------------------------------------------------------- | ---------------------------------------------------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md)             | Zero-Ambiguity Gate decisions (audit trail)          |
| 00  | [Index](00-index.md)                                       | This document — overview and navigation              |
| 01  | [Requirements](01-requirements.md)                         | Feature requirements and scope                       |
| 02  | [Current State](02-current-state.md)                       | Analysis of the prototype to be archived             |
| 03  | [Package & Build](03-01-package-and-build.md)              | package.json identity, exports, tsconfig, engine entry |
| 03  | [Test & Lint Toolchain](03-02-test-and-lint-toolchain.md)  | `node:test` runner, ESLint + Prettier, scripts       |
| 03  | [CI & Release](03-03-ci-and-release.md)                    | GitHub Actions matrix, audit, dependency policy guard |
| 07  | [Testing Strategy](07-testing-strategy.md)                 | Specification test cases (ST-*) and verification     |
| 99  | [Execution Plan](99-execution-plan.md)                     | Phases, sessions, and task checklist                 |

## Quick Reference

### Usage Examples

After this plan, a consumer of a packed tarball can:

```ts
// ESM only — `require('@blendsdk/tui')` fails with a clear ESM error (AC-1)
import { VERSION } from '@blendsdk/tui';
console.log(VERSION); // "0.1.0"  (PL-6, PL-7)
```

And a contributor can:

```bash
npm run verify        # typecheck + test + build  (must exit 0)
npm run lint          # ESLint + Prettier check    (PL-2)
npm pack --dry-run    # shows dist/ + package.json + README + LICENSE only (AC-3)
```

### Key Decisions

| Decision                         | Outcome                                                      | Ref         |
| -------------------------------- | ----------------------------------------------------------- | ----------- |
| Prototype handling               | Clean slate; archive prototype, write `engine/` fresh        | PL-1        |
| Module format / name / license   | ESM-only · `@blendsdk/tui` · MIT                              | AR-6        |
| Node support                     | Active LTS 18 / 20 / 22                                       | AR-20       |
| Runtime dependencies             | Zero (pure-JS only if ever added; no native)                 | AR-2, AR-21 |
| Linter                           | ESLint + Prettier                                            | PL-2        |
| CI / release scope               | `git init` + CI matrix now; publish/changelog deferred       | PL-3        |
| `examples/` workspace            | Deferred to RD-03                                             | PL-4        |
| Public entry export              | `engine/index.ts` exports `VERSION`                          | PL-7        |
| Test invocation                  | `tsx --test` over `*.{spec,impl}.test.ts`                    | PL-8        |
| Start version                    | `0.1.0`                                                      | PL-6        |

## Related Files

**Created/replaced by this plan:**
- `package.json` (renamed to `@blendsdk/tui`, ESM packaging fields, scripts)
- `tsconfig.json` (strict, NodeNext, declaration + maps, no JSX)
- `eslint.config.js`, `.prettierrc.json`, `.prettierignore`
- `src/engine/index.ts` (public entry — exports `VERSION`)
- `src/engine/version.ts` (the `VERSION` constant)
- `src/engine/version.spec.test.ts`, `src/engine/packaging.spec.test.ts`
- `.github/workflows/ci.yml`
- `scripts/check-no-native-deps.mjs` (dependency-policy guard, AC-6)
- `LICENSE` (MIT), `README.md` (rewritten for the SDK), `.gitignore` (extended)

**Archived (moved out of the build):**
- `src/` (prototype) → `_archive/prototype-2026-06-27/src/`
- `dist/` (stale prototype build) → removed/regenerated
