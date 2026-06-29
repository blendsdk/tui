# CI & Release: RD-01 Scaffolding & Toolchain

> **Document**: 03-03-ci-and-release.md
> **Parent**: [Index](00-index.md)

## Overview

Defines the GitHub Actions CI matrix, the security/audit steps, and the
dependency-policy guard. Backs AC-2, AC-6, and the CI half of AC-7. Per **PL-3**,
release automation (publish-with-provenance + changelog) is **deferred** to a later
milestone; this document authors CI only.

## Architecture

### Current Architecture
No CI, no audit, no dependency guard, no git repository.

### Proposed Changes
`git init`; add `.github/workflows/ci.yml` (3 OS × 3 Node = 9 cells) and
`scripts/check-no-native-deps.mjs`.

## Implementation Details

### Git initialisation (PL-3)
- `git init` (the env reports this is not yet a git repo). Initial and subsequent
  commits are made via **/gitcm** per the exec_plan skill — this plan contains **no
  raw git commands**.
- `.gitignore` already ignores `node_modules/`, `dist/`, `*.log`; extend with
  `coverage/` if coverage is added later.

### `.github/workflows/ci.yml` (PL-3, AR-4, AR-23)

Matrix and steps (specification, not final YAML):

| Aspect | Value |
| ------ | ----- |
| Trigger | `push` + `pull_request` |
| `strategy.matrix.os` | `[ubuntu-latest, macos-latest, windows-latest]` |
| `strategy.matrix.node` | `[18, 20, 22]` |
| `fail-fast` | `false` (see all cells' results) |
| Step 1 | `actions/checkout` |
| Step 2 | `actions/setup-node` with `node-version: ${{ matrix.node }}` |
| Step 3 | `npm ci` |
| Step 4 | `npm run lint` (PL-2) |
| Step 5 | `npm run verify` (typecheck + test + build) → **AC-2** |
| Step 6 | `npm run check:deps` (dependency-policy guard) → **AC-6** |
| Step 7 | `npm audit --audit-level=high` → **AC-7** |
| Step 8 | `npm pack --dry-run` (sanity on the file allowlist) → **AC-3** |

> **Verification boundary (PL-3):** these 9 cells cannot run here (no remote). The
> workflow is authored and committed now; the cells turn green once a remote exists.
> All step *logic* (lint, verify, check:deps, audit, pack) is runnable locally, so
> the workflow is validated by running its steps by hand during execution.

> **Secrets (AR-21):** the CI workflow embeds **no secrets**. Publish (deferred)
> will use OIDC/provenance, not long-lived tokens.

### `scripts/check-no-native-deps.mjs` (AC-6, AR-2, AR-21)

A pure-Node ESM script (cross-platform — no shell-isms) that enforces the
zero-native-runtime-deps policy:

```
1. Read package.json.
2. If `dependencies` is non-empty:
     for each runtime dep, resolve its installed package.json and FAIL if it
     declares an install/native signal: a `gypfile:true`, a `binding.gyp`,
     `scripts.install`/`scripts.preinstall`/`scripts.postinstall` invoking
     node-gyp/prebuild/cmake, or a `cpu`/`os` native constraint.
3. Exit non-zero with a clear message naming the offending dependency.
   Exit 0 when `dependencies` is empty or all are pure-JS.
```

> This makes AC-6 a real, repeatable check rather than a manual review: adding a
> native runtime dep fails `npm run check:deps` (and therefore CI).

## Integration Points
- CI invokes the scripts defined in [03-01](03-01-package-and-build.md) and
  [03-02](03-02-test-and-lint-toolchain.md).
- RD-10's packaging/cross-platform/supply-chain requirements are enforced here and
  in the packaging spec tests.

## Error Handling

| Error Case | Handling Strategy | Ref |
| ---------- | ----------------- | --- |
| A native runtime dep is added | `check:deps` exits non-zero; CI Step 6 fails | AC-6 |
| A dependency CVE at/above `high` | `npm audit` Step 7 fails CI | AC-7 |
| `verify` fails on one OS/Node cell | `fail-fast:false` surfaces every failing cell | AC-2 |
| Secret accidentally referenced | Workflow defines none; review step in execution checklist | AR-21 |

> **Traceability:** see [`00-ambiguity-register.md`](00-ambiguity-register.md).

## Testing Requirements
- `scripts/check-no-native-deps.mjs` has spec tests: passes with empty `dependencies`;
  fails on a fixture manifest declaring a native install step (ST-9, ST-10).
- The workflow YAML is lint-validated for shape (matrix dims, steps present) — a
  spec test asserts the matrix covers exactly `{ubuntu,macos,windows} × {18,20,22}`
  (ST-11). *(Parses the YAML; does not execute Actions.)*
