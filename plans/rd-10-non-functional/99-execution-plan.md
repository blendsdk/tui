# Execution Plan: RD-10 Non-Functional Requirements

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-06-28 (Phase 5 complete)
> **Progress**: 27/31 tasks (87%)
> **CodeOps Skills Version**: 2.0.0

## Overview

Realize and verify the foundation's NFRs. Existing qualities are mapped (AR-10); new
work is the perf bench + budgets, the esbuild tree-shake check, the a11y golden tests,
the detection-budget test, the API-governance docs, and the techdocs doc set.
Spec-first throughout; wall-clock assertions are skippable under CI (AR-2).

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
| ----- | ----- | -------- | --------- |
| 1 | Performance & budgets (bench, ceiling, detection, size-independence) | 3 | 120–150 min |
| 2 | Packaging & tree-shake (esbuild) | 2 | 60–90 min |
| 3 | Accessibility & degradation golden tests | 2 | 90–120 min |
| 4 | API stability & supply chain (CHANGELOG, policy) | 2 | 60–90 min |
| 5 | Documentation via techdocs skill | 2 | 90–120 min |
| 6 | CI wiring, docs & roadmap sync | 1 | 45–60 min |

**Total: ~12 sessions, ~7.5–10.5 hours**

---

## Phase 1: Performance & Budgets
**Reference**: [03-01](03-01-performance-budgets.md) · ST-1, ST-2, ST-3

### Session 1.1: Specification Tests
| # | Task | File |
|---|------|------|
| 1.1.1 | Write `perf-budget.spec` — 16 ms ceiling (ST-1, skips on `CI`\|\|`TUI_SKIP_PERF`) + detection budget (ST-3: stub `read()` **blocks forever**, assert both elapsed bounds off-CI). Decide the helper module shape here (PF-001/PF-005/PF-006) | `test/perf-budget.spec.test.ts` |
| 1.1.2 | Extend byte-proportionality with the **same-coordinate** 8×8-vs-200×50 **exact-equality** case, labelled `RD10-ST-2` (ST-2; PF-003/PF-004) | `test/render-bytes-damage.spec.test.ts` |
| 1.1.3 | Run specs — confirm status (expected-green vs built engine; justify) | — |

### Session 1.2: Implementation
| # | Task | File |
|---|------|------|
| 1.2.1 | Implement the bench reporter (median/p95) + `npm run bench` script; **export** the pure helpers, run the printing CLI only behind an `import.meta.url` main-guard (PF-005) | `bench/frame-bench.mjs`, `package.json` |
| 1.2.2 | Confirm the spec/impl tests import `measureComposeDiff`/`median` from the main-guarded `bench/frame-bench.mjs` with no side effects on import (PF-005) | `bench/frame-bench.mjs` |
| 1.2.3 | Run specs — green | — |

### Session 1.3: Impl Tests & Hardening
| # | Task | File |
|---|------|------|
| 1.3.1 | Impl tests: median/p95 math (known input → known median); CI-skip branch | `test/perf-budget.impl.test.ts` |
| 1.3.2 | Full `npm run verify` + `npm run bench` (prints numbers) | — |

**Verify**: `npm run verify && npm run bench`

---

## Phase 2: Packaging & Tree-Shake
**Reference**: [03-02](03-02-packaging-and-treeshake.md) · ST-4

### Session 2.1: Spec + dep
| # | Task | File |
|---|------|------|
| 2.1.1 | Add `esbuild` dev dep; verify a clean prebuilt-binary install (no node-gyp) + `npm audit` clean | `package.json` |
| 2.1.2 | Write `treeshake.spec` — one-symbol bundle ≪ full (relational, ST-4); tune the fraction | `test/treeshake.spec.test.ts` |
| 2.1.3 | Run spec — green (depends on built `dist/`; verify builds before test) | — |

### Session 2.2: Hardening
| # | Task | File |
|---|------|------|
| 2.2.1 | Full `npm run verify` + `npm run check:deps` | — |

**Verify**: `npm run verify && npm run check:deps`

---

## Phase 3: Accessibility & Degradation
**Reference**: [03-03](03-03-accessibility-degradation.md) · ST-5, ST-6, ST-7

### Session 3.1: Spec Tests
| # | Task | File |
|---|------|------|
| 3.1.1 | Add `reverseState`/`isInverse` reader to the golden adapter | `test/golden-screen-helpers.ts` |
| 3.1.2 | Write `a11y-golden.spec` — NO_COLOR mono + attribute focus (ST-5), ASCII fallback (ST-6) | `test/a11y-golden.spec.test.ts` |
| 3.1.3 | Run spec — confirm status; ST-7 mapped to RD-08 (no new test) | — |

