# Requirements: RD-01 Scaffolding & Toolchain

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-01](../../requirements/RD-01-scaffolding-and-toolchain.md)

## Feature Overview

Establish the project skeleton for `@blendsdk/tui`: a clean, typed, tree-shakeable
**ESM-only** TypeScript library with **zero native runtime dependencies**, a
`node:test` toolchain, ESLint + Prettier linting, a GitHub Actions CI matrix, and a
single public entry point at `src/engine/index.ts`. Per plan decision **PL-1**, the
existing Ink/React prototype is archived and `src/engine/` is built on a clean slate
(reusable primitives are written fresh in later RDs, inspired by the archived
sources). This RD ships **no runtime/UI code** beyond a minimal `VERSION` export
(PL-7) that proves the package resolves and types.

## Functional Requirements

### Must Have
- [ ] npm package named **`@blendsdk/tui`**, `"type": "module"` (ESM-only), license **MIT**, version **`0.1.0`** (AR-6, PL-6).
- [ ] TypeScript with `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`; compiles to ESM via `module`/`moduleResolution` **NodeNext** (AR-2).
- [ ] Foundation-first layout under `src/engine/` with a single public entry point `src/engine/index.ts`; files target 200–500 lines (AR-2).
- [ ] Ship type declarations (`.d.ts`) **and** source maps in the published package (AR-20).
- [ ] Dev runner **`tsx`** for running TS directly; build via **`tsc`** to `dist/`.
- [ ] Test runner **`node:test` + `node:assert`**; spec vs impl test files separated (`*.spec.test.ts`, `*.impl.test.ts`); invoked via `tsx --test` (PL-8).
- [ ] Scripts: `build`, `typecheck`, `test`, `lint`, `verify` (= typecheck + test + build).
- [ ] CI matrix on **ubuntu-latest, macos-latest, windows-latest** running `verify` on Node **18, 20, 22** (PL-3 — authored now; cells run once a remote exists).
- [ ] `engines.node >= 18`; `package.json` `exports` map; `sideEffects: false`; `files` allowlist (AR-20).
- [ ] Clean slate per **PL-1**: archive the prototype to `_archive/prototype-2026-06-27/`; create `src/engine/index.ts` exporting `VERSION` (PL-7). (Supersedes RD-01's "primitives are migrated… not rewritten" Must-item — see PL-1.)

### Should Have
- [ ] Linting/formatting via **ESLint + Prettier**, enforced in CI (PL-2).

### Won't Have (Out of Scope)
- Dual ESM+CJS output — **ESM-only** (AR-6).
- `npm publish` with provenance + automated changelog — **deferred** to a later release milestone (PL-3).
- An `examples/` workspace — **deferred to RD-03** (PL-4).
- Migrating prototype primitives in place — **superseded** by the clean-slate decision (PL-1); primitives are written fresh in RD-04/05/06.
- Monorepo/workspaces tooling beyond a single package.
- Any runtime/UI code beyond the `VERSION` export (covered by RD-02…RD-08).

## Technical Requirements

### Performance
- No runtime perf budget at this layer (RD-25/AR-25 budgets apply to RD-04+). CI `verify` should complete well within a single GitHub Actions job timeout.

### Compatibility
- Cross-platform parity is a MUST: the package must install and `verify` identically on Linux, macOS, Windows (AR-4) — authored now, the macOS/Windows cells verified once a remote exists (PL-3).
- Node active-LTS 18/20/22 (AR-20).
- Pure-JS, no native install steps: a clean install must run no `node-gyp` (AR-2, AR-21, AC-4).

### Security
- **Supply chain**: any future runtime dep must be pure-JS and MIT-compatible; CI runs `npm audit` (AR-21). A dependency-policy guard (`scripts/check-no-native-deps.mjs`) fails the build if a runtime dependency declares native install steps (AC-6).
- **No secrets in repo**: CI must not embed secrets; publish (deferred) will use provenance/OIDC, no long-lived tokens (AR-21).
- No runtime input is handled at this layer; downstream RDs own ANSI/control sanitization.

## Scope Decisions

| Decision                       | Options Considered                         | Chosen                                   | Rationale                                                        | AR Ref            |
| ------------------------------ | ------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------- | ----------------- |
| Prototype handling             | migrate / relocate now / clean slate       | Clean slate (archive + fresh `engine/`)  | User wants a fresh start; archived sources are inspiration only  | PL-1 (overrides RD-01 migrate item) |
| Module format                  | ESM-only / ESM+CJS                         | ESM-only                                 | User decision                                                   | AR-6              |
| Package name / license         | several / various                          | `@blendsdk/tui` · MIT                     | User decision                                                   | AR-6              |
| Start version                  | 0.1.0 / 1.0.0                              | 0.1.0                                    | API not yet frozen during foundation build-out                  | PL-6 (AR-22)      |
| Node support                   | 18 only / 18+20+22                          | Active LTS 18/20/22                       | Enterprise reach                                               | AR-20             |
| Runtime deps                   | allow native / pure-JS only                | Pure-JS, ~zero                           | Portability across all OSes                                     | AR-2, AR-21       |
| Linter                         | ESLint + Prettier / Biome / defer          | ESLint + Prettier                        | User decision                                                   | PL-2              |
| CI OS matrix                   | Linux only / 3-OS                          | ubuntu + macos + windows                  | Cross-platform is a MUST                                       | AR-4, AR-23       |
| CI / release scope             | CI only / CI + full release / local only   | git init + CI matrix; defer publish      | No remote yet; publish unverifiable here                        | PL-3              |
| `examples/` workspace          | now / defer                                | Defer to RD-03                            | Probe harness + demos belong to RD-03                          | PL-4              |
| Public entry export            | `VERSION` const / empty module             | Export `VERSION`                         | AC-1 needs a real importable symbol                            | PL-7              |
| Test invocation                | `tsx --test` / compile-then-`node --test`  | `tsx --test`                             | Matches RD-01 toolchain + existing working pattern             | PL-8              |

> **Traceability:** Every scope decision references the Ambiguity Register entry (`AR #` for requirements-level, `PL-#` for plan-level) that resolved it. See [`00-ambiguity-register.md`](00-ambiguity-register.md).

## Acceptance Criteria

> Mirrors RD-01's acceptance criteria, annotated with this plan's verification boundary (PL-3).

1. [ ] **(AC-1)** `npm install` of a packed tarball exposes `import { VERSION } from '@blendsdk/tui'` resolving via the `exports` map, with `.d.ts` types present; `require('@blendsdk/tui')` is **not** supported (ESM-only) and fails with a clear ESM error. *(Verifiable locally via pack+install e2e.)*
2. [ ] **(AC-2)** `npm run verify` (typecheck + test + build) exits 0 on ubuntu-latest, macos-latest, and windows-latest for Node 18, 20, 22 (9 CI cells green). *(Authored now; cells run once a remote exists — PL-3.)*
3. [ ] **(AC-3)** The published package contains only `dist/` (JS + `.d.ts` + maps), `package.json`, `README`, `LICENSE` (MIT) — verified via `npm pack --dry-run`; no `src/`, tests, or `node_modules`. *(Verifiable locally.)*
4. [ ] **(AC-4)** `package.json` declares `"type":"module"`, `"sideEffects":false`, `"engines":{"node":">=18"}`, an `exports` map, and zero `dependencies` with native install steps (a clean install runs no `node-gyp`). *(Verifiable locally.)*
5. [ ] **(AC-5)** Boundary: a build with an unused import/variable/parameter fails `typecheck` (proves `noUnused*` is enforced). *(Verifiable locally.)*
6. [ ] **(AC-6)** Negative: adding a runtime dependency that requires native compilation fails the dependency-policy check (`scripts/check-no-native-deps.mjs`). *(Verifiable locally.)*
7. [ ] **(AC-7)** Security: CI runs `npm audit` (or equivalent) and a publish dry-run uses provenance with no embedded secrets. *(`npm audit` runnable locally; the CI + publish-dry-run half is authored now, verified once a remote exists — PL-3.)*
8. [ ] All specification tests (ST-*) pass; `npm run verify` exits 0 locally; no dead code; register fully traced.
