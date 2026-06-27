# Execution Plan: RD-05 Color & Styling

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-06-28 00:11
> **Progress**: 9/26 tasks (35%)
> **CodeOps Skills Version**: 2.0.0

## Overview

Build the `src/engine/color/` subsystem in three feature phases plus a finalize
phase, each spec-first (spec tests → red → implement → green → impl tests →
verify). Phase 1 is the encoding core (parse/validate, redmean downsampling,
`encode`/`encodeStyle`/`styleKey`). Phase 2 adds the DOS-16 palette + theme. Phase 3
wires `encodeStyle` in as the `serialize()` default (the behavior-changing step that
updates one RD-04 impl test). Phase 4 documents and finalizes.

`Color`/`Attr` types stay in `render/types.ts` (AR-2); the `StyleEncoder` seam and
`serialize()` signature are unchanged (AR-4).

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Est. Time |
| ----- | ----- | --------- |
| 1 | Color encoding core | 120 min |
| 2 | Palette & theme | 45 min |
| 3 | Serializer integration | 60 min |
| 4 | Documentation & finalize | 30 min |

---

## Phase 1: Color encoding core

### Session 1.1: Spec tests (BEFORE implementation)

**Reference**: [03-01-color-encoding.md](03-01-color-encoding.md), [07-testing-strategy.md](07-testing-strategy.md) ST-1…ST-14

| #     | Task | File |
| ----- | ---- | ---- |
| 1.1.1 | Write `color-encode.spec.test.ts` (ST-1…ST-14) importing from `../src/engine/color/index.js` | `test/color-encode.spec.test.ts` |
| 1.1.2 | Run spec tests — verify they FAIL (red) | — |

### Session 1.2: Implementation

**Reference**: [03-01-color-encoding.md](03-01-color-encoding.md)

| #     | Task | File |
| ----- | ---- | ---- |
| 1.2.1 | `color.ts` — `Rgb`, `InvalidColorError extends TuiError`, `toRgb()` (validate/throw) | `src/engine/color/color.ts` |
| 1.2.2 | `palette.ts` — `ANSI16_REFERENCE` (reuse RD-04 values) + `rgb256(index)` reference | `src/engine/color/palette.ts` |
| 1.2.3 | `downsample.ts` — `redmean2`, `nearest256`, `nearest16` (lowest-index ties) | `src/engine/color/downsample.ts` |
| 1.2.4 | `encode.ts` — `encode`, `encodeStyle` (merged SGR, crash-safe), `styleKey`, `ColorRole` | `src/engine/color/encode.ts` |
| 1.2.5 | `color/index.ts` re-export; add the RD-05 `color/` block to `src/engine/index.ts`; run spec tests — verify PASS (green) | `src/engine/color/index.ts`, `src/engine/index.ts` |

### Session 1.3: Impl tests & hardening

| #     | Task | File |
| ----- | ---- | ---- |
| 1.3.1 | Write `color-encode.impl.test.ts` (`#rgb` expansion; every attr bit; fg/bg role codes; gray ramp; `default`→`''`; tie-break) | `test/color-encode.impl.test.ts` |
| 1.3.2 | Full verification | — |

**Deliverables**:
- [x] Depth-aware `encode`/`encodeStyle`, redmean `nearest256`/`nearest16`, `styleKey`, `InvalidColorError` implemented + exported
- [x] Malformed color throws (AC-6); the seam degrades crash-safe (AC-7); only numeric SGR emitted
- [x] All verification passing

**Verify**: `npm run verify`

---

## Phase 2: Palette & theme

### Session 2.1: Spec tests (BEFORE implementation)

**Reference**: [03-02-palette-and-theme.md](03-02-palette-and-theme.md), ST-15, ST-16

| #     | Task | File |
| ----- | ---- | ---- |
| 2.1.1 | Write `color-palette-theme.spec.test.ts` (ST-15, ST-16) | `test/color-palette-theme.spec.test.ts` |
| 2.1.2 | Run spec tests — verify they FAIL (red) | — |

