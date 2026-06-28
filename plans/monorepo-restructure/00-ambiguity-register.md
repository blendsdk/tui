# Ambiguity Register: Monorepo Restructure

> **Status**: ✅ GATE PASSED — all items resolved
> **Last Updated**: 2026-06-28

Decisions captured across four clarifying-question rounds on 2026-06-28. Items marked
★ were resolved with a recommended low-stakes default and are open to revision at
preflight. This is a **structural/refactor** plan — there is no source RD.

| #  | Category | Ambiguity / Gap | Options | Decision | Status |
|----|----------|-----------------|---------|----------|--------|
| 1  | Scope | Basis for the plan | RD-based / fresh | **Fresh structural plan; no source RD** | ✅ |
| 2  | Compatibility | Node floor (latest vitest needs Node 20+; Node 18 is EOL Apr 2025) | drop 18 / pin vitest 2.x | **Drop Node 18 → `engines.node` `>=20`; CI matrix 20/22/24; use latest vitest** | ✅ |
| 3  | Tooling | Package manager | yarn 1.x / npm / pnpm | **yarn 1.x workspaces; remove `package-lock.json`; root `private:true` + `workspaces:["packages/*"]`; commit `yarn.lock`** | ✅ |
| 4  | Tooling | Build/task orchestration | turbo / nx / scripts | **Turborepo: `turbo` dev dep + `turbo.json` pipeline (`build`→`typecheck`→`test`→`lint`→`check:deps`); `dist/**` outputs; `.turbo` cache gitignored** | ✅ |
| 5  | Testing | Test runner | vitest / keep node:test | **vitest (latest, Node 20+); replaces `node:test` + `tsx --test` + `scripts/run-tests.mjs` (deleted)** | ✅ |
| 6  | Testing | Assertion style in the 91-file migration | keep node:assert / convert to expect | **Convert `node:assert/strict` → vitest `expect()` via a FIXED semantics-preserving mapping (AR-6 table); expected values are UNCHANGED — a sanctioned syntax migration, not an oracle change** | ✅ |
| 7  | Testing | e2e (5 child-spawning tests) under vitest | separate project / standalone tsx | **Separate vitest project for `*.e2e.test.ts` (single-fork, no parallel, extended timeout); children still spawn via `tsx`; excluded from the default unit run** | ✅ |
| 8  | Versioning | Lockstep version enforcement | sync script / changesets | **Lightweight `scripts/sync-versions.mjs`; root `package.json#version` = source of truth; writes PUBLIC packages only (tui-core: its `package.json#version` AND `src/engine/version.ts`); skips private (examples, root). New behavior → spec-tested first** | ✅ |
| 9  | Structure | Disposition of the current package | — | **Move to `packages/tui-core`, rename `@blendsdk/tui` → `@blendsdk/tui-core`; holds `src/`, `bench/`, `test/` (minus probe tests), `test/fixtures/`; `exports`/`files`/`sideEffects:false`/`types` preserved** | ✅ |
| 10 | Structure | examples location | tui-core / root / own package | **Own private package `@blendsdk/tui-examples` (version-EXCLUDED): `capability-probe` + `resize-demo` + the 15 `probe-*`/`probe.e2e` tests + its own vitest; depends on `@blendsdk/tui-core` via `workspace`** | ✅ |
| 11 | Structure | bench location | tui-core / examples | **`packages/tui-core/bench/` — the perf-budget spec imports it intra-package; placing it in examples would make a tui-core test depend on examples (a cycle)** | ✅ |
| 12 | Docs | docs/ + CHANGELOG home | root / per-package | **`docs/` stays at repo root (monorepo architecture docs); single root `CHANGELOG.md` (lockstep version)** | ✅ |
| 13 | Tooling | ESLint/Prettier/TS config org | root-shared / per-package | **Root ESLint flat config + Prettier + `tsconfig.base.json`; each package `tsconfig.json` extends base with per-package `rootDir`/`outDir`** | ✅ |
| 14 | Scope | Plan boundary | restructure-only / + sample pkg / drop gate | **Restructure-only — no new functional package scaffolded (examples is relocated existing code); KEEP & ADAPT the RD-09 acceptance gate + `check:deps`** | ✅ |
| 15 | CI | Gate orchestration home (now spans 2 packages) | root / tui-core | **`scripts/gate.mjs` at repo ROOT; orchestrates across packages (tui-core e2e via vitest + examples `probe --auto`); `docs/acceptance-gate.md` stays at root** | ✅ |
| 16 | Security | Dependency-policy guard in the monorepo | root-all / per-package | **`scripts/check-no-native-deps.mjs` at root; scans each PUBLIC package's runtime deps (tui-core); turbo/vitest/esbuild/tsx are dev-only so it stays green** | ✅ |
| 17 | Convention | Future-package naming | — | **`@blendsdk/tui-<name>` under `packages/tui-<name>`; documented in CLAUDE.md** | ✅ |
| 18 ★ | Naming | Root private workspace package name | — | **`@blendsdk/tui-monorepo` (private)** | ✅ |
| 19 ★ | Tooling | Turbo cache scope | local / remote | **Local-only; `.turbo/` + `coverage/` gitignored** | ✅ |
| 20 | Docs | Rename ripple | — | **Update README install, CHANGELOG, docs, CLAUDE.md `@blendsdk/tui` → `@blendsdk/tui-core`; `install.e2e` packs `@blendsdk/tui-core`** | ✅ |
| 21 | Tooling | tsx retention | keep / drop | **Keep `tsx` (dev) for `bench`, examples, `probe`, and e2e child processes — NOT as the test runner** | ✅ |

