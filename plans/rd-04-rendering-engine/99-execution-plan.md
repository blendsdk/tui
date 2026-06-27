# Execution Plan: RD-04 Rendering Engine

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-06-27 (✅ all phases complete)
> **Progress**: 24/24 tasks (100%)
> **CodeOps Skills Version**: 2.0.0

## Overview

Build the terminal output engine under `src/engine/render/` on top of RD-01
scaffolding and the RD-02 capability profile: the width-correct cell buffer, the
pure damage-diff serializer with synchronized output and a `StyleEncoder` seam,
capability-driven glyph fallback, the provisional shared sanitizer, the OSC
feature surface with the `notify()` ladder, and cursor control — each feature
phase following **spec tests → red → implement → green → impl tests → verify**.

**🚨 Update this document after EACH completed task!**

Verify command (local): `npm run verify` (typecheck + test + build). Lint: `npm run lint`.
Tests live under `test/`. Commits: use **/gitcm** per the exec_plan skill — this plan
contains no raw git commands. **No new runtime dependencies.**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
| ----- | ----- | -------- | --------- |
| 1 | Cell & buffer model + character width | 3 | 150 min |
| 2 | Damage-diff serializer + style seam + sync + glyph fallback | 3 | 210 min |
| 3 | Sanitizer + OSC features + `notify()` ladder + cursor | 3 | 180 min |
| 4 | Public API & finalization | 2 | 90 min |

**Total: ~11 sessions, ~10.5 hours**

---

## Phase 1: Cell & Buffer Model + Character Width

> Feature phase — spec-first. Refs: [03-01](03-01-cell-and-buffer-model.md), ST-3. PL-3, PL-7, PL-10, PL-15, PL-17.

### Session 1.1: Specification Tests
| # | Task | File |
| - | ---- | ---- |
| 1.1.1 | Write spec test ST-3 (wide CJK → lead `width:2` + continuation `width:0`; `text()` advances to col 2). MUST NOT read implementation. | `test/render-buffer.spec.test.ts` |
| 1.1.2 | Run ST-3 — verify FAIL (red): `render/` absent. | — |

### Session 1.2: Implementation
| # | Task | File |
| - | ---- | ---- |
| 1.2.1 | Create `render/types.ts`: `Color`, `Ansi16Name`, `AttrMask`, `Attr`, `Style`, `Cell` (PL-7, PL-15). | `src/engine/render/types.ts` |
| 1.2.2 | Create `render/width.ts`: `charWidth(codepoint, widthMode)` with documented EAW W/F + emoji + ambiguous ranges (PL-10). | `src/engine/render/width.ts` |
| 1.2.3 | Create `render/buffer.ts`: `ScreenBuffer` (`set/get/fillRect/text/box/shadow/rows`), width-correct `set`/`text` (PL-17). Run ST-3 — green. | `src/engine/render/buffer.ts` |

### Session 1.3: Implementation Tests & Hardening
| # | Task | File |
| - | ---- | ---- |
| 1.3.1 | Impl tests: OOB clipping, overwrite-half-wide-glyph clears orphan, wide-at-last-column clips, width boundary code points. | `test/render-buffer.impl.test.ts`, `test/render-width.impl.test.ts` |
| 1.3.2 | `npm run verify` + `npm run lint` clean. | — |

**Deliverables**: width-correct cell buffer (AC-2). Commit via /gitcm.
**Verify**: `npm run verify && npm run lint`

---

## Phase 2: Damage-Diff Serializer + Style Seam + Sync + Glyph Fallback

> Feature phase — spec-first. Refs: [03-02](03-02-diff-serializer.md), [03-03](03-03-glyph-fallback.md), ST-1, ST-2, ST-4, ST-5, ST-9, ST-11, ST-13. PL-1, PL-5, PL-6, PL-9, PL-13, PL-14.

### Session 2.1: Specification Tests
| # | Task | File |
| - | ---- | ---- |
| 2.1.1 | Write spec ST-1 (single-cell diff <32B), ST-2 (zero unchanged), ST-4 (sync wrap), ST-9 (run-merge), ST-13 (resize→full), ST-5/ST-11 (glyph fallback). MUST NOT read implementation. | `test/render-serialize.spec.test.ts`, `test/render-glyphs.spec.test.ts` |
| 2.1.2 | Run — verify FAIL (red): serializer/glyphs absent. | — |