### Session 2.2: Implementation

| #     | Task | File |
| ----- | ---- | ---- |
| 2.2.1 | Add the DOS-16 `PALETTE` constants to `palette.ts` (incl. `brightMagenta`) | `src/engine/color/palette.ts` |
| 2.2.2 | `theme.ts` — `ThemeRole`, `Theme`, `defaultTheme` (migrated roles) | `src/engine/color/theme.ts` |
| 2.2.3 | Re-export `PALETTE`/`defaultTheme`/`Theme`/`ThemeRole` from `color/index.ts` + `src/engine/index.ts`; run spec tests — verify PASS (green) | `src/engine/color/index.ts`, `src/engine/index.ts` |

### Session 2.3: Impl tests & hardening

| #     | Task | File |
| ----- | ---- | ---- |
| 2.3.1 | Write `color-palette-theme.impl.test.ts` (palette round-trips via `encode`; immutability) | `test/color-palette-theme.impl.test.ts` |
| 2.3.2 | Full verification | — |

**Deliverables**:
- [ ] DOS-16 `PALETTE` (16 keys) + typed `Theme` + `defaultTheme` implemented + exported
- [ ] Every palette value encodes without throwing; structures immutable
- [ ] All verification passing

**Verify**: `npm run verify`

---

## Phase 3: Serializer integration

### Session 3.1: Spec tests (BEFORE implementation)

**Reference**: [03-03-serializer-integration.md](03-03-serializer-integration.md), ST-17

| #     | Task | File |
| ----- | ---- | ---- |
| 3.1.1 | Write `color-serialize.spec.test.ts` (ST-17: 256 downsamples to `38;5;9`; truecolor still `38;2;255;0;0`) | `test/color-serialize.spec.test.ts` |
| 3.1.2 | Run spec tests — verify the 256 case FAILS (red: serialize still over-emits truecolor) | — |

### Session 3.2: Implementation (the wiring)

| #     | Task | File |
| ----- | ---- | ---- |
| 3.2.1 | Re-point `serialize.ts` default to `encodeStyle` from `../color/index.js`; remove the inline `ANSI16_RGB`/`colorToRgb`/`ATTR_SGR` (no dead code); keep `defaultEncodeStyle` exported (now depth-aware) | `src/engine/render/serialize.ts` |
| 3.2.2 | Update the RD-04 impl test `render-serialize.impl.test.ts:95` (256 → `38;5;9`; re-title) | `test/render-serialize.impl.test.ts` |
| 3.2.3 | Run spec tests — verify PASS (green); confirm RD-04 truecolor/mono oracles still green | — |
| 3.2.4 | Write `color-serialize.impl.test.ts` (16-depth downsample + malformed-color-in-cell crash safety) | `test/color-serialize.impl.test.ts` |

### Session 3.3: Verification

| #     | Task | File |
| ----- | ---- | ---- |
| 3.3.1 | Full verification — confirm no circular import; RD-02/04/06/07/08 suites green | — |

**Deliverables**:
- [ ] `serialize()` downsamples by default; seam + signature unchanged (AR-4)
- [ ] Inline color logic removed from `serialize.ts` (DRY); only the one RD-04 impl test updated (AR-3)
- [ ] All verification passing

**Verify**: `npm run verify`

---

## Phase 4: Documentation & finalize

### Session 4.1: Docs & final gate

| #     | Task | File |
| ----- | ---- | ---- |
| 4.1.1 | Document color & styling in the README (depth-aware encoding, attributes, palette/theme, validation) | `README.md` |
| 4.1.2 | Final full verification — `npm run verify`, `npm run lint`, `npm run check:deps`, `npm audit` | — |
| 4.1.3 | Mark roadmap RD-05 → ✅ Implemented (via the roadmap skill on completion) | `plans/00-roadmap.md` |

**Deliverables**:
- [ ] README documents the color layer
- [ ] All gates green (verify/lint/check:deps/audit)
- [ ] Roadmap updated

