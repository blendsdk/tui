# Execution Plan: RD-06 Input System

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-06-27 (Phase 1 complete)
> **Progress**: 7/26 tasks (27%)
> **CodeOps Skills Version**: 2.0.0

## Overview

Build the pure byte→event input decoder under `src/engine/input/` on top of the
RD-01 scaffolding and RD-02 capability core: the event model, the classic-xterm
keyboard decoder with chunk-boundary carry + ESC flush, SGR mouse/wheel, bracketed
paste, focus, the structural query-response demux (sharing RD-02's grammar via an
extracted `capability/responses.ts`), the pluggable keymap, and the security
hardening — each feature phase following the mandatory **spec tests → red →
implement → green → impl tests → verify** ordering.

**🚨 Update this document after EACH completed task!**

Verify command (local): `npm run verify` (typecheck + test + build). Lint: `npm run lint`.
Tests live under `test/` (project convention). Commits: use **/gitcm** per the exec_plan
skill — this plan contains no raw git commands. **No new runtime dependencies.**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
| ----- | ----- | -------- | --------- |
| 1 | Event model + shared classifier + `query.ts` refactor | 3 | 120 min |
| 2 | Keyboard decoder core: classic keys, carry, ESC flush | 3 | 180 min |
| 3 | Mouse, wheel, paste, focus & query demux | 3 | 180 min |
| 4 | Keymap, security hardening, public API & finalization | 3 | 120 min |

**Total: ~12 sessions, ~10 hours**

---

## Phase 1: Event Model + Shared Classifier + `query.ts` Refactor

> Feature phase — spec-first. Refs: [03-01](03-01-event-model-and-types.md), [03-03](03-03-mouse-paste-focus-and-demux.md) (classifier), ST-14. PL-1, PL-2, PL-9, PL-11, PL-12, PL-13.

### Session 1.1: Specification Tests (BEFORE implementation)
| # | Task | File |
| - | ---- | ---- |
| 1.1.1 | Write spec test ST-14 (shared classifier classifies DA1/DA2/DECRPM/XTVERSION). MUST NOT read implementation. | `test/input-demux.spec.test.ts` |
| 1.1.2 | Run ST-14 — verify FAIL (red): `capability/responses.ts` absent. Confirm RD-02 query suites currently green (baseline). | — |

### Session 1.2: Implementation
| # | Task | File |
| - | ---- | ---- |
| 1.2.1 | Create `input/events.ts` (full event model, `QueryResponse`, `DecodeResult`, `DecoderState`, constants — PL-11/12/13). | `src/engine/input/events.ts` |
| 1.2.2 | Extract `capability/responses.ts` (`matchResponse` + `ResponseMatch`/`RuntimeHint`) from `query.ts`; refactor `query.ts` to import it — behaviour unchanged (PL-2). | `src/engine/capability/{responses,query}.ts` |
| 1.2.3 | Run ST-14 + **full RD-02 suite** — green (refactor preserved behaviour; RD-02 spec tests untouched). | — |

### Session 1.3: Implementation Tests & Hardening
| # | Task | File |
| - | ---- | ---- |
| 1.3.1 | Impl tests: `matchResponse` edge cases (incomplete sequence → null, DCS BEL vs `ST` terminator, non-`?2026` DECRPM). | `test/input-responses.impl.test.ts` |
| 1.3.2 | `npm run verify` + `npm run lint` clean. | — |

**Deliverables**: event model + shared classifier; `query.ts` refactored with RD-02 tests green (PL-2). Commit via /gitcm.
**Verify**: `npm run verify && npm run lint`

---

## Phase 2: Keyboard Decoder Core (Classic Keys, Carry, ESC Flush)

> Feature phase — spec-first. Refs: [03-02](03-02-keyboard-decoder-and-state.md), ST-1, ST-2, ST-10. PL-1, PL-3, PL-4, PL-6.

### Session 2.1: Specification Tests
| # | Task | File |
| - | ---- | ---- |
| 2.1.1 | Write spec tests ST-1 (classic key map), ST-2 (chunk-boundary), ST-10 (ESC flush). MUST NOT read implementation. | `test/input-keyboard.spec.test.ts`, `test/input-decoder.spec.test.ts` |
| 2.1.2 | Run — verify FAIL (red): `decoder.ts`/`keys.ts` absent. | — |