### Session 2.2: Implementation
| # | Task | File |
| - | ---- | ---- |
| 2.2.1 | Create `render/ansi.ts` (cursorTo, SGR reset, `?2026` sync) + `render/glyphs.ts` (`fallbackGlyph`, PL-9). | `src/engine/render/ansi.ts`, `src/engine/render/glyphs.ts` |
| 2.2.2 | Create `render/serialize.ts`: pure `serialize(current, previous, options)` damage diff + run-merge + sync wrap + minimal default `StyleEncoder` (PL-1/5/6/13/14). | `src/engine/render/serialize.ts` |
| 2.2.3 | Run ST-1/2/4/5/9/11/13 — verify PASS (green). Fix code, never the test. | — |

### Session 2.3: Implementation Tests & Hardening
| # | Task | File |
| - | ---- | ---- |
| 2.3.1 | Impl tests: multi-row diff, run broken by unchanged cell, full first paint (`previous===null`), mono vs truecolor default encoder, injected custom encoder, every box/block glyph fallback. | `test/render-serialize.impl.test.ts`, `test/render-glyphs.impl.test.ts` |
| 2.3.2 | `npm run verify` + `npm run lint` clean. | — |

**Deliverables**: damage-diff serializer, sync output, glyph fallback (AC-1, AC-3, AC-4, AC-6). Commit via /gitcm.
**Verify**: `npm run verify && npm run lint`

---

## Phase 3: Sanitizer + OSC Features + `notify()` Ladder + Cursor

> Feature phase — spec-first. Refs: [03-04](03-04-osc-sanitizer-cursor.md), ST-6, ST-7, ST-8, ST-10, ST-12, ST-14. PL-2, PL-8, PL-11, PL-12, PL-16.

### Session 3.1: Specification Tests
| # | Task | File |
| - | ---- | ---- |
| 3.1.1 | Write spec ST-14 (sanitize unit), ST-8 (all text paths sanitized), ST-7 (notify injection neutralized), ST-6 (notify ladder), ST-12 (clipboard base64), ST-10 (cursor). MUST NOT read implementation. | `test/render-security.spec.test.ts`, `test/render-osc.spec.test.ts` |
| 3.1.2 | Run — verify FAIL (red): sanitize/osc/cursor absent. | — |

### Session 3.2: Implementation
| # | Task | File |
| - | ---- | ---- |
| 3.2.1 | Create `render/sanitize.ts` (strip ESC/BEL/ST/C0/C1, PL-2/16) + `render/cursor.ts` (show/hide/to, PL-8). | `src/engine/render/sanitize.ts`, `src/engine/render/cursor.ts` |
| 3.2.2 | Create `render/osc.ts`: `hyperlink`/`setClipboard`/`setTitle`/`bell`/`notify` (capability ladder), every text arg sanitized (PL-11/12). | `src/engine/render/osc.ts` |
| 3.2.3 | Run ST-6/7/8/10/12/14 — verify PASS (green). | — |

