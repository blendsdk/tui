# RD-10: Non-Functional Requirements

> **Document**: RD-10-non-functional.md
> **Status**: Draft
> **Created**: 2026-06-27
> **Project**: @blendsdk/tui (Foundation)
> **Depends On**: all
> **CodeOps Skills Version**: 2.0.0

---

## Feature Overview

The cross-cutting qualities the foundation must hold regardless of which component is
being built: performance, cross-platform reach, API stability, packaging, accessibility/
degradation, documentation, and supply-chain integrity. These are easy to forget and are
gathered here as first-class, testable requirements.

---

## Functional Requirements

### Must Have (Performance)
- [ ] **Frame budget**: composing + diff-serializing a full **200×50** frame completes in **≤ 16 ms** on a reference dev machine (one frame at 60 fps).
- [ ] **Output ∝ damage**: a steady-state single-cell change emits output bytes bounded by a small constant (not proportional to screen area).
- [ ] **Detection budget**: terminal capability detection completes in **≤ 200 ms** even when the terminal never answers a query (bounded fallback).
- [ ] **Memory**: input buffering (incomplete sequences, paste) is bounded; large screens may use typed-array backing to avoid per-cell object overhead.

### Must Have (Compatibility & API)
- [ ] **Cross-platform**: Linux, macOS, Windows 10+/Windows Terminal; degrade gracefully under tmux/screen and over SSH (per RD-02/07).
- [ ] **Node**: active LTS 18/20/22; ESM-only; ship `.d.ts`; tree-shakeable (`sideEffects:false`).
- [ ] **API stability**: SemVer; a frozen, documented public API surface (the `engine/index.ts` exports); internal modules not part of the contract.
- [ ] **Deprecation policy**: documented; breaking changes only on majors; a maintained changelog.

### Must Have (Accessibility & Degradation)
- [ ] Honor `NO_COLOR`; remain legible in monochrome (attributes convey state).
- [ ] Glyph fallback to ASCII when box-drawing/UTF-8 is unavailable.
- [ ] `TERM=dumb` / non-TTY → safe degradation, never a crash.
- [ ] No reliance on color alone to convey essential state (monochrome-legible).

### Must Have (Supply Chain & Docs)
- [ ] Reused leaf deps are pure-JS and MIT-compatible; `npm audit` clean in CI; npm provenance on publish.
- [ ] Documentation: a public API reference, a capability/terminal support matrix (from RD-03), and runnable examples.

### Should Have
- [ ] Published benchmarks and a performance regression check in CI.
- [ ] An architecture/ADR doc set (optionally via the techdocs skill).

### Won't Have (Out of Scope)
- Bidi/RTL text, Sixel/Kitty images as core features, nested TUIs, telemetry/analytics, persistence, and all UI/widgets/object-model (AR-26).

---

## Technical Requirements

### Budgets (summary)
| Metric | Target | Source |
|--------|--------|--------|
| Full-frame compose+diff (200×50) | ≤ 16 ms | AR-25 |
| Steady-state single-cell update | bytes = O(1) | AR-14, AR-25 |
| Capability detection (no response) | ≤ 200 ms | AR-24 |
| Incomplete-sequence buffer | bounded | RD-06 |

### Out-of-scope register (explicit)
bidi/RTL · Sixel/Kitty images (core) · nested TUIs · telemetry · persistence · UI/widgets/object-model.

---

## Integration Points

### With RD-01
- The `exports` map, `engines`, `sideEffects`, and CI matrix are the enforcement points for these NFRs.

### With RD-09
- Performance benchmarks and the cross-platform/security tests live in RD-09's tiers; this RD sets their targets.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Frame budget | unspecified / concrete | ≤16 ms @200×50 | Concrete, testable perf target | AR-25 |
| Output model | full-frame / damage-bounded | Bytes ∝ damage | SSH/perf | AR-14, AR-25 |
| API governance | ad hoc / SemVer+deprecation+changelog | SemVer + policy + changelog | Enterprise stability | AR-22 |
| Accessibility | color-only / monochrome-legible | Monochrome-legible + `NO_COLOR` | Degradation + a11y | AR-12 |
| Supply chain | unaudited / audited pure-JS MIT | Audited, pure-JS, MIT | Portability + integrity | AR-21 |

---

## Security Considerations

- **Data sensitivity**: reaffirms no secrets/PII handled or logged; no telemetry.
- **Input validation**: NFR-level reaffirmation that all terminal input and untrusted text are validated/sanitized (RD-02/06/08).
- **Authentication & authorization**: N/A (offline library).
- **Injection risks**: covered by the mandatory sanitizer (RD-08).
- **Encryption needs**: N/A.
- **Rate limiting**: covered by paste-cap/bounded buffers (RD-06).
- **Infrastructure**: CI uses provenance/OIDC, no long-lived secrets; `npm audit` gate; dependencies pinned and reviewed.

---

## Acceptance Criteria

1. [ ] A benchmark composes + diff-serializes a 200×50 frame in ≤ 16 ms (median over N runs) on the documented reference machine; the result is recorded and regression-checked in CI.
2. [ ] A steady-state benchmark mutating one cell per frame emits ≤ a documented constant byte count per frame, independent of screen size (8×8 vs 200×50 produce comparable per-update bytes).
3. [ ] Capability detection against a non-responding stub completes in ≤ 200 ms (±50 ms).
4. [ ] The published package is ESM-only, ships `.d.ts`, sets `sideEffects:false`, declares `engines.node>=18`, and tree-shakes (a consumer importing one symbol does not pull the whole library — verified by a bundler size check).
5. [ ] With `NO_COLOR=1` the UI renders monochrome yet conveys focused/selected state via attributes (reverse/bold) — no information is lost (verified by golden test).
6. [ ] With `caps.glyphs.boxDrawing=false`, frames render in ASCII and remain legible (golden test); `TERM=dumb`/non-TTY runs degrade without crashing.
7. [ ] Boundary: the CI matrix (3 OS × 3 Node) is green; `npm audit` reports no high/critical vulnerabilities; publish dry-run shows provenance and no secrets.
8. [ ] Security requirements verified: no secrets/PII handled or logged; sanitizer + bounded buffers enforced; dependency audit and provenance gates pass. (Auth/encryption/rate-limited-endpoints are N/A for an offline library.)
