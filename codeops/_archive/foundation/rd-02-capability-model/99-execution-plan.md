# Execution Plan: RD-02 Capability Model & Auto-Config

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-06-27
> **Progress**: 26/26 tasks (100%)
> *(Note: the original header said 24; the master checklist actually holds 26 items — 7+7+7+5. Denominator corrected during execution.)*
> **CodeOps Skills Version**: 2.0.0

## Overview

Build the terminal capability detection core under `src/engine/capability/` on top of
the RD-01 scaffolding: the model + types, the env/table/default layers with
deterministic precedence, the override API, the reason trace, the per-process cache,
and the bounded runtime-query seam + parser — each feature phase following the
mandatory **spec tests → red → implement → green → impl tests → verify** ordering.

**🚨 Update this document after EACH completed task!**

Verify command (local): `npm run verify` (typecheck + test + build). Lint: `npm run lint`.
Tests live under `test/` (project convention). Commits: use **/gitcm** per the exec_plan
skill — this plan contains no raw git commands. **No new runtime dependencies.**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
| ----- | ----- | -------- | --------- |
| 1 | Model, env, defaults, override & resolve core | 3 | 150 min |
| 2 | Known-terminal table, multiplexer, reasons & cache | 3 | 120 min |
| 3 | Runtime-query seam & bounded parser (layer 2) | 3 | 150 min |
| 4 | Security, public API & finalization | 3 | 90 min |

**Total: ~12 sessions, ~8.5 hours**

---

## Phase 1: Model, Env, Defaults, Override & Resolve Core

> Feature phase — spec-first. Refs: [03-01](03-01-capability-model-and-types.md), [03-02](03-02-detection-layers.md), ST-1…ST-10, ST-12.

### Session 1.1: Specification Tests (BEFORE implementation)
| # | Task | File |
| - | ---- | ---- |
| 1.1.1 | Write spec tests for ST-1…ST-8, ST-10, ST-12 (colorDepth env matrix incl. NO_COLOR/FORCE_COLOR precedence, override, empty-env defaults, frozen result). MUST NOT read implementation. | `test/capability-detect.spec.test.ts` |
| 1.1.2 | Run spec tests — verify FAIL (red): module absent. | — |

### Session 1.2: Implementation
| # | Task | File |
| - | ---- | ---- |
| 1.2.1 | Create `capability/profile.ts` (all types incl. `TerminalQuery`, `DeepPartial`), `capability/defaults.ts` (PL-13), `capability/env.ts` (layer 3, PL-5/PL-12). | `src/engine/capability/{profile,defaults,env}.ts` |
| 1.2.2 | Create `capability/detect.ts` (per-field resolve for layers 1/3/5 + reasons) and `capability/index.ts` (`resolveCapabilities`: deep-merge override PL-7, deep-freeze PL-9). | `src/engine/capability/{detect,index}.ts` |
| 1.2.3 | Run spec tests — verify PASS (green). Fix implementation, never the test. | — |

### Session 1.3: Implementation Tests & Hardening
| # | Task | File |
| - | ---- | ---- |
| 1.3.1 | Write impl tests: `readEnv` edges (`FORCE_COLOR=9` invalid, `LC_ALL` vs `LANG`, `COLORTERM=24bit`); `deepMerge` leaf semantics. | `test/capability-env.impl.test.ts`, `test/capability-merge.impl.test.ts` |
| 1.3.2 | `npm run verify` + `npm run lint` clean. | — |

**Deliverables**: `resolveCapabilities()` resolves colorDepth/defaults/override with reasons; frozen result (AC-1, AC-2, AC-5, AC-6 partial). Commit via /gitcm.
**Verify**: `npm run verify && npm run lint`

---

## Phase 2: Known-Terminal Table, Multiplexer, Reasons & Cache

> Feature phase — spec-first. Refs: [03-02](03-02-detection-layers.md), ST-11, ST-17, ST-18, ST-19.

### Session 2.1: Specification Tests
| # | Task | File |
| - | ---- | ---- |
| 2.1.1 | Add spec tests for ST-11 (reason trace across layers), ST-18 (iTerm2 table), ST-19 (tmux/screen multiplexer), ST-17 (cache + refresh). | `test/capability-detect.spec.test.ts` |
| 2.1.2 | Run — verify FAIL (red): table/cache absent. | — |

