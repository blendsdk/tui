# Workspace Foundation: yarn + Turborepo + Shared Config

> **Document**: 03-01-workspace-foundation.md
> **Parent**: [Index](00-index.md) · AR-2, AR-3, AR-4, AR-13, AR-18, AR-19

## Overview

The private root that ties the packages together: yarn 1.x workspaces, Turborepo
orchestration, the shared TypeScript/ESLint/Prettier config, the Node-20 floor, and
the npm→yarn lockfile swap. No engine code moves here — this is the shell.

## Implementation Details

### Root `package.json` (private)

```jsonc
{
  "name": "@blendsdk/tui-monorepo",      // AR-18
  "private": true,                        // never published
  "version": "0.1.0",                     // SOURCE OF TRUTH for the lockstep version (AR-8)
  "engines": { "node": ">=20" },          // AR-2
  "packageManager": "yarn@1.22.22",       // already declared today
  "workspaces": ["packages/*"],           // AR-3
  "scripts": {
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "check:deps": "turbo run check:deps",
    "verify": "turbo run verify",
    "gate": "node scripts/gate.mjs",            // root, cross-package (AR-15)
    "sync-versions": "node scripts/sync-versions.mjs",  // AR-8
    "bench": "yarn workspace @blendsdk/tui-core bench"
  },
  "devDependencies": {
    "turbo": "^2",                         // AR-4 (prebuilt binary, dev-only)
    "typescript": "^5.7.2",
    "eslint": "^9.17.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.4.2",
    "typescript-eslint": "^8.18.0"
  }
}
```

Shared dev tooling (TS, ESLint, Prettier, turbo) lives at the root and hoists; each
package declares only what it uniquely needs (vitest, tsx, esbuild, @xterm/headless,
@types/node — see 03-02/03-03). yarn 1.x hoists to the root `node_modules`.

### `turbo.json` (AR-4)

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":     { "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test":      { "dependsOn": ["build"], "outputs": ["coverage/**"] },  // treeshake/perf read dist/
    "lint":      {},
    "check:deps":{ "dependsOn": ["build"] },                              // inspects installed deps
    "verify":    { "dependsOn": ["typecheck", "build", "test"] }
  }
}
```

- `test dependsOn build` because the treeshake spec bundles `dist/engine/index.js` and
  the perf spec imports the built path (RD-10). `^build` builds upstream deps first
  (examples needs tui-core built).
- The e2e project is **not** a turbo `test` task — it is a separate, explicitly-invoked
  vitest project (03-04, AR-7), kept out of the cached unit graph.
- Caching is local-only; `.turbo/` is gitignored (AR-19).

### Shared TypeScript config (AR-13)

`tsconfig.base.json` at root holds the compiler options currently in `tsconfig.json`
(target ES2022, NodeNext, strict, `noUnusedLocals/Parameters`, declaration + maps,
`skipLibCheck`). Each package's `tsconfig.json`:

```jsonc
{ "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"] }
```

No TS project references initially — turbo's `^build` orders cross-package builds (AR-4).

### Shared ESLint / Prettier (AR-13)

The existing flat `eslint.config.js` stays at root; `ignores` adds `.turbo` and
`coverage` (keeps `dist`, `node_modules`, `_archive`). Its globs already match `**/*.ts`
so `packages/*/{src,test,bench}` are covered. Prettier config unchanged; `.prettierignore`
adds `.turbo`, `coverage` (keeps `plans`, `requirements`).

### Package manager swap (AR-3)

Remove `package-lock.json`; run `yarn install` to generate `yarn.lock` (committed).
`.gitignore` adds `.turbo/` and `coverage/` (keeps `node_modules/`, `dist/`, `*.log`).

## Integration Points
- Root scripts delegate to `turbo run`; `gate`/`sync-versions` run directly at root.
- Per-package `package.json` scripts (`build`/`typecheck`/`test`/`lint`/`check:deps`/
  `verify`) are what turbo invokes — defined in 03-02 / 03-03.

## Error Handling

| Error case | Strategy | AR |
|------------|----------|----|
| yarn hoist conflict / peer warning | Pin shared devDeps at root; per-package only unique deps | AR-3 |
| turbo task ordering wrong (test before build) | Explicit `dependsOn` in `turbo.json` | AR-4 |
| Node < 20 invoked | `engines.node >=20` + CI matrix 20/22/24 | AR-2 |

## Testing Requirements
- A **workspace integrity** spec (07, ST-1): `yarn install` succeeds, the workspace lists
  both packages, and `@blendsdk/tui-examples` resolves `@blendsdk/tui-core`.
- `turbo run verify` green is the phase exit gate.
