# Execution Plan: Monorepo Restructure

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-06-28 (Phase 1 complete)
> **Progress**: 3/28 tasks (11%)
> **CodeOps Skills Version**: 2.0.0

## Overview

Convert the single `@blendsdk/tui` package into a yarn 1.x + Turborepo monorepo
(`@blendsdk/tui-core` + private `@blendsdk/tui-examples`), migrate the runner to
vitest, and enforce lockstep versions — **preserving all behavior**. The migrated
existing suite is the regression oracle; the only spec-first new behavior is the
version-sync script. Each phase ends green and is committed (via /gitcm).

> **Sequencing rationale:** the riskiest change (the 1,056-assertion vitest migration)
> is done **in place** (Phase 2) BEFORE the package move (Phase 3), so a test failure
> is unambiguously a conversion bug, not a path/move artifact.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Est. Time |
| ----- | ----- | --------- |
| 1 | Package-manager swap (npm → yarn 1.x) | 30–45 min |
| 2 | vitest migration in place (assert→expect, e2e project) | 150–210 min |
| 3 | Workspace + Turborepo + `@blendsdk/tui-core` move | 120–150 min |
| 4 | `@blendsdk/tui-examples` package + probe tests | 90–120 min |
| 5 | Version sync (spec-first) + root gate + CI + docs | 120–150 min |

**Total: ~8.5–11.5 hours**

---

## Phase 1: Package-Manager Swap
**Reference**: [03-01](03-01-workspace-foundation.md) · AR-3

| # | Task | File |
|---|------|------|
| 1.1.1 | Record the green baseline (run current `verify` + `gate`; note pass counts as the regression target) | — |
| 1.1.2 | Remove `package-lock.json`; `yarn install` → commit `yarn.lock` | `yarn.lock` |
| 1.1.3 | Confirm `yarn verify` + `yarn gate` still green (scripts still node:test; internal `npm run` chains untouched until Phase 3) | — |

**Verify**: `yarn verify && yarn gate` green; commit via /gitcm.

---

## Phase 2: vitest Migration (in place)
**Reference**: [03-04](03-04-vitest-migration.md) · AR-5, AR-6, AR-7

### Session 2.1: Tooling + conversion
| # | Task | File |
|---|------|------|
| 2.1.1 | Add `vitest` dev dep; write `vitest.config.ts` (unit + e2e projects, AR-7) | `vitest.config.ts`, `package.json` |
| 2.1.2 | Write the throwaway assert→expect codemod (AR-6 simple cases); dry-run + diff-review on a copy | `scripts/_codemod-asserts.mjs` (temp) |
| 2.1.3 | Run the codemod (1,028 simple calls); swap runner imports `node:test`→`vitest` across all 91 files; remove `node:assert` imports | `test/**/*.test.ts` |
| 2.1.4 | Hand-convert the 29 matcher cases (`throws`/`doesNotThrow`/`fail`), preserving each error class/regex/message | `test/**` (targeted) |
| 2.1.5 | Delete `scripts/run-tests.mjs`; point `test`/`test:e2e` scripts at vitest projects | `package.json` |

### Session 2.2: Green + harden
| # | Task | File |
|---|------|------|
| 2.2.1 | Run the vitest **unit** project — confirm ALL pass with UNCHANGED expectations (ST-2); fix conversions, never expectations | — |
| 2.2.2 | Run the vitest **e2e** project — adapt `tsx`-spawn/`repoRoot` as needed; green on POSIX (ST-6) | `test/*.e2e.test.ts` |
| 2.2.3 | Delete the temp codemod; full `yarn verify` (typecheck+build+vitest) + lint green | — |

**Verify**: vitest unit + e2e green, lint clean; commit via /gitcm.

---

## Phase 3: Workspace + Turborepo + `@blendsdk/tui-core`
**Reference**: [03-01](03-01-workspace-foundation.md), [03-02](03-02-tui-core-package.md) · AR-2, AR-4, AR-9, AR-13

### Session 3.1: Root scaffolding
| # | Task | File |
|---|------|------|
| 3.1.1 | Create `tsconfig.base.json` (compiler options from `tsconfig.json`); private root `package.json` (name `@blendsdk/tui-monorepo`, `workspaces`, `engines>=20`, turbo scripts); `turbo.json`; update `.gitignore`/`.prettierignore` (`.turbo`, `coverage`) | root configs |
| 3.1.2 | Add `turbo` dev dep at root | `package.json` |

