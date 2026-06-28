# ADR-001: ESM-only, zero runtime dependencies

> **Date**: 2026-06-28
> **Status**: Accepted
> **Source**: RD-01 (scaffolding & toolchain), reaffirmed by RD-10 (non-functional)

## Context

A terminal SDK foundation ships to many environments and must be trustworthy at the
supply-chain level. Two early choices shape everything downstream: the module
system, and how much third-party code runs at runtime.

## Options Considered

### Option A: Dual CJS+ESM, allow runtime deps as needed

- **Pros**: Broadest consumer compatibility; reuse existing terminal libraries.
- **Cons**: Dual-build complexity; every runtime dep is attack surface, audit
  burden, and a potential native-build/install failure.

### Option B: ESM-only, zero runtime dependencies (pure-JS, Node built-ins only)

- **Pros**: Minimal attack surface; clean installs on all platforms (no node-gyp);
  forces a well-factored pure core; trivial to audit.
- **Cons**: No CommonJS `require()`; must re-implement primitives instead of pulling
  a library.

## Decision

**Chosen option**: Option B — the package is ESM-only and ships with zero runtime
dependencies, using only Node built-ins.

## Rationale

The foundation's value is correctness and trustworthiness, not breadth of features
borrowed from npm. Zero runtime deps makes the runtime surface auditable to the Node
standard library, guarantees clean cross-platform installs, and pressures the design
toward pure, testable functions. ESM-only matches the modern Node baseline (≥ 18)
and avoids dual-build complexity. The choice is enforced by `npm run check:deps`
(fails on any native runtime dep) and the RD-01 packaging spec (`sideEffects:false`,
`.d.ts`, `engines.node>=18`).

## Consequences

### Positive

- Auditably small runtime surface; `npm audit` stays clean.
- Tree-shakeable (`sideEffects:false`), verified by the RD-10 esbuild check.
- Clean installs everywhere — no compile step.

### Negative

- CommonJS consumers must use dynamic `import()`.
- Primitives (width tables, colour math) are implemented in-repo rather than borrowed.

### Risks

- A future genuine need for a runtime dep would require a license/audit guard
  (tracked as RD-10 DEF-2) before it ships.