### Session 2.2: Implementation
| # | Task | File |
| - | ---- | ---- |
| 2.2.1 | Create `capability/table.ts` (layer 4, seed all PL-10 terminals); add multiplexer detection (env + table). | `src/engine/capability/table.ts`, `env.ts` |
| 2.2.2 | Wire layer 4 + complete reason recording into `detect.ts`; add per-process cache + `refresh` to `index.ts` (PL-14). | `src/engine/capability/{detect,index}.ts` |
| 2.2.3 | Run spec tests — verify PASS (green). | — |

### Session 2.3: Implementation Tests & Hardening
| # | Task | File |
| - | ---- | ---- |
| 2.3.1 | Impl tests: table key precedence (`TERM_PROGRAM` > `WT_SESSION` > `TERM`), unknown terminal contributes nothing. | `test/capability-table.impl.test.ts` |
| 2.3.2 | `npm run verify` + `npm run lint` clean. | — |

**Deliverables**: full layered detection with table + multiplexer + reasons + cache (AC-6 complete). Commit via /gitcm.
**Verify**: `npm run verify && npm run lint`

---

## Phase 3: Runtime-Query Seam & Bounded Parser (Layer 2)

> Feature phase — spec-first. Refs: [03-03](03-03-runtime-query-and-security.md), ST-13…ST-16.

### Session 3.1: Specification Tests
| # | Task | File |
| - | ---- | ---- |
| 3.1.1 | Write spec tests with a stub `TerminalQuery` for ST-13 (timeout/never-replies), ST-14 (demux passthrough), ST-15 (64 KB oversized → 1 KB cap), ST-16 (malformed ignored). MUST NOT read implementation. | `test/capability-query.spec.test.ts` |
| 3.1.2 | Run — verify FAIL (red): `query.ts` / layer-2 integration absent. | — |

### Session 3.2: Implementation
| # | Task | File |
| - | ---- | ---- |
| 3.2.1 | Create `capability/query.ts`: `runQueries(query, timeoutMs)` — bounded buffer (1 KB cap, PL-8), strict grammar parser (DA/secondary DA/XTVERSION/`?2026`), `Promise.race` timeout (PL-11), passthrough demux (AC-4). | `src/engine/capability/query.ts` |
| 3.2.2 | Integrate layer 2 into `detect.ts`/`index.ts`: when `options.query` present, run queries and slot parsed values at layer-2 precedence (reason `'runtime'`); absent → skip (no-op). | `src/engine/capability/{detect,index}.ts` |
| 3.2.3 | Run spec tests — verify PASS (green). | — |

### Session 3.3: Implementation Tests & Hardening
| # | Task | File |
| - | ---- | ---- |
| 3.3.1 | Impl tests: each grammar parsed; cap boundary at exactly 1024 bytes; partial-then-complete sequence; `write()` throwing falls back. | `test/capability-parser.impl.test.ts` |
| 3.3.2 | `npm run verify` + `npm run lint` clean. | — |

**Deliverables**: layer-2 seam + parser; AC-3, AC-4, AC-7 verified via stub streams. Commit via /gitcm.
**Verify**: `npm run verify && npm run lint`

---

## Phase 4: Security, Public API & Finalization

> Refs: [03-03](03-03-runtime-query-and-security.md), [01-requirements.md](01-requirements.md), ST-20, AC-8.

### Session 4.1: Specification Tests
| # | Task | File |
| - | ---- | ---- |
| 4.1.1 | Write spec test ST-20 (no env value logged at default level — capture `console.*` during resolve). | `test/capability-security.spec.test.ts` |
| 4.1.2 | Run — verify behaviour (red if any env logging exists). | — |

### Session 4.2: Implementation / Integration
| # | Task | File |
| - | ---- | ---- |
| 4.2.1 | Re-export `resolveCapabilities` + public types from `src/engine/index.ts`; add a short README "Capability detection" section (usage from 00-index). | `src/engine/index.ts`, `README.md` |
| 4.2.2 | Run ST-20 + full spec suite — green. | — |

### Session 4.3: Final Verification
| # | Task | File |
| - | ---- | ---- |
| 4.3.1 | Full gate: `npm run verify`, `npm run lint`, `npm run check:deps` (must stay zero runtime deps), `npm audit`. Confirm AC-1…AC-8 all covered. Final commit via /gitcm. | — |

**Deliverables**: public API exposed; AC-8 verified; full gate green. Commit via /gitcm.
**Verify**: `npm run verify && npm run lint && npm run check:deps && npm audit`

---

