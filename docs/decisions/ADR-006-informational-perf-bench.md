# ADR-006: Informational perf bench + skippable ceiling

> **Date**: 2026-06-28
> **Status**: Accepted
> **Source**: RD-10 (non-functional), resolving RD-09 DEF-4

## Context

RD-10 sets a frame-budget target: composing + diff-serializing a 200×50 frame
should have a median ≤ 16 ms. But wall-clock timing is environment-sensitive — CI
runners are noisy and shared, and contributor machines vary widely. A hard timing
gate in CI would flake; no timing check at all would let regressions slip.

## Options Considered

### Option A: Hard-fail the 16 ms budget in CI

- **Pros**: Strongest enforcement.
- **Cons**: Flaky on shared/throttled runners; erodes trust in the suite.

### Option B: Regression-vs-stored-baseline in CI

- **Pros**: Adapts to the runner.
- **Cons**: Needs a stored baseline + tuning; heavy for a foundation library.

### Option C: Informational bench + a ceiling test that asserts off-CI only

- **Pros**: Real assertion on capable dev hardware; CI records numbers
  informationally; an opt-out (`TUI_SKIP_PERF`) covers slow local machines.
- **Cons**: No hard CI gate on timing (accepted — timing is environment-sensitive).

## Decision

**Chosen option**: Option C — `npm run bench` prints median/p95 informationally, and
`test/perf-budget.spec.test.ts` asserts the 16 ms median **off-CI only**, skipping
its hard assertion under `CI` or `TUI_SKIP_PERF`.

## Rationale

This mirrors RD-09's stance: deterministic evidence (byte-proportionality,
size-independence) is always asserted, while wall-clock timing stays informational
under CI. Off-CI on capable hardware the ceiling is a real gate; under CI the bench
step tracks regressions without flaking. The detection-budget test follows the same
skippable-timing rule. This resolves RD-09 DEF-4.

## Consequences

### Positive

- A real local perf gate without CI flake; regression numbers still tracked in CI.
- Byte-proportionality / size-independence remain deterministic, always-on oracles.

### Negative

- No hard CI failure purely on a timing regression (caught off-CI or by inspecting
  the informational numbers).

### Risks

- A slow regression could pass unnoticed if no one runs the bench — mitigated by the
  informational CI bench step printing numbers every run.