### Session 3.2: Impl Tests & Hardening
| # | Task | File |
|---|------|------|
| 3.2.1 | Extend the golden impl test with a `reverseState` normalization case | `test/golden-screen.impl.test.ts` |
| 3.2.2 | Resolve failures by fixing the engine if a contract is violated; else the adapter | (as needed) |
| 3.2.3 | Full `npm run verify` | — |

**Verify**: `npm run verify`

---

## Phase 4: API Stability & Supply Chain
**Reference**: [03-04](03-04-api-stability-supply-chain.md) · ST-8

### Session 4.1: Spec + docs
| # | Task | File |
|---|------|------|
| 4.1.1 | Write `api-stability.spec` (CHANGELOG + README policy presence, ST-8) — red | `test/api-stability.spec.test.ts` |
| 4.1.2 | Add `CHANGELOG.md` (Keep-a-Changelog; Unreleased + 0.1.0) | `CHANGELOG.md` |
| 4.1.3 | Add README "Versioning & stability" section (SemVer, public surface, deprecation) | `README.md` |
| 4.1.4 | Run spec — green | — |

### Session 4.2: Hardening
| # | Task | File |
|---|------|------|
| 4.2.1 | Full `npm run verify` + lint | — |

**Verify**: `npm run verify && npm run lint`

---

## Phase 5: Documentation (techdocs)
**Reference**: [03-05](03-05-documentation-techdocs.md)

### Session 5.1: Generate
| # | Task | File |
|---|------|------|
| 5.1.1 | Invoke the **techdocs skill** (`make_techdocs`) — architecture overview + API reference + ADRs | `docs/**` |
| 5.1.2 | Confirm `docs/` contains the generated overview + API reference + ADR files (coexists with `acceptance-gate.md`) | — |
| 5.1.3 | Write `docs-presence.spec` (ST-9, PF-009): assert `docs/` has the overview + API reference + ≥1 ADR — guards against silent doc rot, mirroring `gate.spec` | `test/docs-presence.spec.test.ts` |

### Session 5.2: Hardening
| # | Task | File |
|---|------|------|
| 5.2.1 | Full `npm run verify` + lint (docs formatting) | — |

**Verify**: `npm run verify && npm run lint`

---

## Phase 6: CI Wiring, Docs & Roadmap Sync
**Reference**: [00-index](00-index.md)

### Session 6.1: Wiring + docs
| # | Task | File |
|---|------|------|
| 6.1.1 | Add an informational `bench` step to CI (prints, never fails), **scoped to one matrix cell** (e.g. `ubuntu-latest` + Node 20) to avoid 9× noise + Windows quoting (PF-008) | `.github/workflows/ci.yml` |
| 6.1.2 | README: add `npm run bench` to the Contributing table + RD-10 note | `README.md` |
| 6.1.3 | CLAUDE.md: `bench` command, `bench/` + new tests in structure, RD-10 overview | `CLAUDE.md` |
| 6.1.4 | Roadmap: RD-10 → ✅ Implemented + DEF-1…DEF-3; **mark RD-09 DEF-4 resolved** (pointing at the RD-10 bench + ceiling spec; PF-007); Milestone status | `plans/00-roadmap.md` |
| 6.1.5 | Final `npm run verify && npm run gate && npm run lint && npm run check:deps && npm audit && npm run bench` | — |

**Verify**: `npm run verify && npm run gate && npm run lint`

---

## 🚨 Master Progress Checklist — MANDATORY

> Update immediately after each task: `- [x] N.N.N … ✅ (completed: YYYY-MM-DD)`, bump the Progress header.

### Phase 1: Performance & Budgets
- [x] 1.1.1 perf-budget spec (ceiling ST-1 skips on CI||TUI_SKIP_PERF + detection ST-3 blocking stub, both bounds) ✅ (completed: 2026-06-28)
- [x] 1.1.2 RD10-ST-2 exact-equality size-independence case ✅ (completed: 2026-06-28)
- [x] 1.1.3 Confirm spec status ✅ (ST-1/ST-3 red — bench module absent; RD10-ST-2 green — deterministic mapping) (completed: 2026-06-28)
- [x] 1.2.1 bench reporter + `bench` script (exported helpers, main-guarded CLI) ✅ (completed: 2026-06-28)
- [x] 1.2.2 confirm spec/impl import helper with no import side effects ✅ (completed: 2026-06-28)
- [x] 1.2.3 Specs green ✅ (ST-1 median 2.4ms; ST-3 waits full 80ms budget) (completed: 2026-06-28)
- [x] 1.3.1 perf-budget impl tests ✅ (median/p95/measureComposeDiff/perfBudgetMode) (completed: 2026-06-28)
- [x] 1.3.2 Full verify + bench ✅ (verify 512/512, lint clean, bench prints) (completed: 2026-06-28)