### AR-6 — assert → expect mapping table (semantics-preserving)

> Expected values/relationships are **identical**; only the assertion syntax changes.
> `node:assert/strict` semantics are strict (`===` / deep-strict), which map cleanly.

| `node:assert/strict` | vitest `expect` | Count | Notes |
|----------------------|-----------------|-------|-------|
| `assert.equal(a, b)` | `expect(a).toBe(b)` | 692 | strict `===`/`Object.is` = `toBe` |
| `assert.ok(x)` | `expect(x).toBeTruthy()` | 210 | message arg dropped (vitest shows the expr) |
| `assert.deepEqual(a, b)` | `expect(a).toStrictEqual(b)` | 92 | deep-strict = `toStrictEqual` |
| `assert.notEqual(a, b)` | `expect(a).not.toBe(b)` | 18 | |
| `assert.match(s, re)` | `expect(s).toMatch(re)` | 15 | |
| `assert.throws(fn[, m])` | `expect(fn).toThrow([m])` | 14 | error-class/regex matcher preserved per-site |
| `assert.doesNotThrow(fn)` | `expect(fn).not.toThrow()` | 13 | |
| `assert.fail(msg)` | `expect.unreachable(msg)` | 2 | hand-converted |
| `assert.notDeepEqual(a, b)` | `expect(a).not.toStrictEqual(b)` | 1 | |

The 692+210+92+18+15+1 = 1028 simple cases are scriptable; the 14 `throws` + 13
`doesNotThrow` + 2 `fail` = 29 matcher-bearing cases are converted and **hand-verified**
to preserve the exact error class/regex. Zero bare `assert(...)` calls exist.

### Runtime decisions (during execution)

| #  | Category | Ambiguity / Gap | Decision | Status |
|----|----------|-----------------|----------|--------|
| 22 (runtime) | Testing | `toolchain.spec` ST-12 tests the deleted `run-tests.mjs` custom runner (its subject is removed by AR-5) | **Remove ST-12** (and its now-unused `childEnv` helper); vitest owns discovery, self-evidently proven by the full suite it finds. Not a weakened oracle — the tested component is intentionally gone. (User-confirmed.) ST-8/ST-11 in the same file are retargeted to the new toolchain in Phases 3/5. | ✅ |
| 23 (runtime) | Testing | Governance tests (gate/docs-presence/api-stability/check-deps/toolchain) moved into `packages/tui-core/test/` but read MONOREPO-ROOT artifacts (scripts, ci.yml, docs, root CHANGELOG/README); "repoRoot" is now ambiguous | **Keep them in tui-core; reference monorepo root explicitly via `resolve(here, '../../..')`** (package-local refs like packaging.spec's own package.json keep `resolve(here, '..')`). Low-churn, keeps the suite green. Extracting them to a dedicated root governance-test project is **DEF-4** (future cleanup). | ✅ |
| 24 (runtime) | Compatibility | `packaging.spec` ST-5 hardcodes `engines.node === '>=18'`, but AR-2 raised the floor to `>=20` | **Update the ST-5 expectation to `'>=20'`** — the contract legitimately changed by the user-approved AR-2 (Node-18 drop), not a weakened oracle. | ✅ |

### Deferrals (DEF-n)

- **DEF-1** — Changesets / automated release + per-package CHANGELOG: deferred until a real publish flow is wired (the sync script + single root CHANGELOG suffice now). [AR-8, AR-12]
- **DEF-2** — npm publish (with provenance) of `@blendsdk/tui-core`: out of scope here; remains RD-10 DEF-1. [AR-14]
- **DEF-3** — Turbo remote caching: local-only now; revisit if CI cache sharing is wanted. [AR-19]
- ~~**DEF-4** — Extract the monorepo-governance tests into a dedicated root governance-test project, removing the `../../..` root reach.~~ **✅ RESOLVED (lightweight):** the `../../..` reach is centralized in a single `packages/tui-core/test/monorepo-root.ts` helper (`monorepoRoot`/`repoPath`) imported by all six governance specs. A full root-level test project was assessed and rejected — moving to another `packages/*` dir keeps the same depth, and a non-turbo root vitest path + splitting the mixed `toolchain.spec` add complexity for cosmetic gain. [AR-23]

### Resolution notes

**AR-6 (oracle integrity):** The 50 `*.spec.test.ts` files are immutable oracles. Converting
`assert.equal(x, 3)` → `expect(x).toBe(3)` changes *syntax*, never the *expected value*. The
mapping table is fixed and the matcher-bearing cases are hand-verified, so no oracle is weakened.
A spec test that fails post-migration means the conversion was wrong (fix the conversion), never
that the expectation should move.

**AR-8 (version sync):** `src/engine/version.ts` hardcodes `VERSION` and a spec asserts it equals
`package.json#version`; the sync script therefore updates both, keeping that spec green.

**AR-14 (scope):** "Restructure-only" means behavior is preserved and proven by the migrated
existing test suite (the regression oracle). The only genuinely NEW behavior is the version-sync
script, which gets its own spec test first.