**Verify**: `npm run verify`

---

## 🚨 Master Progress Checklist (All Phases) — MANDATORY

> Mark each task `[x]` with a timestamp immediately on completion; bump the Progress
> header. Never batch updates.

### Phase 1: Color encoding core
- [x] 1.1.1 Write `color-encode.spec.test.ts` (ST-1…ST-14) ✅ (completed: 2026-06-27 23:58)
- [x] 1.1.2 Run spec tests — verify FAIL (red) ✅ (completed: 2026-06-27 23:58)
- [x] 1.2.1 `color.ts` (`Rgb`, `InvalidColorError`, `toRgb`) ✅ (completed: 2026-06-28 00:05)
- [x] 1.2.2 `palette.ts` (`ANSI16_REFERENCE`, `rgb256`) ✅ (completed: 2026-06-28 00:05)
- [x] 1.2.3 `downsample.ts` (`redmean2`, `nearest256`, `nearest16`) ✅ (completed: 2026-06-28 00:05)
- [x] 1.2.4 `encode.ts` (`encode`, `encodeStyle`, `styleKey`) ✅ (completed: 2026-06-28 00:06)
- [x] 1.2.5 `color/index.ts` + top-level re-export; spec tests PASS (green) ✅ (completed: 2026-06-28 00:07)
- [x] 1.3.1 Write `color-encode.impl.test.ts` ✅ (completed: 2026-06-28 00:10)
- [x] 1.3.2 Full verification ✅ (completed: 2026-06-28 00:11)

### Phase 2: Palette & theme
- [ ] 2.1.1 Write `color-palette-theme.spec.test.ts` (ST-15, ST-16)
- [ ] 2.1.2 Run spec tests — verify FAIL (red)
- [ ] 2.2.1 DOS-16 `PALETTE` in `palette.ts`
- [ ] 2.2.2 `theme.ts` (`ThemeRole`, `Theme`, `defaultTheme`)
- [ ] 2.2.3 Re-export; spec tests PASS (green)
- [ ] 2.3.1 Write `color-palette-theme.impl.test.ts`
- [ ] 2.3.2 Full verification

### Phase 3: Serializer integration
- [ ] 3.1.1 Write `color-serialize.spec.test.ts` (ST-17)
- [ ] 3.1.2 Run spec tests — verify FAIL (red)
- [ ] 3.2.1 Re-point `serialize.ts` default to `encodeStyle`; remove inline color logic
- [ ] 3.2.2 Update `render-serialize.impl.test.ts:95` (256 → `38;5;9`)
- [ ] 3.2.3 Spec tests PASS (green); RD-04 oracles green
- [ ] 3.2.4 Write `color-serialize.impl.test.ts`
- [ ] 3.3.1 Full verification

### Phase 4: Documentation & finalize
- [ ] 4.1.1 README: document the color layer
- [ ] 4.1.2 Final full verify + lint + check:deps + audit
- [ ] 4.1.3 Roadmap RD-05 → ✅ Implemented

---

## Dependencies

```
Phase 1 (encoding core — parse/validate, downsample, encode)
    ↓
Phase 2 (palette & theme — app-facing color constants)
    ↓
Phase 3 (serializer integration — make encodeStyle the default)
    ↓
Phase 4 (docs & finalize)
```

## Success Criteria

1. ✅ All phases complete; `npm run verify` green.
2. ✅ AC-1…AC-7 covered by passing ST-1…ST-17.
3. ✅ No warnings/errors (lint + check:deps + audit clean).
4. ✅ No dead code — inline color logic removed from `serialize.ts`.
5. ✅ Security hardened — malformed colors throw + emit no bytes; seam degrades; only numeric SGR.
6. ✅ Documentation updated (README + roadmap).
7. ✅ RD-02/RD-04/RD-06/RD-07/RD-08 suites still green (only the one RD-04 impl test updated, AR-3).
