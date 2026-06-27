# Execution Plan: RD-01 Scaffolding & Toolchain

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-06-27 11:20
> **Progress**: 12/20 tasks (60%)
> **CodeOps Skills Version**: 2.0.0

## Overview

Stand up the `@blendsdk/tui` package on a clean slate: archive the Ink prototype,
init git, then build the package/build config, the test/lint/CI toolchain, and the
packaging e2e — each feature phase following the mandatory **spec tests → red →
implement → green → impl tests → verify** ordering.

**🚨 Update this document after EACH completed task!**

Verify command (local): `npm run verify` (typecheck + test + build). Lint: `npm run lint`.
Commits: use **/gitcm** (or **/gitcmp**) per the exec_plan skill — this plan contains no raw git commands.

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
| ----- | ----- | -------- | --------- |
| 0 | Prerequisites: clean slate & git init | 1 | 20 min |
| 1 | Package, build & public entry | 3 | 90 min |
| 2 | Toolchain: test/lint/CI & dependency guard | 3 | 120 min |
| 3 | Packaging e2e & finalization | 3 | 70 min |

**Total: ~10 sessions, ~5–5.5 hours**

---

## Phase 0: Prerequisites — Clean Slate & Git Init

> Structural/mechanical setup (no feature logic → no spec tests). Decisions: PL-1, PL-5, PL-3.

### Session 0.1: Archive prototype and initialise repo

**Reference**: [03-01](03-01-package-and-build.md) (archive step), [03-03](03-03-ci-and-release.md) (git init)
**Objective**: A clean working tree with the prototype archived and git ready.

| #     | Task | File / Path |
| ----- | ---- | ----------- |
| 0.1.1 | `git init` (env is not yet a git repo) | repo root |
| 0.1.2 | Move prototype `src/` → `_archive/prototype-2026-06-27/src/`; delete stale `dist/`. Leave `_archive/turbo-hello-clone-v1-2026-06-26.tar.gz` untouched (PL-5) | `src/`, `dist/`, `_archive/` |
| 0.1.3 | Create empty `src/engine/` directory (entry files added in Phase 1) | `src/engine/` |

**Deliverables**:
- [x] Git repo initialised (already present — `.git` existed; `git init` idempotent)
- [x] Prototype browsable under `_archive/prototype-2026-06-27/`; no prototype code under `src/`
- [x] Commit (49bae66 — plain commit; `/gitcm` not available this session)

**Verify**: working tree clean; `ls src/` shows only `engine/`.

---

## Phase 1: Package, Build & Public Entry

> Feature phase — spec-first ordering. Refs: [03-01](03-01-package-and-build.md), ST-1…ST-7.

### Session 1.1: Specification Tests (BEFORE implementation)

| #     | Task | File |
| ----- | ---- | ---- |
| 1.1.1 | Write packaging spec tests for ST-1…ST-7 (VERSION export/equality, `npm pack --dry-run --json` file set, `package.json` fields, `exports` ESM-only, build output `.d.ts`). MUST NOT read implementation. | `src/engine/packaging.spec.test.ts` |
| 1.1.2 | Run spec tests — verify they FAIL (red). ST-3/ST-7 fail because no build/fields exist yet; document each. | — |

### Session 1.2: Implementation

| #     | Task | File |
| ----- | ---- | ---- |
| 1.2.1 | Replace `package.json` (name `@blendsdk/tui`, v0.1.0 PL-6, ESM, `exports`/`files`/`sideEffects`, scripts PL-2/PL-8, remove ink/react + bin); replace `tsconfig.json` (strict NodeNext, `declaration`+maps, no JSX); create `LICENSE` (MIT); create `src/engine/version.ts` + `src/engine/index.ts` (exports `VERSION` PL-7). Remove ink/react/@types/react, add no runtime deps. | `package.json`, `tsconfig.json`, `LICENSE`, `src/engine/version.ts`, `src/engine/index.ts` |
| 1.2.2 | `npm install` (refresh lockfile), `npm run build`, run spec tests — verify they PASS (green). If any spec test fails: fix the implementation, never the test. | — |

