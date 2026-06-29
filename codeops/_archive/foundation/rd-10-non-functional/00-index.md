# RD-10 Non-Functional Requirements — Implementation Plan

> **Feature**: Realize and verify the cross-cutting NFRs of the `@blendsdk/tui` foundation — performance budgets, packaging/tree-shaking, accessibility & degradation, API stability, supply-chain integrity, and documentation.
> **Status**: Planning Complete
> **Created**: 2026-06-28
> **Implements**: RD-10
> **CodeOps Skills Version**: 2.0.0

## Overview

RD-10 gathers the qualities the foundation must hold regardless of subsystem. Much
of it is **already satisfied** by RD-01…09 and today's CI work and is therefore
**mapped, not rebuilt** (AR-10, the RD-09 AR-8 precedent): output∝damage, bounded
buffers, cross-platform CI green, and the ESM/`.d.ts`/`sideEffects`/`engines`
packaging contract.

What this plan **adds**:

- A **performance benchmark** (`npm run bench`) reporting median/p95 for the
  200×50 compose+diff and the steady-state single-cell update, plus a **16 ms
  ceiling test** that asserts locally and auto-skips its hard assertion under CI
  (CI runs the bench informationally). This resolves RD-09 **DEF-4** (AR-2, AR-3).
- A **tree-shake / bundle-size check** via `esbuild` — a relational assertion that
  a one-symbol import bundles far smaller than the whole library (AR-4, AR-8).
- A **detection-budget** test: a non-responding query resolves via fallback within
  `timeoutMs`+slack (AR-12).
- **Accessibility & degradation golden tests**: `NO_COLOR`→monochrome-with-attributes
  and `boxDrawing:false`→ASCII, through the RD-09 `@xterm/headless` harness (AR-11).
- **API-stability artifacts**: `CHANGELOG.md` (Keep-a-Changelog) + a README
  "Versioning & stability" policy section (AR-7).
- **Documentation**: an architecture + API reference + ADR set produced via the
  **techdocs skill** (AR-5).

Deferred: npm provenance (DEF-1), a dependency-license guard (DEF-2), and
typed-array buffer backing (DEF-3).

## Document Index

| #   | Document                                            | Description                                      |
| --- | --------------------------------------------------- | ------------------------------------------------ |
| AR  | [Ambiguity Register](00-ambiguity-register.md)      | Zero-Ambiguity Gate decisions (audit trail)      |
| 00  | [Index](00-index.md)                                | This document                                    |
| 01  | [Requirements](01-requirements.md)                  | Feature requirements and scope                   |
| 02  | [Current State](02-current-state.md)                | What already satisfies RD-10 vs the gaps         |
| 03-01 | [Performance & Budgets](03-01-performance-budgets.md)        | Bench + 16 ms ceiling + detection budget |
| 03-02 | [Packaging & Tree-Shake](03-02-packaging-and-treeshake.md)  | esbuild size check + packaging contract  |
| 03-03 | [Accessibility & Degradation](03-03-accessibility-degradation.md) | NO_COLOR + ASCII-fallback golden tests |
| 03-04 | [API Stability & Supply Chain](03-04-api-stability-supply-chain.md) | CHANGELOG, policy, audit, deferrals |
| 03-05 | [Documentation](03-05-documentation-techdocs.md)            | Architecture + API + ADRs via techdocs   |
| 07  | [Testing Strategy](07-testing-strategy.md)          | Specification test cases (ST-*)                  |
| 99  | [Execution Plan](99-execution-plan.md)              | Phases, sessions, and task checklist             |

## Quick Reference

```bash
npm run bench     # performance numbers (median/p95) — informational
npm run verify    # now also runs the a11y golden tests, tree-shake + detection-budget specs
npm run gate      # the RD-09 go/no-go gate (unchanged)
```

### Key Decisions

| Decision | Outcome | AR |
|----------|---------|----|
| Perf enforcement | bench + skippable 16 ms ceiling; CI bench informational | AR-2, AR-9 |
| Tree-shake check | esbuild, relational (single ≪ full) | AR-4, AR-8 |
| API reference + ADRs | via the techdocs skill | AR-5 |
| Changelog/policy | CHANGELOG.md + README section, manual | AR-7 |
| Existing NFRs | mapped, not rebuilt | AR-10 |
| Deferred | provenance (DEF-1), license guard (DEF-2), typed-array (DEF-3) | AR-13, AR-6, AR-14 |

## Related Files

**New (created by this plan):**
- `test/perf-budget.spec.test.ts`, `test/perf-budget.impl.test.ts`, `bench/frame-bench.mjs`
- `test/treeshake.spec.test.ts`
- `test/capability-budget.spec.test.ts`
- `test/a11y-golden.spec.test.ts`
- `test/docs-presence.spec.test.ts` (techdocs output presence guard)
- `CHANGELOG.md`, `docs/**` (techdocs output)

**Modified:**
- `package.json` (dev dep `esbuild`; scripts `bench`), `.github/workflows/ci.yml` (informational bench step)
- `README.md` (Versioning & stability), `CLAUDE.md`, `plans/00-roadmap.md`
