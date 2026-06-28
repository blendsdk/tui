/**
 * The monorepo root, resolved once (monorepo-restructure, AR-23).
 *
 * Several governance specs in this package (`gate`, `docs-presence`,
 * `api-stability`, `check-deps`, `toolchain`, `sync-versions`) assert against
 * monorepo-root artifacts — the shared scripts, `docs/`, the root `CHANGELOG`/
 * `README`, and `.github/`. This module is the single source of that path so the
 * `../../..` reach lives in exactly one place. (Static `import` specifiers that
 * reference root scripts still spell the path literally — ESM requires it.)
 *
 * A non-test `*-helpers`-style module, so importing it never registers a suite.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

/** This file's directory: `packages/tui-core/test/`. */
const here = dirname(fileURLToPath(import.meta.url));

/** The monorepo root — three levels up from `packages/tui-core/test/`. */
export const monorepoRoot = resolve(here, '../../..');

/** Join path segments onto the monorepo root. */
export function repoPath(...segments: string[]): string {
  return join(monorepoRoot, ...segments);
}