### Phase 2: Packaging & Tree-Shake
- [x] 2.1.1 Add esbuild dev dep (verify clean prebuilt-binary install, no node-gyp + audit) ✅ (esbuild ^0.28.1, 0 vulns, check:deps green) (completed: 2026-06-28)
- [x] 2.1.2 treeshake spec (ST-4, tune fraction) ✅ (platform:'node' for built-ins; fraction 0.5) (completed: 2026-06-28)
- [x] 2.1.3 Spec green ✅ (ratio 0.001 — 30b vs 33300b, vast margin under 0.5) (completed: 2026-06-28)
- [x] 2.2.1 Full verify + check:deps ✅ (verify 513/513, check:deps + lint clean) (completed: 2026-06-28)

### Phase 3: Accessibility & Degradation
- [x] 3.1.1 reverseState/isInverse adapter reader ✅ (shared rawCell extracted) (completed: 2026-06-28)
- [x] 3.1.2 a11y-golden spec (ST-5, ST-6) ✅ (completed: 2026-06-28)
- [x] 3.1.3 Confirm status (ST-7 mapped) ✅ (both green — maps mono + glyph-fallback; ST-7 → RD-08, no new test) (completed: 2026-06-28)
- [x] 3.2.1 golden impl reverseState case ✅ (completed: 2026-06-28)
- [x] 3.2.2 Resolve failures (engine vs adapter) ✅ (no failures — engine contracts hold) (completed: 2026-06-28)
- [x] 3.2.3 Full verify ✅ (verify 516/516, lint clean) (completed: 2026-06-28)

### Phase 4: API Stability & Supply Chain
- [x] 4.1.1 api-stability spec (ST-8) red ✅ (both red — CHANGELOG/section absent) (completed: 2026-06-28)
- [x] 4.1.2 CHANGELOG.md ✅ (Keep-a-Changelog; Unreleased + 0.1.0) (completed: 2026-06-28)
- [x] 4.1.3 README Versioning & stability ✅ (SemVer + public surface + deprecation) (completed: 2026-06-28)
- [x] 4.1.4 Spec green ✅ (completed: 2026-06-28)
- [x] 4.2.1 Full verify + lint ✅ (verify 518/518, lint clean) (completed: 2026-06-28)

### Phase 5: Documentation (techdocs)
- [x] 5.1.1 Invoke techdocs skill (architecture + API + ADRs) ✅ (overview, api-design, security, 6 ADRs, 2 guides, .vitepress/config; VitePress not installed per AR-15 runtime) (completed: 2026-06-28)
- [x] 5.1.2 Confirm docs present ✅ (coexists with acceptance-gate.md) (completed: 2026-06-28)
- [x] 5.1.3 docs-presence spec (ST-9, PF-009) ✅ (overview + API ref + ≥1 ADR + opt-in marker) (completed: 2026-06-28)
- [x] 5.2.1 Full verify + lint ✅ (verify 522/522, lint clean — docs Prettier-formatted) (completed: 2026-06-28)

### Phase 6: CI, Docs & Roadmap
- [ ] 6.1.1 Informational bench CI step
- [ ] 6.1.2 README bench/RD-10 note
- [ ] 6.1.3 CLAUDE.md update
- [ ] 6.1.4 Roadmap → Implemented + DEF-1…3 notes + close RD-09 DEF-4 (PF-007)
- [ ] 6.1.5 Final full verify + gate + lint + audit + bench

---

## Dependencies

```
Phase 1 (perf)  →  Phase 2 (tree-shake)  →  Phase 3 (a11y)  →  Phase 4 (API docs)  →  Phase 5 (techdocs)  →  Phase 6 (CI + sync)
```
Phases 1–4 are largely independent (separate test files); sequenced for clean commits.
Phase 5 (techdocs) benefits from 1–4 being done so the generated docs describe the final
state. Phase 6 wires CI + closes out.

---

## Success Criteria

1. ✅ All phases complete
2. ✅ `npm run verify` green (incl. perf-budget, treeshake, a11y-golden, api-stability)
3. ✅ `npm run bench` prints the 200×50 median/p95; informational CI step green
4. ✅ `npm run gate` still exits 0 (RD-09 gate unaffected)
5. ✅ lint + check:deps clean; `npm audit` 0 high; only `esbuild` added (dev-only prebuilt binary, no compile step)
6. ✅ a11y: NO_COLOR mono legible + ASCII fallback proven by golden tests
7. ✅ API governance: CHANGELOG + README policy; techdocs architecture + API + ADRs present
8. ✅ Deferred recorded: DEF-1 provenance · DEF-2 license guard · DEF-3 typed-array backing
9. ✅ Docs updated (README, CLAUDE.md, roadmap → Implemented); RD-09 DEF-4 resolved
10. ✅ Post-completion project re-analysis (handled by exec_plan)