### Session 2.2: Implementation
| # | Task | File |
| - | ---- | ---- |
| 2.2.1 | Create `input/keys.ts`: classic xterm grammar (single bytes, CSI/SS3 nav + F-keys, `CSI 1;<mod>` modifiers, Alt-prefix, UTF-8 printable). | `src/engine/input/keys.ts` |
| 2.2.2 | Create `input/decoder.ts`: `createDecoderState`, the pure scan loop (carry concat, incomplete→`rest`, carry bound PL-6), `flush` (lone-ESC→escape, PL-3), `kittyFlags` branch point falling back to classic (PL-4/DEF-1). | `src/engine/input/decoder.ts` |
| 2.2.3 | Run ST-1/ST-2/ST-10 — verify PASS (green). Fix implementation, never the test. | — |

### Session 2.3: Implementation Tests & Hardening
| # | Task | File |
| - | ---- | ---- |
| 2.3.1 | Impl tests: every nav/F-key, SS3 f1–f4, modifier matrix, Ctrl-letter range, UTF-8 multibyte (incl. split-across-chunks + invalid UTF-8 dropped). | `test/input-keyboard.impl.test.ts` |
| 2.3.2 | `npm run verify` + `npm run lint` clean. | — |

**Deliverables**: classic keyboard decoding, chunk-boundary safety, ESC flush (AC-1, AC-2). Commit via /gitcm.
**Verify**: `npm run verify && npm run lint`

---

## Phase 3: Mouse, Wheel, Paste, Focus & Query Demux

> Feature phase — spec-first. Refs: [03-03](03-03-mouse-paste-focus-and-demux.md), ST-3, ST-4, ST-5, ST-6, ST-11, ST-12. PL-2, PL-5, PL-7, PL-9.

### Session 3.1: Specification Tests
| # | Task | File |
| - | ---- | ---- |
| 3.1.1 | Write spec tests ST-3 (mouse extended coords), ST-4 (wheel), ST-11 (release/drag/move), ST-5 (paste), ST-6 (query demux), ST-12 (focus). MUST NOT read implementation. | `test/input-mouse.spec.test.ts`, `test/input-paste.spec.test.ts`, `test/input-demux.spec.test.ts` |
| 3.1.2 | Run — verify FAIL (red): mouse/paste/focus/demux paths absent. | — |

### Session 3.2: Implementation
| # | Task | File |
| - | ---- | ---- |
| 3.2.1 | Create `input/mouse.ts`: SGR press/release/drag/move (1-based coords PL-11) + wheel 64–67. | `src/engine/input/mouse.ts` |
| 3.2.2 | Create `input/paste.ts`: bracketed-paste assembly + size cap (PL-5); wire focus (`CSI I/O`) and the `matchResponse` demux into the decoder scan ordering (queries→separate array, PL-9). | `src/engine/input/paste.ts`, `src/engine/input/decoder.ts` |
| 3.2.3 | Run ST-3/4/5/6/11/12 — verify PASS (green). | — |

### Session 3.3: Implementation Tests & Hardening
| # | Task | File |
| - | ---- | ---- |
| 3.3.1 | Impl tests: middle/right buttons, wheel left/right, 223/224 coord boundary; paste split across chunks, paste containing escape-like bytes, empty paste. | `test/input-mouse.impl.test.ts`, `test/input-paste.impl.test.ts` |
| 3.3.2 | `npm run verify` + `npm run lint` clean. | — |

**Deliverables**: mouse/wheel, bracketed paste, focus, structural query demux (AC-3, AC-4, AC-5, AC-6). Commit via /gitcm.
**Verify**: `npm run verify && npm run lint`

---

## Phase 4: Keymap, Security Hardening, Public API & Finalization

> Feature phase — spec-first. Refs: [03-04](03-04-keymap-and-security.md), ST-7, ST-8, ST-9, ST-13. PL-5, PL-6, PL-10.

### Session 4.1: Specification Tests
| # | Task | File |
| - | ---- | ---- |
| 4.1.1 | Write spec tests ST-7 (paste cap/truncate), ST-8 (carry bound), ST-9 (fuzz/no-log/no-crash), ST-13 (keymap lookup). MUST NOT read implementation. | `test/input-security.spec.test.ts`, `test/input-keymap.spec.test.ts` |
| 4.1.2 | Run — verify FAIL (red): keymap absent; confirm cap/bound assertions. | — |

### Session 4.2: Implementation / Integration
| # | Task | File |
| - | ---- | ---- |
| 4.2.1 | Create `input/keymap.ts` (`createKeymap` chord lookup, PL-10); enforce paste cap (PL-5) + carry bound (PL-6) in decoder/paste if not already. | `src/engine/input/keymap.ts` |
| 4.2.2 | Create `input/index.ts`; re-export input public API + types from `src/engine/index.ts`; add README "Input decoding (RD-06)" section. | `src/engine/input/index.ts`, `src/engine/index.ts`, `README.md` |
| 4.2.3 | Run ST-7/8/9/13 + full spec suite — green. | — |

