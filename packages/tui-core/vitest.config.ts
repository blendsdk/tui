import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration (RD: monorepo-restructure, plan doc 03-04).
 *
 * Two projects so the heavy child-spawning e2e suite is isolated from the fast
 * unit run (AR-7):
 *   - `unit`: the *.spec.test.ts / *.impl.test.ts tiers (the default `test` task).
 *   - `e2e` : the *.e2e.test.ts tier — single fork, no file parallelism, extended
 *     timeout, because each test spawns real child processes via tsx.
 *
 * Vite/vitest resolves the NodeNext `.js` import specifiers to their `.ts` sources
 * natively (verified), so no extension-rewrite plugin is needed.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/**/*.{spec,impl}.test.ts'],
          exclude: ['test/**/*.e2e.test.ts', 'node_modules/**'],
          // node:test imposed no tight per-test timeout; vitest defaults to 5s.
          // Some unit specs spawn subprocesses (esbuild, npm pack) that are slow
          // on Windows runners — a modest floor avoids flaky timeouts (pack tests
          // set their own higher per-test timeout).
          testTimeout: 15_000,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e.test.ts'],
          // Vitest 4: pool options are top-level. Single fork, no file
          // parallelism — the signal/restore e2e must not interleave.
          pool: 'forks',
          singleFork: true,
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
