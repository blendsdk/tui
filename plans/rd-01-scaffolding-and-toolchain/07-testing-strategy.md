# Testing Strategy: RD-01 Scaffolding & Toolchain

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

RD-01 ships no runtime logic beyond `VERSION`, so its tests verify the **toolchain
and package contract** rather than algorithms. Tests use `node:test` +
`node:assert/strict`, run via `tsx --test` (PL-8), and read real artifacts
(`package.json`, `npm pack --dry-run --json`, the workflow file, the guard script).

### Coverage Goals
- Every locally-verifiable acceptance criterion (AC-1, AC-3, AC-4, AC-5, AC-6, and the local half of AC-7) has at least one specification test.
- AC-2 and the CI half of AC-7 are **deferred to remote** (PL-3) — covered by the authored workflow + a structural assertion on the YAML, not by executing Actions.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> Derived exclusively from [01-requirements.md](01-requirements.md), the component
> specs (03-XX), RD-01 acceptance criteria, and the Ambiguity Register. **Immutable
> oracle**: if a spec test fails after implementation, the implementation is wrong.

### Package identity & build (file: `src/engine/packaging.spec.test.ts`)

| #     | Input / Scenario | Expected Output / Behavior | Source |
| ----- | ---------------- | -------------------------- | ------ |
| ST-1  | `import { VERSION } from '../engine/index.js'` (after build, or via tsx) | `VERSION` is a non-empty string | AC-1, PL-7 |
| ST-2  | Compare exported `VERSION` to `package.json#version` | Strictly equal (`'0.1.0'`) | PL-6, PL-7 |
| ST-3  | Run `npm pack --dry-run --json`, collect file paths | Set ⊆ `dist/**` ∪ `{package.json, README.md, LICENSE}` | AC-3 |
| ST-4  | Same pack file list | Contains **no** path under `src/`, no `*.test.*`, no `node_modules` | AC-3 |
| ST-5  | Parse `package.json` | `type==='module'`, `sideEffects===false`, `engines.node==='>=18'`, `exports['.']` present, `dependencies` is empty/absent | AC-4 |
| ST-6  | Parse `package.json#exports['.']` | Has `import` + `types` keys, **no** `require` key (ESM-only) | AC-1, AR-6 |
| ST-7  | Build output exists | `dist/engine/index.d.ts` and `dist/engine/index.js` present after `npm run build` | AC-1, AC-3 |

### Toolchain enforcement (file: `src/engine/toolchain.spec.test.ts`)

| #     | Input / Scenario | Expected Output / Behavior | Source |
| ----- | ---------------- | -------------------------- | ------ |
| ST-8  | Typecheck a temp source file containing an unused import (run `tsc --noEmit` on a fixture) | `tsc` exits non-zero (`noUnusedLocals` enforced) | AC-5 |
| ST-9  | Run `check-no-native-deps.mjs` against a manifest with empty `dependencies` | Exits 0 | AC-6 |
| ST-10 | Run `check-no-native-deps.mjs` against a fixture manifest whose runtime dep declares `gypfile:true` / a native install script | Exits non-zero, message names the offending dep | AC-6 |
| ST-11 | Read `.github/workflows/ci.yml` as text | Contains `ubuntu-latest`, `macos-latest`, `windows-latest` and Node `18`, `20`, `22`, and invokes `npm run verify` | AC-2 (structure), AR-4, AR-23 |
| ST-12 | Test runner discovers both globs | A `*.spec.test.ts` and a `*.impl.test.ts` are both executed by `npm test` | PL-8 |

### Packaging e2e (file: `test/install.e2e.test.ts` or documented manual step)

| #     | Input / Scenario | Expected Output / Behavior | Source |
| ----- | ---------------- | -------------------------- | ------ |
| ST-13 | `npm pack`, install the tarball into a temp dir, `import { VERSION } from '@blendsdk/tui'` from an ESM file | Import resolves; `VERSION` printed; `.d.ts` present in installed package | AC-1 |
| ST-14 | From the temp dir, `require('@blendsdk/tui')` in a CJS file | Throws an ESM-related error (e.g. `ERR_REQUIRE_ESM`) | AC-1, AR-6 |

> **⚠️ AUTHORING RULE:** All expectations above come from the acceptance criteria /
> specs / register — not from imagined implementation output. ST-13/ST-14 are heavier
> (real pack+install); if not automated in CI-less local runs they MUST be executed
> manually and recorded during the relevant execution task.

## Test Categories

### Specification Tests (from ST-cases above)
> Written BEFORE implementation. The packaging/toolchain ones can be written against
> the contract; some assertions (ST-3, ST-7, ST-13) require a build/pack to have run,
> so they execute against the produced artifacts.

| Test File | ST Cases Covered | Component |
| --------- | ---------------- | --------- |
| `src/engine/packaging.spec.test.ts` | ST-1…ST-7 | Package & Build |
| `src/engine/toolchain.spec.test.ts` | ST-8…ST-12 | Test/Lint/CI toolchain |
| `test/install.e2e.test.ts` (or manual) | ST-13, ST-14 | Packaging e2e |

### Implementation Tests (edge cases, internals)
> Written AFTER implementation. Filed as `*.impl.test.ts`.

| Test File | Description | Priority |
| --------- | ----------- | -------- |
| `src/engine/version.impl.test.ts` | `VERSION` matches SemVer shape `X.Y.Z`; is frozen/const | Low |
| `src/engine/check-deps.impl.test.ts` | Guard handles edge manifests: missing `dependencies` key, `scripts.postinstall` without node-gyp (allowed), `os`/`cpu` constraints | Med |

### Integration Tests
| Test | Components | Description |
| ---- | ---------- | ----------- |
| `verify` end-to-end | build + test + typecheck | `npm run verify` exits 0 locally on Linux (this env) |

### End-to-End Tests
| Scenario | Steps | Expected Result |
| -------- | ----- | --------------- |
| Consumer install (ST-13/14) | pack → install into temp → import (ESM) + require (CJS) | ESM import works; CJS require fails with ESM error |

## Test Data

### Fixtures Needed
- A temp TS file with an unused import (ST-8) — created in a temp dir, not committed.
- A fixture `package.json` declaring a native runtime dep (`gypfile:true` / install script) for ST-10.
- A temp consumer project (ESM + CJS file) for ST-13/ST-14.

### Mock Requirements
- None beyond temp filesystem fixtures — prefer real `npm pack`/`tsc` invocations over mocks (testing standard: prefer real objects).

## Verification Checklist
- [ ] All ST-* defined with concrete input/output pairs ✅ (above)
- [ ] Every ST case traces to a requirement/AC/AR ✅
- [ ] Specification tests written BEFORE implementation
- [ ] Spec tests verified to FAIL before implementation (red phase) — note: ST-3/ST-7/ST-13 need an artifact to assert against; their red phase is "artifact absent → test fails"
- [ ] All spec tests pass after implementation (green phase)
- [ ] Implementation tests written for edge cases
- [ ] `npm run verify` exits 0 locally; `npm run lint` clean
- [ ] AC-2 / AC-7(CI) marked deferred-to-remote, workflow authored (PL-3)
- [ ] No regressions; no dead code
