# Execution Plan: RD-09 Testing Strategy & Acceptance Gate

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-06-28 (Phase 5 complete)
> **Progress**: 37/41 tasks (90%) — denominator corrected to the actual checklist count (41, not the planner's estimate of 34)
>
> **Runtime deviation (2026-06-28):** shared test helpers were extracted into
> non-test modules — `test/input-corpus-helpers.ts` and `test/golden-screen-helpers.ts`
> (mirroring the existing `test/host-doubles.ts` convention) — instead of living
> inside the `*.spec.test.ts` files. Reason: importing helpers from a `*.spec.test.ts`
> into a `*.impl.test.ts` re-registered the spec's `test()` calls, running them twice.
> The helper modules contain no `test()` calls, so each suite registers once. No
> behaviour change; same public helpers (hexToBytes/splitChunks/loadCorpusFiles;
> makeTerm/feed/readCell).
> **CodeOps Skills Version**: 2.0.0

## Overview

Build the missing test tiers and the go/no-go gate for the `@blendsdk/tui` foundation,
spec-first, on Linux. The existing 407 Tier-1 tests are kept as-is and mapped (AR-8); this
plan adds the input corpus, golden-screen tier, extended no-node-pty Tier-3, fuzz harness,
byte-proportionality benchmark, and the acceptance gate (`docs/acceptance-gate.md` +
`npm run gate`). Cross-platform/manual/real-PTY/timing concerns are deferred (DEF-1…DEF-4).

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                                  | Sessions | Est. Time |
| ----- | -------------------------------------- | -------- | --------- |
| 1     | Input Corpus (Tier 1)                  | 3        | 90–120 min |
| 2     | Golden Screen (Tier 2)                 | 3        | 120–150 min |
| 3     | Tier-3 PTY-Style Integration           | 2        | 90–120 min |
| 4     | Fuzz & Byte-Proportionality            | 3        | 90–120 min |
| 5     | Acceptance Gate (doc + runner)         | 3        | 90–120 min |
| 6     | Documentation & Roadmap Sync           | 1        | 30–45 min  |

**Total: ~15 sessions, ~8.5–11.5 hours**

---

## Phase 1: Input Corpus (Tier 1)

**Reference**: [03-01-input-corpus.md](03-01-input-corpus.md) · ST-1…ST-7

### Session 1.1: Specification Tests
| #     | Task                                                                                          | File |
| ----- | -------------------------------------------------------------------------------------------- | ---- |
| 1.1.1 | Author corpus fixtures from the RD-06 contract (keyboard/mouse/wheel/paste/responses), hex-in-JSON | `test/fixtures/input-corpus/*.json` |
| 1.1.2 | Write the corpus spec runner (load → hexToBytes → chunked decode/flush → deepEqual) covering ST-1…ST-7 | `test/input-corpus.spec.test.ts` |
| 1.1.3 | Run spec tests — confirm status (red, or expected-green vs existing decoder with justification) | — |

### Session 1.2: Implementation
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 1.2.1 | Implement the runner helpers (`hexToBytes` with malformed-hex rejection, `splitChunks`) | `test/input-corpus.spec.test.ts` |
| 1.2.2 | Resolve any spec failures by fixing the **engine** (not the fixtures) if the fixture matches the contract; else fix the fixture authoring bug | (as needed) |
| 1.2.3 | Run spec tests — green                                               | — |

### Session 1.3: Impl Tests & Hardening
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 1.3.1 | Impl tests: malformed hex rejection, empty corpus file, single-vs-multi chunk equivalence | `test/input-corpus.impl.test.ts` |
| 1.3.2 | Full `npm run verify`                                                 | — |

**Verify**: `npm run verify`

---

## Phase 2: Golden Screen (Tier 2)

**Reference**: [03-02-golden-screen.md](03-02-golden-screen.md) · ST-8…ST-11

### Session 2.1: Specification Tests
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 2.1.1 | Add `@xterm/headless` dev dep; verify it is pure-JS (no binding.gyp) and `npm audit` clean | `package.json` |
| 2.1.2 | Write golden spec across 4 depths × {full repaint, single-cell, CJK row}, asserting via the emulator adapter (ST-8…ST-11); expectations from the render contract | `test/golden-screen.spec.test.ts` |
| 2.1.3 | Run spec tests — confirm status (red / expected-green w/ justification) | — |

### Session 2.2: Implementation
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 2.2.1 | Implement the emulator adapter (`feed`, `readCell` normalization) | `test/golden-screen.spec.test.ts` (or shared helper) |
| 2.2.2 | Resolve failures by fixing the engine if the contract is violated; else fix the adapter | (as needed) |
| 2.2.3 | Run spec tests — green                                               | — |

### Session 2.3: Impl Tests & Hardening
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 2.3.1 | Impl tests: adapter normalization edge cases (empty cell, wide-trailing cell, default colours) | `test/golden-screen.impl.test.ts` |
| 2.3.2 | Full `npm run verify` + `npm run check:deps`                          | — |

**Verify**: `npm run verify && npm run check:deps`

---

## Phase 3: Tier-3 PTY-Style Integration

**Reference**: [03-03-pty-integration.md](03-03-pty-integration.md) · ST-12…ST-16

### Session 3.1: Specification (e2e) Tests
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 3.1.1 | Author the e2e child scaffold (alt-screen + mouse host) reusing the `host-signals.e2e` pattern | `test/host-tier3.e2e.test.ts` |
| 3.1.2 | Write the cases ST-12…ST-16 (enter sequences during run; restore on normal/throw/SIGTERM/SIGHUP), reading the expected mode codes from the RD-07 host `modes` contract | `test/host-tier3.e2e.test.ts` |
| 3.1.3 | Run the e2e file — confirm status                                    | — |

### Session 3.2: Implementation & Hardening
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 3.2.1 | Make all cases pass; ensure `try/finally` child kill + temp-dir cleanup (no leaks) | `test/host-tier3.e2e.test.ts` |
| 3.2.2 | Resolve any restore-sequence gaps by fixing the **host** (not the test) | (as needed) |
| 3.2.3 | Run the e2e explicitly + full `npm run verify` (e2e stays out of the unit glob) | — |

**Verify**: `npx tsx --test test/host-tier3.e2e.test.ts && npm run verify`

---

## Phase 4: Fuzz & Byte-Proportionality

**Reference**: [03-04-fuzz-and-perf.md](03-04-fuzz-and-perf.md) · ST-17…ST-21

### Session 4.1: Specification Tests
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 4.1.1 | Write fuzz spec: seeded PRNG + adversarial chunks → no throw + bounded state (ST-17, ST-18) | `test/input-fuzz.spec.test.ts` |
| 4.1.2 | Write byte-proportionality spec: no-change / single-cell / full-repaint relations (ST-20, ST-21) | `test/render-bytes-damage.spec.test.ts` |
| 4.1.3 | Run spec tests — confirm status                                     | — |

### Session 4.2: Implementation
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 4.2.1 | Implement the in-repo PRNG (mulberry32), `SEEDS`, `randomBytes`, and the bounded-state probe | `test/input-fuzz.spec.test.ts` |
| 4.2.2 | Resolve any throw / unbounded-growth by fixing the **decoder** (not the test); pin a failing seed as a corpus case | (as needed) |
| 4.2.3 | Run spec tests — green                                               | — |

### Session 4.3: Impl Tests & Hardening
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 4.3.1 | Impl tests: PRNG determinism (ST-19); a pinned adversarial case      | `test/input-fuzz.impl.test.ts` |
| 4.3.2 | Full `npm run verify`                                                 | — |

**Verify**: `npm run verify`

---

## Phase 5: Acceptance Gate (doc + runner)

**Reference**: [03-05-acceptance-gate.md](03-05-acceptance-gate.md) · ST-22…ST-25

### Session 5.1: Specification Tests
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 5.1.1 | Write `gate.spec.test.ts`: parse the gate doc table — 11 criteria present, non-deferred name existing test files, script↔doc map agreement (ST-22…ST-24) | `test/gate.spec.test.ts` |
| 5.1.2 | Run spec tests — red (doc + script not yet present)                  | — |

### Session 5.2: Implementation
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 5.2.1 | Write `docs/acceptance-gate.md` (criteria→evidence table, PASS/MANUAL/DEFERRED, DEF-n refs, RD-03 matrix note) | `docs/acceptance-gate.md` |
| 5.2.2 | Write `scripts/gate.mjs` (pure-Node ESM aggregator) + add `"gate"` npm script | `scripts/gate.mjs`, `package.json` |
| 5.2.3 | Run `gate.spec.test.ts` — green; run `npm run gate` (ST-25) — exits 0, reports per criterion | — |

### Session 5.3: Hardening
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 5.3.1 | Confirm no doc↔script drift; deferred criteria print DEFERRED (not FAIL) | — |
| 5.3.2 | Full `npm run verify` + `npm run gate`                                | — |

**Verify**: `npm run verify && npm run gate`

---

## Phase 6: Documentation & Roadmap Sync

**Reference**: [00-index.md](00-index.md)

### Session 6.1: Docs
| #     | Task                                                                  | File |
| ----- | -------------------------------------------------------------------- | ---- |
| 6.1.1 | Add a README "Testing & acceptance gate (RD-09)" section (tiers, `npm run gate`, deferrals) | `README.md` |
| 6.1.2 | Update CLAUDE.md (commands: `gate`; structure: `docs/`, new tests, `scripts/gate.mjs`; overview RD-09) | `CLAUDE.md` |
| 6.1.3 | Roadmap: RD-09 → ✅ Implemented with notes + DEF-1…DEF-4; advance Milestone A gate status | `plans/00-roadmap.md` |
| 6.1.4 | Final full `npm run verify && npm run gate && npm run lint && npm run check:deps && npm audit` | — |

**Verify**: `npm run verify && npm run gate && npm run lint`

---

## 🚨 Master Progress Checklist (All Phases) — MANDATORY

> Update immediately after each task: `- [x] N.N.N … ✅ (completed: YYYY-MM-DD HH:MM)`, bump the Progress header.

### Phase 1: Input Corpus
- [x] 1.1.1 Author corpus fixtures (hex-in-JSON) ✅ (completed: 2026-06-28) — keyboard/mouse/wheel/paste/responses (+`expectedQueries`, per-case `pasteCap`)
- [x] 1.1.2 Corpus spec runner (ST-1…ST-7) ✅ (completed: 2026-06-28)
- [x] 1.1.3 Confirm spec status (expected-green: exercises the already-built RD-06 decoder, AR-8) ✅ (completed: 2026-06-28) — 57/57
- [x] 1.2.1 Runner helpers (hexToBytes + splitChunks + loadCorpusFiles) ✅ (completed: 2026-06-28)
- [x] 1.2.2 Resolve failures (none — corpus matched the contract; no engine fix needed) ✅ (completed: 2026-06-28)
- [x] 1.2.3 Spec green ✅ (completed: 2026-06-28)
- [x] 1.3.1 Corpus impl tests ✅ (completed: 2026-06-28) — malformed hex, range checks, empty file, chunk equivalence, queries channel
- [x] 1.3.2 Full verify ✅ (completed: 2026-06-28) — 529/529, build clean

### Phase 2: Golden Screen
- [x] 2.1.1 Add `@xterm/headless` dev dep (verify pure-JS + audit) ✅ (2026-06-28) — v6.0.0, no binding.gyp/.node, check:deps OK, 0 vulns
- [x] 2.1.2 Golden spec (4 depths × 3 cases, ST-8…ST-11) ✅ (2026-06-28)
- [x] 2.1.3 Confirm spec status (expected-green: exercises built render/RD-05 chain) ✅ (2026-06-28) — 12/12
- [x] 2.2.1 Emulator adapter (feed/readCell) ✅ (2026-06-28) — in `golden-screen-helpers.ts` (CJS default-import; cell→mode/value normalization)
- [x] 2.2.2 Resolve failures (one test-authoring fix: sentinel for the combining-mark spill check; no engine change) ✅ (2026-06-28)
- [x] 2.2.3 Spec green ✅ (2026-06-28)
- [x] 2.3.1 Golden impl tests (empty cell, wide-trailing, default colours) ✅ (2026-06-28)
- [x] 2.3.2 Full verify + check:deps ✅ (2026-06-28) — 487/487, build + check:deps clean

### Phase 3: Tier-3 Integration
- [x] 3.1.1 e2e child scaffold (alt-screen + mouse) ✅ (2026-06-28) — corrected `mouse` override to a MouseCaps object (PF-003)
- [x] 3.1.2 Cases ST-12…ST-16 ✅ (2026-06-28) — enter sequences during run; restore on normal/throw/SIGTERM/SIGHUP
- [x] 3.1.3 Confirm e2e status ✅ (2026-06-28)
- [x] 3.2.1 Make cases pass + leak-free cleanup (`finally` rmSync + SIGKILL guard) ✅ (2026-06-28)
- [x] 3.2.2 Resolve restore gaps — none in the host; the host's SIGHUP path was already correct (verified identical to SIGTERM in signals.ts:87). The only fix was in the **harness**: the `tsx` bin wrapper does not forward SIGHUP, so the child is run as `node --import tsx <file>` to deliver every signal directly. ✅ (2026-06-28)
- [x] 3.2.3 e2e (5/5) + full verify (487/487) ✅ (2026-06-28)

### Phase 4: Fuzz & Perf
- [x] 4.1.1 Fuzz spec (ST-17, ST-18) ✅ (2026-06-28) — per-seed no-throw + bounded state
- [x] 4.1.2 Byte-proportionality spec (ST-20, ST-21) ✅ (2026-06-28) — no-change empty; single ≪ full/10
- [x] 4.1.3 Confirm spec status (expected-green: decoder already bounded) ✅ (2026-06-28)
- [x] 4.2.1 PRNG + seeds + bounded probe ✅ (2026-06-28) — in `input-fuzz-helpers.ts` (mulberry32, SEEDS, makeChunk, stateSize)
- [x] 4.2.2 Resolve throw/unbounded (none — decoder caps carry at 1024 and paste at the cap) ✅ (2026-06-28)
- [x] 4.2.3 Spec green ✅ (2026-06-28)
- [x] 4.3.1 Fuzz impl tests (ST-19 + pinned unterminated-paste-flood case) ✅ (2026-06-28)
- [x] 4.3.2 Full verify ✅ (2026-06-28) — 499/499, build + lint clean

### Phase 5: Acceptance Gate
- [x] 5.1.1 `gate.spec.test.ts` (ST-22…ST-24) ✅ (2026-06-28) — imports STEPS/DEFERRED/CRITERIA from gate.mjs; parses the doc table
- [x] 5.1.2 Spec red (gate.mjs/doc absent → ERR_MODULE_NOT_FOUND) ✅ (2026-06-28)
- [x] 5.2.1 `docs/acceptance-gate.md` ✅ (2026-06-28) — 11-criterion table, canonical numbering, DEF-1…DEF-4, matrix note
- [x] 5.2.2 `scripts/gate.mjs` + `gate` script ✅ (2026-06-28) — pure-Node ESM, exports STEPS/DEFERRED/CRITERIA, side-effect-free import
- [x] 5.2.3 Spec green + `npm run gate` (ST-25) ✅ (2026-06-28) — gate exits 0: 9 PASS, 2 DEFERRED (6, 9)
- [x] 5.3.1 No doc↔script drift (gate.spec ST-24); deferred prints DEFERRED ✅ (2026-06-28)
- [x] 5.3.2 Full verify (502/502) + gate (exit 0) ✅ (2026-06-28)

### Phase 6: Docs & Roadmap
- [ ] 6.1.1 README RD-09 section
- [ ] 6.1.2 CLAUDE.md update
- [ ] 6.1.3 Roadmap → Implemented + DEF notes
- [ ] 6.1.4 Final full verify + gate + lint + audit

---

## Dependencies

```
Phase 1 (corpus)
    ↓
Phase 2 (golden)            ← independent of 1, but sequenced for clean commits
    ↓
Phase 3 (tier-3 e2e)        ← independent; reuses host-signals.e2e pattern
    ↓
Phase 4 (fuzz + perf)       ← independent
    ↓
Phase 5 (gate)              ← depends on 1–4 existing (it aggregates them)
    ↓
Phase 6 (docs + roadmap)
```

Phases 1–4 are technically independent; Phase 5's `gate.spec` asserts the test files from
1–4 exist, so 5 runs last. Phase 6 closes out.

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ `npm run verify` passing (incl. corpus, golden, fuzz, bytes∝damage)
3. ✅ `npm run gate` exits 0 — required criteria PASS, deferred DEFERRED
4. ✅ No warnings/errors; lint + check:deps clean; `npm audit` 0 high
5. ✅ No dead code; no native dep added (only `@xterm/headless`, pure-JS)
6. ✅ No regressions in the existing 407 tests
7. ✅ Security hardened — fuzz no-crash/bounded, malformed-hex rejected, no-secret-logging mapped
8. ✅ Documentation updated (README, CLAUDE.md, roadmap, `docs/acceptance-gate.md`)
9. ✅ Post-completion project re-analysis (handled by the exec_plan skill)