### Session 4.3: Final Verification
| # | Task | File |
| - | ---- | ---- |
| 4.3.1 | Full gate: `npm run verify`, `npm run lint`, `npm run check:deps` (zero runtime deps), `npm audit`. Confirm AC-1…AC-8 covered and RD-02 suites still green. Final commit via /gitcm. | — |

**Deliverables**: keymap, security bounds verified, public API exposed; full gate green (AC-7, AC-8). Commit via /gitcm.
**Verify**: `npm run verify && npm run lint && npm run check:deps && npm audit`

---

## 🚨 Master Progress Checklist (All Phases) — MANDATORY

> After each task mark it `[x]` with a timestamp, update the Progress header, never batch.

### Phase 1: Event Model + Shared Classifier + `query.ts` Refactor
- [x] 1.1.1 Write ST-14 spec test (shared classifier) — 2026-06-27
- [x] 1.1.2 Red phase (responses.ts absent) + RD-02 green baseline — 2026-06-27
- [x] 1.2.1 Implement input/events.ts (event model + constants) — 2026-06-27
- [x] 1.2.2 Extract capability/responses.ts + refactor query.ts (PL-2) — 2026-06-27
- [x] 1.2.3 Green phase (ST-14 + full RD-02 suite green) — 2026-06-27
- [x] 1.3.1 Write responses impl tests — 2026-06-27
- [x] 1.3.2 verify + lint clean — 2026-06-27

### Phase 2: Keyboard Decoder Core
- [ ] 2.1.1 Write spec tests ST-1, ST-2, ST-10
- [ ] 2.1.2 Red phase (decoder/keys absent)
- [ ] 2.2.1 Implement keys.ts (classic grammar)
- [ ] 2.2.2 Implement decoder.ts (scan loop, carry bound, flush, kitty branch)
- [ ] 2.2.3 Green phase (ST-1/2/10 pass)
- [ ] 2.3.1 Write keyboard impl tests (nav/F-keys, modifiers, UTF-8)
- [ ] 2.3.2 verify + lint clean

### Phase 3: Mouse, Wheel, Paste, Focus & Query Demux
- [ ] 3.1.1 Write spec tests ST-3, ST-4, ST-5, ST-6, ST-11, ST-12
- [ ] 3.1.2 Red phase (mouse/paste/focus/demux absent)
- [ ] 3.2.1 Implement mouse.ts (SGR mouse + wheel)
- [ ] 3.2.2 Implement paste.ts + wire focus + demux into decoder (queries channel, PL-9)
- [ ] 3.2.3 Green phase (ST-3/4/5/6/11/12 pass)
- [ ] 3.3.1 Write mouse + paste impl tests
- [ ] 3.3.2 verify + lint clean

### Phase 4: Keymap, Security Hardening, Public API & Finalization
- [ ] 4.1.1 Write spec tests ST-7, ST-8, ST-9, ST-13
- [ ] 4.1.2 Red phase (keymap absent; cap/bound assertions)
- [ ] 4.2.1 Implement keymap.ts + enforce paste cap & carry bound
- [ ] 4.2.2 Implement input/index.ts + re-export from engine/index.ts + README section
- [ ] 4.2.3 Green phase (ST-7/8/9/13 + full spec suite)
- [ ] 4.3.1 Final full gate (verify/lint/check:deps/audit); AC-1…AC-8 covered; RD-02 green

---

## Dependencies

```
Phase 1 (event model + shared classifier + query.ts refactor)
    ↓
Phase 2 (keyboard core: classic keys + carry + ESC flush)
    ↓
Phase 3 (mouse + wheel + paste + focus + query demux)
    ↓
Phase 4 (keymap + security + public API + finalize)
```

External: **RD-07** later wires the real stdin stream + raw mode + mode-enable
sequences and drives the host-side `flush()` timer; RD-06 ships the pure decoder
+ seam only (PL-3). **DEF-1** (full CSI-u/Kitty parsing) is deferred to Phase B.
No new runtime dependencies are introduced.

---

## Success Criteria

**Feature is complete when:**
1. ✅ All phases complete; `npm run verify` exits 0 locally.
2. ✅ `npm run lint` + `npm run check:deps` clean; `npm audit` clean; zero new runtime deps.
3. ✅ AC-1…AC-8 all covered by passing ST-*; RD-02 query suites still green after the PL-2 refactor.
4. ✅ Input public API (`decode`, `flush`, `createDecoderState`, `createKeymap` + types) exported from `src/engine/index.ts`.
5. ✅ No dead code; no raw input logged (AC-8); carry/paste bounded (AC-7); register fully traced.
6. ✅ Tests under `test/` per the project convention; spec/impl split respected.
