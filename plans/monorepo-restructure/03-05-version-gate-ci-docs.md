# Version Sync, Root Gate, check:deps, CI & Docs

> **Document**: 03-05-version-gate-ci-docs.md
> **Parent**: [Index](00-index.md) · AR-8, AR-15, AR-16, AR-2, AR-12, AR-20

## Overview

The cross-package glue: the lockstep version-sync script (the only genuinely new
behavior — spec-tested first), the root acceptance gate, the per-package dependency
guard, the CI rewrite, and the documentation sync.

## Implementation Details

### `scripts/sync-versions.mjs` (AR-8) — NEW behavior, spec-first

Pure-Node ESM. Reads the root `package.json#version` (source of truth) and writes it
to every **public** workspace package, skipping private ones:

```js
// for each packages/*/package.json:
//   if pkg.private === true  -> skip (examples, root)         (AR-8)
//   else set pkg.version = ROOT_VERSION
//   if pkg.name === '@blendsdk/tui-core' -> also rewrite
//      src/engine/version.ts's `export const VERSION = '<ROOT_VERSION>'`
// idempotent; prints what it changed; exits 0
```

- Updating `version.ts` keeps the existing `VERSION === package.json#version` spec green.
- A `--check` mode (no writes) reports drift with a non-zero exit — usable in CI/gate
  to assert lockstep without mutating.
- Spec-tested first (07: ST-5): given a temp fixture workspace, the script sets public
  packages to the root version and leaves `private` ones untouched.

### Root `scripts/gate.mjs` (AR-15)

Moves from the (old) single-package location to root and orchestrates across packages.
Its steps change from `npx tsx --test test/...e2e` to workspace-scoped commands:

```js
// steps (spawnSync, shell-hopped on win32):
//   yarn workspace @blendsdk/tui-core test:e2e       (host-tier3 + host-signals + safety-restore + install)
//   yarn workspace @blendsdk/tui-examples test:e2e   (probe.e2e)
//   yarn workspace @blendsdk/tui-examples probe -- --auto
//   node scripts/sync-versions.mjs --check           (lockstep assertion)
```

`docs/acceptance-gate.md` stays at root; its criteria→evidence map is updated to point
at the new commands. The gate's own consistency spec (`gate.spec`, RD-09) moves to
tui-core and is updated to read the root `scripts/gate.mjs`.

### `scripts/check-no-native-deps.mjs` (AR-16)

Moves to root unchanged in logic (it already takes a `projectRoot` arg). Each package's
`check:deps` script calls `node ../../scripts/check-no-native-deps.mjs .`; turbo runs
it per package. Public packages must stay native-dep-free; private examples is checked
too (its only dep is the workspace `@blendsdk/tui-core`).

### CI rewrite — `.github/workflows/ci.yml` (AR-2, AR-14)

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    node: [20, 22, 24]                          # AR-2 (Node 18 dropped)
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: ${{ matrix.node }}, cache: yarn }
  - run: yarn install --frozen-lockfile
  - run: yarn turbo run lint typecheck build test check:deps   # cross-package, cached
  - if: runner.os != 'Windows'                                 # POSIX e2e (signals)
    run: yarn workspace @blendsdk/tui-core test:e2e && yarn workspace @blendsdk/tui-examples test:e2e
  - if: matrix.os == 'ubuntu-latest' && matrix.node == 22      # informational bench (PF-008 analog)
    continue-on-error: true
    run: yarn workspace @blendsdk/tui-core bench
  - run: yarn npm audit --audit-level=high || npm audit --audit-level=high   # per the yarn 1.x audit path
  - run: yarn workspace @blendsdk/tui-core pack                # packaging sanity (no publish)
```

- The bench cell moves to Node 22 (middle of the new matrix).
- yarn 1.x audit: `yarn audit` differs from `npm audit`; the plan pins the exact audit
  invocation during implementation (yarn 1.x `yarn audit --level high`), keeping the
  "0 high" gate.

### Documentation sync (AR-12, AR-20)

- **`docs/`** (root) — update the architecture/system-overview + getting-started for
  the monorepo layout and the `@blendsdk/tui-core` import name; add a short "Monorepo
  layout" note + a future-package convention line. ADRs gain one entry for the
  monorepo restructure decision.
- **`CHANGELOG.md`** (single root) — an `Unreleased` entry: monorepo restructure, the
  `@blendsdk/tui` → `@blendsdk/tui-core` rename, Node-18 drop, vitest adoption.
- **`README.md`** — install becomes `@blendsdk/tui-core`; Contributing table switches
  to `yarn` + `turbo` commands.
- **`CLAUDE.md`** — toolchain (yarn/turbo/vitest), the monorepo structure, the
  `@blendsdk/tui-<name>` convention, and the new command set.

## Error Handling

| Error case | Strategy | AR |
|------------|----------|----|
| A public package drifts from the root version | `sync-versions --check` fails the gate | AR-8 |
| `yarn audit` output/exit differs from `npm audit` | Pin the exact yarn-1.x audit command; keep "0 high" | AR-14 |
| CI cache key wrong (yarn vs npm) | `cache: yarn` + `--frozen-lockfile` | AR-3 |

## Testing Requirements
- ST-5 (07): `sync-versions.mjs` writes public packages to the root version, skips
  private — spec-first (the only new behavior).
- The moved `gate.spec` (RD-09) verifies the root gate's doc/command consistency.
- `yarn gate` green end-to-end is the Phase 5 exit gate.
