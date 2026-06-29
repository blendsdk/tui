# `@blendsdk/tui-examples` Package (private)

> **Document**: 03-03-examples-package.md
> **Parent**: [Index](00-index.md) · AR-10, AR-7, AR-21

## Overview

A new **private** (unpublished, version-excluded) package holding the runnable
examples and the probe test suite — the code that *uses* the engine. It depends on
`@blendsdk/tui-core` via the workspace.

## Implementation Details

### Layout

```
packages/tui-examples/
├── package.json          # @blendsdk/tui-examples (private: true)
├── tsconfig.json         # extends ../../tsconfig.base.json (noEmit; this pkg isn't built to dist)
├── vitest.config.ts      # unit + e2e projects (probe tests)
├── capability-probe/**   # MOVED from examples/capability-probe/**
├── resize-demo/**        # MOVED from examples/resize-demo/**
└── test/                 # MOVED 15 probe test files (probe-*.{spec,impl}.test.ts + probe.e2e)
```

### `packages/tui-examples/package.json`

```jsonc
{
  "name": "@blendsdk/tui-examples",
  "private": true,                       // AR-10 — never published, version-EXCLUDED (AR-8)
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --project unit",
    "test:e2e": "vitest run --project e2e",     // probe.e2e (POSIX)
    "lint": "eslint . && prettier --check .",
    "probe": "tsx capability-probe/main.ts",    // used by the root gate (AR-15)
    "demo:resize": "tsx resize-demo/main.ts",
    "verify": "tsc --noEmit && vitest run --project unit"
  },
  "dependencies": { "@blendsdk/tui-core": "workspace:*" },  // workspace resolution
  "devDependencies": { "@types/node": "^22.10.0", "tsx": "^4.19.2", "vitest": "^4" }
}
```

> yarn 1.x uses `"@blendsdk/tui-core": "*"` (it resolves the workspace automatically);
> the `workspace:` protocol shown is normalized at implementation time to whatever
> yarn 1.22 accepts — pin to the synced version or `*`. (Resolved during 1.x setup.)

- `private: true` → excluded from `scripts/sync-versions.mjs` (AR-8) and never packed.
- No `build`/`dist`: examples are run via `tsx`, never emitted (mirrors today's
  `examples` being excluded from `tsc`). `typecheck` replaces the old
  `tsconfig.examples.json` (which is deleted).

### Import rewrites (probe tests + examples)

The probe tests and example sources currently import the engine via a relative path
into `src/engine` and the probe harness via `../examples/...`. After the move:

- Engine imports become the **package name**: `import { ... } from '@blendsdk/tui-core'`
  (resolves via the workspace dep to the built `dist/engine/index.js`).
- Probe-harness imports become **intra-package relative** (`../capability-probe/...`).

> Because examples now consume `@blendsdk/tui-core` as a built dependency, the
> examples package's `test`/`typecheck` depend on tui-core being built first — handled
> by turbo `^build` (03-01, AR-4).

### e2e under vitest (AR-7, AR-21)

`probe.e2e.test.ts` spawns the probe via `tsx`. It runs in this package's **e2e
vitest project** (03-04). Its `repoRoot`/tsx-bin computation is rebased to this
package directory; `tsx` is a dev dep here so `node_modules/.bin/tsx` resolves (yarn
hoist-aware). The probe child still runs as `tsx capability-probe/main.ts`.

## Integration Points
- Depends on `@blendsdk/tui-core`; built after it (turbo `^build`).
- The root gate (`scripts/gate.mjs`) runs `yarn workspace @blendsdk/tui-examples probe --auto` (AR-15).

## Error Handling

| Error case | Strategy | AR |
|------------|----------|----|
| examples accidentally published | `private: true` | AR-10 |
| probe test imports unresolved after move | Rewrite engine imports to `@blendsdk/tui-core`; harness imports intra-package | AR-10 |
| examples version drifts into the release | Excluded from sync script (private) | AR-8 |

## Testing Requirements
- The 15 moved probe tests stay green under vitest in this package (regression oracle).
- `probe.e2e` runs in the e2e project (POSIX) and the root gate (07: ST-6).