### Session 3.2: Move tui-core
| # | Task | File |
|---|------|------|
| 3.2.1 | History-preserving move: `src/`, `bench/`, the 76 non-probe `test/**` + `fixtures/` + helpers → `packages/tui-core/` | `packages/tui-core/**` |
| 3.2.2 | Write `packages/tui-core/package.json` (`@blendsdk/tui-core`, `engines>=20`, exports/files/sideEffects/types preserved, scripts, devDeps) + `tsconfig.json` (extends base); move `vitest.config.ts` in; add package `README.md` | `packages/tui-core/**` |
| 3.2.3 | Rewrite root scripts to `turbo run`; per-package `check:deps` calls `../../scripts/...` (script not yet moved → temp path or defer to Phase 5) | `package.json` |

### Session 3.3: Verify
| # | Task | File |
|---|------|------|
| 3.3.1 | `yarn install`; `yarn turbo run verify` green; packaging + treeshake + perf specs green against the new `dist/engine/index.js` (ST-3, ST-4) | — |
| 3.3.2 | Lint clean; full verify | — |

**Verify**: `yarn turbo run verify` green, lint clean; commit via /gitcm.

---

## Phase 4: `@blendsdk/tui-examples`
**Reference**: [03-03](03-03-examples-package.md) · AR-10, AR-7

### Session 4.1: Create + move
| # | Task | File |
|---|------|------|
| 4.1.1 | Create `packages/tui-examples/` (`package.json` `private:true`, workspace dep on `@blendsdk/tui-core`, `tsconfig.json` noEmit, `vitest.config.ts`) | `packages/tui-examples/**` |
| 4.1.2 | History-preserving move: `examples/{capability-probe,resize-demo}` + the 15 `probe-*`/`probe.e2e` test files → `packages/tui-examples/`; delete `tsconfig.examples.json` | `packages/tui-examples/**` |
| 4.1.3 | Rewrite engine imports in probe tests + examples to `@blendsdk/tui-core`; harness imports intra-package; rebase `probe.e2e` `repoRoot`/tsx-bin | `packages/tui-examples/**` |

### Session 4.2: Verify
| # | Task | File |
|---|------|------|
| 4.2.1 | `yarn install`; `yarn turbo run verify`; examples unit + `probe.e2e` green (ST-6); lint clean | — |

**Verify**: `yarn turbo run verify` green; commit via /gitcm.

---

## Phase 5: Version Sync, Gate, CI & Docs
**Reference**: [03-05](03-05-version-gate-ci-docs.md) · AR-8, AR-15, AR-16, AR-2, AR-12, AR-20

### Session 5.1: Version sync (spec-first)
| # | Task | File |
|---|------|------|
| 5.1.1 | Write `sync-versions.spec.test.ts` (ST-5: public→root version, private skipped, `--check`) — confirm RED | `test/sync-versions.spec.test.ts` |
| 5.1.2 | Implement `scripts/sync-versions.mjs` (+ `--check`); updates public `package.json#version` and tui-core `version.ts`; GREEN | `scripts/sync-versions.mjs` |
| 5.1.3 | Wire the root `sync-versions` script; run it; the `VERSION === package.json#version` spec stays green | `package.json` |

### Session 5.2: Gate + guards
| # | Task | File |
|---|------|------|
| 5.2.1 | Move `scripts/gate.mjs` → root; rewrite steps to workspace commands + `sync-versions --check`; update `gate.spec` + `docs/acceptance-gate.md` | `scripts/gate.mjs`, `docs/acceptance-gate.md` |
| 5.2.2 | Move `scripts/check-no-native-deps.mjs` → root; finalize per-package `check:deps`; green (ST-8) | `scripts/check-no-native-deps.mjs` |

### Session 5.3: CI + docs
| # | Task | File |
|---|------|------|
| 5.3.1 | Rewrite CI: `yarn install --frozen-lockfile` + `turbo run`, Node 20/22/24, POSIX e2e, informational bench cell, yarn audit, pack | `.github/workflows/ci.yml` |
| 5.3.2 | Docs sync: README install → `@blendsdk/tui-core` + yarn/turbo commands; root `CHANGELOG.md` Unreleased entry; `docs/` monorepo note + restructure ADR; CLAUDE.md (toolchain, structure, `@blendsdk/tui-<name>` convention) | docs |
| 5.3.3 | Final: `yarn turbo run verify && yarn gate && yarn lint && yarn workspace @blendsdk/tui-core bench` + audit all green | — |