### Session 1.3: Implementation Tests & Hardening

| #     | Task | File |
| ----- | ---- | ---- |
| 1.3.1 | Write impl tests: `VERSION` matches `X.Y.Z` SemVer shape (ST overflow / internals) | `src/engine/version.impl.test.ts` |
| 1.3.2 | `npm run verify` exits 0 locally | — |

**Deliverables**:
- [x] `import { VERSION } from '@blendsdk/tui'` works post-build; `.d.ts` present (AC-1)
- [x] `npm pack --dry-run` shows only `dist/` + `package.json` + `README` + `LICENSE` (AC-3)
- [x] Zero runtime `dependencies` (AC-4); commit via /gitcm (committed at phase boundary below)

**Verify**: `npm run verify`

---

## Phase 2: Toolchain — Test/Lint/CI & Dependency Guard

> Feature phase — spec-first ordering. Refs: [03-02](03-02-test-and-lint-toolchain.md), [03-03](03-03-ci-and-release.md), ST-8…ST-12.

### Session 2.1: Specification Tests (BEFORE implementation)

| #     | Task | File |
| ----- | ---- | ---- |
| 2.1.1 | Write toolchain spec tests for ST-8…ST-12 (unused-import fails `tsc`; `check-no-native-deps` passes empty / fails native fixture; CI YAML contains the 3 OS × 3 Node + `npm run verify`; runner discovers both globs). MUST NOT read implementation. | `src/engine/toolchain.spec.test.ts` |
| 2.1.2 | Run spec tests — verify they FAIL (red): guard script + workflow + lint config absent. Document each. | — |

### Session 2.2: Implementation

