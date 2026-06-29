# vitest Migration: node:test → vitest, assert → expect

> **Document**: 03-04-vitest-migration.md
> **Parent**: [Index](00-index.md) · AR-5, AR-6, AR-7, AR-21

## Overview

The dominant change: replace `node:test` + `tsx --test` + `scripts/run-tests.mjs`
with vitest, converting all `node:assert/strict` calls to `expect()` via a fixed,
semantics-preserving mapping. The 50 `*.spec.test.ts` files are immutable oracles —
**only the assertion syntax changes, never an expected value** (AR-6).

## Implementation Details

### Per-package `vitest.config.ts` (two projects)

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/**/*.{spec,impl}.test.ts'],
                exclude: ['test/**/*.e2e.test.ts'] } },
      { test: { name: 'e2e',  include: ['test/**/*.e2e.test.ts'],
                pool: 'forks', poolOptions: { forks: { singleFork: true } },
                fileParallelism: false, testTimeout: 30_000 } },   // AR-7
    ],
  },
});
```

- `yarn workspace <pkg> test` → `vitest run --project unit` (the cached turbo task).
- `yarn workspace <pkg> test:e2e` → `vitest run --project e2e` (explicit; POSIX in CI).
- vitest globs natively, so **`scripts/run-tests.mjs` is deleted** (AR-5). Naming
  (`*.spec.test.ts` / `*.impl.test.ts` / `*.e2e.test.ts`) is preserved.

### The runner-import swap (all 91 files)

Each test file's `import { test } from 'node:test';` becomes
`import { test, expect } from 'vitest';` (add `describe`/`beforeEach` where used). The
`import assert from 'node:assert/strict';` line is **removed** once its calls are
converted. Test/`describe` structure and names are unchanged.

### assert → expect conversion (AR-6 fixed mapping)

| `node:assert/strict` | vitest `expect` |
|----------------------|-----------------|
| `assert.equal(a, b)` | `expect(a).toBe(b)` |
| `assert.ok(x[, msg])` | `expect(x).toBeTruthy()` |
| `assert.deepEqual(a, b)` | `expect(a).toStrictEqual(b)` |
| `assert.notEqual(a, b)` | `expect(a).not.toBe(b)` |
| `assert.notDeepEqual(a, b)` | `expect(a).not.toStrictEqual(b)` |
| `assert.match(s, re)` | `expect(s).toMatch(re)` |
| `assert.throws(fn[, E/re])` | `expect(fn).toThrow([E/re])` |
| `assert.doesNotThrow(fn)` | `expect(fn).not.toThrow()` |
| `assert.fail(msg)` | `expect.unreachable(msg)` |

- **Scriptable bulk (1,028 calls)**: a one-off codemod (`scripts/_codemod-asserts.mjs`,
  a throwaway dev script — NOT committed to the package) handles `equal`/`ok`/
  `deepEqual`/`notEqual`/`notDeepEqual`/`match`. Run, then delete.
- **Hand-verified (29 calls)**: the 14 `throws` + 13 `doesNotThrow` + 2 `fail` carry
  error-class/regex matchers or messages — each is converted by hand to preserve the
  exact matcher (e.g. `assert.throws(fn, InvalidColorError)` → `expect(fn).toThrow(InvalidColorError)`).
- **`node:assert` message args are dropped** (`assert.ok(x, 'msg')` → `expect(x).toBeTruthy()`):
  vitest surfaces the failing expression + a custom message can be re-added only if a
  test relied on it for disambiguation (none do — verified: messages are diagnostic, not semantic).

> **Oracle rule (AR-6):** if a `*.spec.test.ts` fails after conversion, the conversion
> is wrong (fix the `expect`), never the expectation. No expected value moves.

### e2e child-spawning (AR-7, AR-21)

The 5 e2e files keep spawning children via `tsx` (`process.execPath --import tsx` for
`host-tier3`; `node_modules/.bin/tsx` for `probe`/`host-signals`). Under vitest they
run in the `e2e` project (single fork, no parallelism, 30 s timeout). The `repoRoot`
and tsx-bin path are recomputed relative to the **owning package** (tui-core for host
e2e + install; tui-examples for probe.e2e). `tsx` stays a dev dep of each package.

`install.e2e.test.ts` packs `@blendsdk/tui-core` (rename) and still asserts ESM import
works + CJS `require()` is rejected.

## Integration Points
- `turbo run test` runs the `unit` project per package (cached, `dependsOn build`).
- The root gate runs the `e2e` project + probe (03-05).
- `tsx`/`esbuild` remain dev deps; vitest uses its own (esbuild-based) transform.

## Error Handling

| Error case | Strategy | AR |
|------------|----------|----|
| `toStrictEqual` differs from `deepStrictEqual` on a case | Hand-check the 92 `deepEqual` sites for prototype/undefined edge cases; fall back to `toEqual` only where deep-strict didn't apply | AR-6 |
| e2e child can't find `tsx` after hoist | Resolve via the package's own `node_modules/.bin`; verify on POSIX CI | AR-7 |
| vitest picks up e2e in the unit run | `exclude` e2e in the unit project; separate project | AR-7 |

## Testing Requirements
- Post-migration, **every** spec/impl test is green under vitest with unchanged
  expectations (regression oracle; AR-14).
- ST-2 (07): a sentinel check that a representative converted spec asserts the same
  value it did under `node:assert` (guards the mapping).
