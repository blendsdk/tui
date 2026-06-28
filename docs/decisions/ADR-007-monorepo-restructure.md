# ADR-007: Monorepo (yarn + Turborepo), vitest, lockstep versions

> **Date**: 2026-06-28
> **Status**: Accepted
> **Source**: Plan: monorepo-restructure

## Context

The SDK began as a single package, `@blendsdk/tui`. As the project grows beyond the
foundation engine (widgets, layout, an app runloop, and the dev examples/probe
harness), one package conflates the published library with dev-only tooling and
leaves no room for additional published packages. We also wanted a faster, cached
build/test pipeline and a modern test runner.

## Options Considered

### Option A: Stay single-package

- **Pros**: Simplest; no workspace tooling.
- **Cons**: No home for future packages; dev examples ship-or-pollute the published
  surface; no shared task caching.

### Option B: yarn 1.x workspaces + Turborepo, vitest, lockstep versions

- **Pros**: Clean package boundaries (`@blendsdk/tui-core` published,
  `@blendsdk/tui-examples` private); cached cross-package `build`/`typecheck`/`test`;
  vitest's fast watch + projects (unit vs e2e); one source-of-truth version across
  public packages.
- **Cons**: Workspace/tooling overhead; a one-time test-runner migration
  (`node:test` → vitest); the Node floor must rise to ≥ 20 (latest vitest dropped 18).

## Decision

**Chosen option**: Option B — a yarn 1.x + Turborepo monorepo. The engine becomes
`@blendsdk/tui-core` under `packages/tui-core/`; examples + the probe harness become
the private `@blendsdk/tui-examples`. Future packages are `@blendsdk/tui-<name>`.
Tests run on vitest (`unit` + `e2e` projects). A `sync-versions` script keeps all
public packages on the root `package.json#version` in lockstep.

## Rationale

The split cleanly separates the published contract (tui-core, still ESM-only /
zero-runtime-dep — [ADR-001](/decisions/ADR-001-esm-zero-dependency)) from dev-only
example code, and opens room for the widget/app packages the foundation exists to
support. Turborepo caches and orders cross-package tasks (`^build` so consumers
typecheck against built `.d.ts`). vitest replaces the bespoke Node-version-dependent
test runner and resolves the NodeNext `.js`→`.ts` specifiers natively. The
`node:assert` → `expect()` migration was a semantics-preserving syntax change — no
spec-test expectation moved. Node 18 was already EOL, so raising the floor to ≥ 20
to adopt the latest vitest cost nothing real.

## Consequences

### Positive

- Clear package boundaries; a place for `@blendsdk/tui-<name>` packages.
- Cached, ordered builds/tests via Turborepo; fast vitest runs.
- Lockstep versions prevent public-package version drift.

### Negative

- More tooling (yarn workspaces, turbo, two vitest configs) to maintain.
- Governance tests (gate/docs/api-stability) currently reach the monorepo root from
  `tui-core` via `../../..` (tracked as a cleanup, DEF-4).

### Risks

- Publishing is not yet wired (provenance deferred — RD-10 DEF-1 / DEF-2); the
  packaging contract is still verified by `packaging.spec` + the install e2e.