| #     | Task | File |
| ----- | ---- | ---- |
| 2.2.1 | Add ESLint flat config + Prettier config/ignore (PL-2); add `lint`/`lint:fix`/`check:deps` scripts; write `scripts/check-no-native-deps.mjs` (AC-6); write `.github/workflows/ci.yml` (3 OS × 3 Node, lint/verify/check:deps/audit/pack steps — PL-3/AR-4/AR-23) | `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `scripts/check-no-native-deps.mjs`, `.github/workflows/ci.yml`, `package.json` |
| 2.2.2 | Run spec tests — verify they PASS (green). Fix implementation, not tests. | — |

### Session 2.3: Implementation Tests & Hardening

| #     | Task | File |
| ----- | ---- | ---- |
| 2.3.1 | Write impl tests for the dependency guard edge cases (missing `dependencies` key; benign `postinstall`; `os`/`cpu` constraints) | `src/engine/check-deps.impl.test.ts` |
| 2.3.2 | `npm run lint` clean; `npm run check:deps` exits 0; `npm run verify` exits 0 | — |

**Deliverables**:
- [ ] ESLint + Prettier enforced; `npm run lint` clean (PL-2)
- [ ] `check:deps` guard works (AC-6); CI workflow authored (AC-2 deferred-to-remote)
- [ ] commit via /gitcm

**Verify**: `npm run lint && npm run check:deps && npm run verify`

---

## Phase 3: Packaging e2e & Finalization

> Feature phase — spec-first for e2e. Refs: [07-testing-strategy.md](07-testing-strategy.md) ST-13/ST-14.

### Session 3.1: Specification Tests (BEFORE implementation)

| #     | Task | File |
| ----- | ---- | ---- |
| 3.1.1 | Write packaging e2e spec test for ST-13/ST-14 (pack → install into temp dir → ESM `import` resolves with `.d.ts`; CJS `require` throws ESM error). | `test/install.e2e.test.ts` |
| 3.1.2 | Run e2e spec test — verify it FAILS (red) if the tarball/exports are not yet correct. | — |

### Session 3.2: Implementation / Validation

| #     | Task | File |
| ----- | ---- | ---- |
| 3.2.1 | Rewrite `README.md` for the SDK (install, ESM-only note, `verify`/`lint`/`pack` usage); confirm `LICENSE` + `files` allowlist. | `README.md` |
| 3.2.2 | Run the e2e spec test — verify it PASSES (green): ESM import works, CJS require fails as expected. | — |

### Session 3.3: Final Verification

| #     | Task | File |
| ----- | ---- | ---- |
| 3.3.1 | Full gate: `npm run verify`, `npm run lint`, `npm run check:deps`, `npm audit`, `npm pack --dry-run`. Record AC-2 and AC-7(CI half) as **deferred-to-remote** (PL-3) in the register/notes. Final commit via /gitcm (or /gitcmp once a remote exists). | — |

**Deliverables**:
- [ ] e2e import/require behaviour verified (AC-1)
- [ ] README/LICENSE finalized; `npm audit` clean (AC-7 local)
- [ ] AC-2 / AC-7(CI) explicitly marked deferred-to-remote
- [ ] commit via /gitcm

**Verify**: `npm run verify && npm run lint && npm run check:deps && npm audit`

---

## 🚨 Master Progress Checklist (All Phases) — MANDATORY

> **⚠️ EXECUTION RULE:** Single source of truth for progress. After each task mark it
> `[x]` with a timestamp, update the Progress header, never batch updates. If missing,
> reconstruct from the phase details above before executing.

### Phase 0: Prerequisites — Clean Slate & Git Init
- [x] 0.1.1 `git init` (2026-06-27 — already initialised; `.git` present)
- [x] 0.1.2 Archive prototype `src/` → `_archive/prototype-2026-06-27/`; remove `dist/` (2026-06-27)
- [x] 0.1.3 Create empty `src/engine/` (2026-06-27)

### Phase 1: Package, Build & Public Entry
- [x] 1.1.1 Write packaging spec tests (ST-1…ST-7) (2026-06-27)
- [x] 1.1.2 Red phase — spec tests fail (2026-06-27: ERR_MODULE_NOT_FOUND on ./index.js — entry/build/fields absent)
- [x] 1.2.1 Implement package.json/tsconfig/LICENSE/engine entry + VERSION (2026-06-27)
- [x] 1.2.2 Green phase — spec tests pass (2026-06-27: 7/7 ST pass after build)
- [x] 1.3.1 Write version impl tests (2026-06-27)
- [x] 1.3.2 `npm run verify` exits 0 (2026-06-27: typecheck + 9 tests + build all green)

### Phase 2: Toolchain — Test/Lint/CI & Dependency Guard
- [ ] 2.1.1 Write toolchain spec tests (ST-8…ST-12)
- [ ] 2.1.2 Red phase — spec tests fail
- [ ] 2.2.1 Implement ESLint+Prettier, scripts, dep guard, CI workflow
- [ ] 2.2.2 Green phase — spec tests pass
- [ ] 2.3.1 Write dep-guard impl tests
- [ ] 2.3.2 Lint + check:deps + verify clean

### Phase 3: Packaging e2e & Finalization
- [ ] 3.1.1 Write packaging e2e spec test (ST-13/ST-14)
- [ ] 3.1.2 Red phase — e2e fails
- [ ] 3.2.1 Rewrite README; finalize LICENSE/files
- [ ] 3.2.2 Green phase — e2e passes
- [ ] 3.3.1 Final full verification; record AC-2/AC-7(CI) deferred-to-remote

---

## Dependencies

```
Phase 0 (clean slate + git)
    ↓
Phase 1 (package/build/entry)
    ↓
Phase 2 (toolchain: lint/CI/dep-guard)
    ↓
Phase 3 (packaging e2e + finalize)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ `npm run verify` exits 0 locally (typecheck + test + build)
3. ✅ `npm run lint` and `npm run check:deps` clean; `npm audit` clean
4. ✅ No dead code — no unused params/functions/modules; prototype archived, not orphaned in `src/`
5. ✅ Security: zero native runtime deps (AC-4/AC-6), no secrets in CI, `npm audit` (AC-7 local)
6. ✅ Documentation updated (README rewritten, LICENSE present)
7. ✅ AC-2 (9 CI cells) and AC-7 (CI publish-dry-run) explicitly recorded as **deferred-to-remote** (PL-3)
8. ✅ Post-completion project re-analysis (handled by the exec_plan skill)