## 🚨 Master Progress Checklist (All Phases) — MANDATORY

> After each task mark it `[x]` with a timestamp, update the Progress header, never batch.

### Phase 1: Model, Env, Defaults, Override & Resolve Core
- [x] 1.1.1 Write detect spec tests (ST-1…ST-8, ST-10, ST-12) — 2026-06-27
- [x] 1.1.2 Red phase — 2026-06-27 (module absent, import fails)
- [x] 1.2.1 Implement profile/defaults/env — 2026-06-27
- [x] 1.2.2 Implement detect + resolveCapabilities (override merge, freeze) — 2026-06-27
- [x] 1.2.3 Green phase — 2026-06-27 (10/10 spec tests pass)
- [x] 1.3.1 Write env + merge impl tests — 2026-06-27
- [x] 1.3.2 verify + lint clean — 2026-06-27 (verify 48 tests pass, eslint+prettier clean)

### Phase 2: Table, Multiplexer, Reasons & Cache
- [x] 2.1.1 Write spec tests (ST-9, ST-11, ST-17, ST-18, ST-19) — 2026-06-27 (ST-9 sited here per RT-1)
- [x] 2.1.2 Red phase — 2026-06-27 (ST-9/11/18/19 fail; ST-17 cache already green from Phase 1)
- [x] 2.2.1 Implement table + multiplexer — 2026-06-27
- [x] 2.2.2 Wire layer 4 + reasons + cache/refresh — 2026-06-27 (cache from Phase 1)
- [x] 2.2.3 Green phase — 2026-06-27 (15/15 detect spec tests pass)
- [x] 2.3.1 Write table impl tests — 2026-06-27
- [x] 2.3.2 verify + lint clean — 2026-06-27 (verify 64 tests pass, eslint+prettier clean)

### Phase 3: Runtime-Query Seam & Parser
- [x] 3.1.1 Write query spec tests (ST-13…ST-16, stub stream) — 2026-06-27 (targets resolveCapabilitiesAsync + runQueries per RT-2)
- [x] 3.1.2 Red phase — 2026-06-27 (query.js absent)
- [x] 3.2.1 Implement query.ts (bounded parser, timeout, demux) — 2026-06-27
- [x] 3.2.2 Integrate layer 2 into resolve (resolveCapabilitiesAsync, RT-2) — 2026-06-27
- [x] 3.2.3 Green phase — 2026-06-27 (4/4 query spec tests; full suite 68 pass)
- [x] 3.3.1 Write parser impl tests (grammars, cap boundary) — 2026-06-27
- [x] 3.3.2 verify + lint clean — 2026-06-27 (verify 79 tests pass, eslint+prettier clean)

### Phase 4: Security, Public API & Finalization
- [x] 4.1.1 Write security spec test (ST-20) — 2026-06-27
- [x] 4.1.2 Red/behaviour check — 2026-06-27 (green: no env logging exists, AC-8 satisfied)
- [x] 4.2.1 Re-export public API + README section — 2026-06-27 (resolveCapabilities + resolveCapabilitiesAsync + types from src/engine/index.ts; README "Capability detection")
- [x] 4.2.2 Green phase — 2026-06-27 (spec suite green; added capability-public.spec.test.ts integration guard)
- [x] 4.3.1 Final full gate (verify/lint/check:deps/audit) — 2026-06-27 (verify 84/84, lint clean, check:deps OK, audit 0 vulns; AC-1…AC-8 all covered)

---

## Dependencies

```
Phase 1 (model + env + defaults + override + resolve)
    ↓
Phase 2 (table + multiplexer + reasons + cache)
    ↓
Phase 3 (query seam + bounded parser + layer-2 integration)
    ↓
Phase 4 (security + public API + finalize)
```

External: **RD-06** later supplies the real `TerminalQuery` stream; RD-02 ships the
seam + parser only (PL-1). No new runtime dependencies are introduced.

---

## Success Criteria

**Feature is complete when:**
1. ✅ All phases complete; `npm run verify` exits 0 locally.
2. ✅ `npm run lint` + `npm run check:deps` clean; `npm audit` clean; zero new runtime deps.
3. ✅ AC-1…AC-8 all covered by passing ST-* (layer-2 ACs via stub streams).
4. ✅ `resolveCapabilities` exported from `src/engine/index.ts`; result deep-frozen.
5. ✅ No dead code; no env value logged (AC-8); register fully traced.
6. ✅ Tests under `test/` per the project convention; spec/impl split respected.