### Session 3.3: Implementation Tests & Hardening
| # | Task | File |
| - | ---- | ---- |
| 3.3.1 | Impl tests: each OSC unsupported-capability path, notify priority when multiple flags set, base64 of multibyte, ST in `\x9c` and `ESC \` forms, tab/newline preserved. | `test/render-osc.impl.test.ts`, `test/render-sanitize.impl.test.ts` |
| 3.3.2 | `npm run verify` + `npm run lint` clean. | — |

**Deliverables**: sanitizer (security boundary), OSC features, notify ladder, cursor (AC-5, AC-7, AC-8). Commit via /gitcm.
**Verify**: `npm run verify && npm run lint`

---

## Phase 4: Public API & Finalization

> Finalization phase. Refs: [00-index](00-index.md), [01-requirements](01-requirements.md). PL-4, PL-14.

### Session 4.1: Public API & Integration
| # | Task | File |
| - | ---- | ---- |
| 4.1.1 | Create `render/index.ts`; re-export the render public API + types from `src/engine/index.ts`; add a README "Rendering (RD-04)" section. | `src/engine/render/index.ts`, `src/engine/index.ts`, `README.md` |
| 4.1.2 | Run the full spec suite — green; confirm AC-8's `text`-via-buffer+serialize path routes through `sanitize`. | — |

### Session 4.2: Final Verification
| # | Task | File |
| - | ---- | ---- |
| 4.2.1 | Full gate: `npm run verify`, `npm run lint`, `npm run check:deps` (zero runtime deps), `npm audit`. Confirm AC-1…AC-8 covered and RD-02/RD-06 suites still green. Final commit via /gitcm. | — |

**Deliverables**: public API exposed; full gate green. Commit via /gitcm.
**Verify**: `npm run verify && npm run lint && npm run check:deps && npm audit`

---

## 🚨 Master Progress Checklist (All Phases) — MANDATORY

> After each task mark it `[x]` with a timestamp, update the Progress header, never batch.

### Phase 1: Cell & Buffer Model + Width
- [x] 1.1.1 Write ST-3 spec test (wide glyph width-correctness) — 2026-06-27
- [x] 1.1.2 Red phase (render/ absent) — 2026-06-27
- [x] 1.2.1 Implement render/types.ts (Color/AttrMask/Cell) — 2026-06-27
- [x] 1.2.2 Implement render/width.ts (charWidth + ranges) — 2026-06-27
- [x] 1.2.3 Implement render/buffer.ts (ScreenBuffer) + ST-3 green — 2026-06-27
- [x] 1.3.1 Write buffer + width impl tests — 2026-06-27
- [x] 1.3.2 verify + lint clean — 2026-06-27

### Phase 2: Serializer + Seam + Sync + Glyph Fallback
- [x] 2.1.1 Write spec ST-1, ST-2, ST-4, ST-5, ST-9, ST-11, ST-13 — 2026-06-27
- [x] 2.1.2 Red phase (serializer/glyphs absent) — 2026-06-27
- [x] 2.2.1 Implement render/ansi.ts + render/glyphs.ts — 2026-06-27
- [x] 2.2.2 Implement render/serialize.ts (diff + default encoder + sync) — 2026-06-27
- [x] 2.2.3 Green phase (ST-1/2/4/5/9/11/13 pass) — 2026-06-27
- [x] 2.3.1 Write serialize + glyphs impl tests — 2026-06-27
- [x] 2.3.2 verify + lint clean — 2026-06-27

### Phase 3: Sanitizer + OSC + Cursor
- [x] 3.1.1 Write spec ST-6, ST-7, ST-8, ST-10, ST-12, ST-14 — 2026-06-27
- [x] 3.1.2 Red phase (sanitize/osc/cursor absent) — 2026-06-27
- [x] 3.2.1 Implement render/sanitize.ts + render/cursor.ts — 2026-06-27
- [x] 3.2.2 Implement render/osc.ts (OSC features + notify ladder) — 2026-06-27
- [x] 3.2.3 Green phase (ST-6/7/8/10/12/14 pass) — 2026-06-27
- [x] 3.3.1 Write osc + sanitize impl tests — 2026-06-27
- [x] 3.3.2 verify + lint clean — 2026-06-27

### Phase 4: Public API & Finalization
- [x] 4.1.1 Implement render/index.ts + re-export from engine/index.ts + README — 2026-06-27
- [x] 4.1.2 Full spec suite green; AC-8 public text-path confirmed — 2026-06-27
- [x] 4.2.1 Final full gate (verify/lint/check:deps/audit); AC-1…AC-8 covered; RD-02/RD-06 green — 2026-06-27

---

## Dependencies

```
Phase 1 (cell & buffer model + width)
    ↓
Phase 2 (damage-diff serializer + style seam + sync + glyph fallback)
    ↓
Phase 3 (sanitizer + OSC features + notify ladder + cursor)
    ↓
Phase 4 (public API + finalize)
```

External seams: **RD-05** later injects the full depth-aware `StyleEncoder` (PL-1);
**RD-08** later owns the canonical `sanitize()` (PL-2/16); **RD-07** later holds the
previous frame and performs the actual `write()` (PL-5). **DEF-1** (cursor shape) and
**DEF-2** (typed-array backing) are deferred. No new runtime dependencies.

---

## Success Criteria

**Feature is complete when:**
1. ✅ All phases complete; `npm run verify` exits 0 locally.
2. ✅ `npm run lint` + `npm run check:deps` clean; `npm audit` clean; zero new runtime deps.
3. ✅ AC-1…AC-8 all covered by passing ST-*; RD-02/RD-06 suites still green.
4. ✅ Render public API (`ScreenBuffer`, `serialize`, `sanitize`, OSC features, `cursor`,
   `charWidth` + types) exported from `src/engine/index.ts`.
5. ✅ Every text-accepting output path routes through `sanitize` (AC-8); no app text logged.
6. ✅ No dead code; tests under `test/` per convention; spec/impl split respected; register fully traced.
