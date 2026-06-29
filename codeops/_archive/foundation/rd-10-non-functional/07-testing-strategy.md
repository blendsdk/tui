# Testing Strategy: RD-10 Non-Functional Requirements

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

RD-10 is largely verification of cross-cutting qualities. Expectations derive from
RD-10's acceptance criteria and budgets (AR-2/AR-3/AR-12/AR-25) and the RD-04/05/02
render/detection contracts — never from running the new harnesses first. Where a
quality is already proven (output∝damage, packaging, non-TTY, audit, cross-platform),
the existing spec is **mapped**, not duplicated (AR-10).

Wall-clock assertions (ST-1, ST-3 timing) are skippable under `CI` (AR-2/AR-9);
byte-count and structural assertions always run.

## 🚨 Specification Test Cases (MANDATORY)

> Derived from `01-requirements.md`, `03-XX-*.md`, RD-10 AC-1…AC-8, and the RD-02/04/05 contracts.
> **IMMUTABLE ORACLE RULE:** do not modify these to match the implementation.

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-1  | Compose + diff-serialize a 200×50 frame, median over N warmed runs | off-CI: median ≤ 16 ms; under CI: number recorded, no hard assert | AC-1 / FR-1 / AR-2,3 |
| ST-2  | Steady-state single-cell update at the **same coordinate** on an 8×8 buffer vs a 200×50 buffer (test label `RD10-ST-2`) | emitted bytes are **byte-identical** across sizes (O(1) in screen area; serialize addresses by coordinate, not dimensions — `serialize.ts:95`) | AC-2 / FR-2 / AR-14 |
| ST-3  | `resolveCapabilitiesAsync` with a non-responding query stub whose `read()` **blocks forever** + `timeoutMs` | completes via fallback (valid profile); off-CI elapsed ∈ [`timeoutMs`·0.5, `timeoutMs`+slack] — proves the budget is the timeout, not a short-circuit | AC-3 / FR-3 / AR-12 |
| ST-4  | esbuild-bundle a one-symbol import vs an all-exports import of the built entry | one-symbol bundle is materially smaller (≤ set fraction of full) | AC-4 / FR-6 / AR-4 |
| ST-5  | `NO_COLOR`/mono: a focused cell (reverse attr) + a normal cell, via the emulator | neither cell carries colour, yet focus is distinguishable by the inverse attribute (no info lost) | AC-5 / FR-9 / AR-11 |
| ST-6  | `glyphs.boxDrawing:false`: a `box(...)` rendered through the emulator | corners/edges render as ASCII (`+ - |`), legible | AC-6 / FR-10 / AR-11 |
| ST-7  | Non-TTY / `TERM=dumb` input (mapped) | essentials gate degrades with `EssentialsNotMetError`, no crash | AC-6 / FR-10 / AR-10 |
| ST-8  | Parse `CHANGELOG.md` + README | `## [Unreleased]` + `0.1.0` entry present; README has a "Versioning & stability" section | AC-8 / FR-8 / AR-7 |
| ST-9  | Read `docs/` after techdocs generation | the architecture overview, API reference, and at least one ADR file are present (mirrors `gate.spec`'s doc-guard so generated docs can't silently rot; PF-009) | AC docs / FR-12,14 |

### Mapped (verified by existing specs — no new test, AR-10)

| Requirement | Existing oracle |
|-------------|-----------------|
| Output ∝ damage (base case) | `render-bytes-damage.spec.test.ts` (RD-09) |
| Bounded buffers | `input-fuzz.spec.test.ts` (RD-09) |
| Packaging contract (ESM/`.d.ts`/`sideEffects`/`engines`) | `packaging.spec.test.ts` ST-3…ST-7 (RD-01) |
| Non-TTY / dumb degradation (ST-7) | `safety-essentials.spec.test.ts`, `host-detect-tty.spec.test.ts` (RD-08) |
| `npm audit` clean / cross-platform CI | `.github/workflows/ci.yml` |

> **⚠️ AUTHORING RULE:** if an expected value cannot be derived from a contract/budget, register it before coding.

## Test Categories

### Specification Tests (from ST-cases)
| Test File | ST Cases | Component |
|-----------|----------|-----------|
| `perf-budget.spec.test.ts` | ST-1, ST-3 | Performance & detection budget |
| `render-bytes-damage.spec.test.ts` (extended) | ST-2 | Output ∝ damage (size-independence) |
| `treeshake.spec.test.ts` | ST-4 | Tree-shake |
| `a11y-golden.spec.test.ts` | ST-5, ST-6 | Accessibility & degradation |
| `api-stability.spec.test.ts` | ST-8 | API governance docs |
| `docs-presence.spec.test.ts` | ST-9 | techdocs output presence (overview + API reference + ADR) |

### Implementation Tests
| Test File | Description | Priority |
|-----------|-------------|----------|
| `perf-budget.impl.test.ts` | bench median/p95 math is correct (known input → known median); CI-skip branch chooses the log path | High |
| `golden-screen-helpers` (extend `golden-screen.impl.test.ts`) | `reverseState`/`isInverse` reader normalization | Med |

### Integration / Manual
| Test | Description |
|------|-------------|
| `npm run bench` (manual/CI-informational) | prints 200×50 median/p95; recorded per CI run, never fails |
| techdocs output | architecture + API reference + ADRs generated; presence checked in the docs phase |

## Verification Checklist
- [ ] ST-1…ST-8 defined with concrete input/output and traced to AC/AR
- [ ] Spec tests written before harness/impl
- [ ] Spec status confirmed (expected-green where mapping existing engine behavior, justified)
- [ ] Impl tests for the bench math + adapter reader
- [ ] `npm run verify` green; `npm run bench` runs; `npm run gate` still 0; lint/check:deps clean; `npm audit` 0 high
- [ ] No regressions in the existing suite