**Verify**: `yarn turbo run verify && yarn gate && yarn lint`; commit via /gitcm.

---

## 🚨 Master Progress Checklist — MANDATORY

> Update immediately after each task: `- [x] N.N.N … ✅ (completed: YYYY-MM-DD)`, bump the Progress header.

### Phase 1: Package-Manager Swap
- [x] 1.1.1 Record green baseline (verify + gate pass counts) ✅ (verify 522/522) (completed: 2026-06-28)
- [x] 1.1.2 Remove package-lock; yarn install → yarn.lock ✅ (completed: 2026-06-28)
- [x] 1.1.3 Confirm yarn verify + gate green ✅ (verify 522/522, gate PASSED) (completed: 2026-06-28)

### Phase 2: vitest Migration
- [ ] 2.1.1 vitest dep + config (unit + e2e projects)
- [ ] 2.1.2 codemod written + dry-run reviewed
- [ ] 2.1.3 codemod run + runner-import swap (91 files)
- [ ] 2.1.4 hand-convert 29 matcher cases
- [ ] 2.1.5 delete run-tests.mjs; vitest test scripts
- [ ] 2.2.1 unit project green, expectations unchanged (ST-2)
- [ ] 2.2.2 e2e project green on POSIX (ST-6)
- [ ] 2.2.3 delete codemod; full verify + lint

### Phase 3: Workspace + Turbo + tui-core
- [ ] 3.1.1 tsconfig.base + root private package.json + turbo.json + ignores
- [ ] 3.1.2 add turbo dev dep
- [ ] 3.2.1 move src/bench/non-probe-test/fixtures → packages/tui-core
- [ ] 3.2.2 tui-core package.json + tsconfig + vitest config + README
- [ ] 3.2.3 root scripts → turbo run
- [ ] 3.3.1 turbo verify green; packaging/treeshake/perf green (ST-3, ST-4)
- [ ] 3.3.2 lint clean; full verify

### Phase 4: tui-examples
- [ ] 4.1.1 create tui-examples (private, workspace dep, configs)
- [ ] 4.1.2 move examples + 15 probe tests; delete tsconfig.examples.json
- [ ] 4.1.3 rewrite imports → @blendsdk/tui-core; rebase probe.e2e
- [ ] 4.2.1 turbo verify + probe.e2e green (ST-6); lint

### Phase 5: Version Sync, Gate, CI & Docs
- [ ] 5.1.1 sync-versions spec (ST-5) — red
- [ ] 5.1.2 implement sync-versions.mjs (+ --check) — green
- [ ] 5.1.3 wire sync-versions; VERSION spec green
- [ ] 5.2.1 root gate.mjs cross-package; gate.spec + acceptance-gate.md
- [ ] 5.2.2 root check-no-native-deps; per-package check:deps (ST-8)
- [ ] 5.3.1 CI rewrite (yarn + turbo, 20/22/24)
- [ ] 5.3.2 docs sync (README/CHANGELOG/docs/CLAUDE.md)
- [ ] 5.3.3 final verify + gate + lint + audit + bench (ST-7)

---

## Dependencies

```
Phase 1 (yarn) → Phase 2 (vitest in place) → Phase 3 (workspace + tui-core move)
              → Phase 4 (examples package) → Phase 5 (version sync + gate + CI + docs)
```
vitest-before-move (Phase 2 before 3) is deliberate (de-risks the assertion migration).
Phases 3→4 are ordered (examples depends on tui-core). Phase 5 wires the cross-package
glue last.

## Success Criteria

1. ✅ `yarn install` resolves the workspace; `yarn.lock` committed; no `package-lock.json`
2. ✅ All tests under vitest; no `*.spec.test.ts` expected value changed (AR-6)
3. ✅ `packages/tui-core` = `@blendsdk/tui-core` (`engines>=20`); `packages/tui-examples` private
4. ✅ `yarn turbo run verify` + `yarn gate` green; CI green on 20/22/24
5. ✅ `yarn sync-versions` enforces lockstep (public only); VERSION spec green
6. ✅ `check:deps` + audit clean per public package
7. ✅ Docs/README/CHANGELOG/CLAUDE.md reflect the monorepo + `@blendsdk/tui-core`
8. ✅ Deferred recorded: DEF-1 changesets/release · DEF-2 publish+provenance · DEF-3 turbo remote cache
