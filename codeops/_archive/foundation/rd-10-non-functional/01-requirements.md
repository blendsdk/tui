# Requirements: RD-10 Non-Functional Requirements

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-10](../../requirements/RD-10-non-functional.md)

## Feature Overview

Realize and verify the foundation's cross-cutting NFRs. Where RD-01…09 already
satisfy a requirement, this plan **maps** it to existing evidence (AR-10); where it
does not, this plan adds the missing benchmark, check, test, or doc.

## Functional Requirements

### Must Have — Performance
- [ ] **FR-1 — Frame budget**: a benchmark composes + diff-serializes a **200×50**
  frame; the median is reported, and a ceiling test asserts **≤ 16 ms** locally,
  auto-skipping its hard assert under `CI`. *(AR-2, AR-3; RD-10 AC-1)*
- [ ] **FR-2 — Output ∝ damage**: a steady-state single-cell update emits a bounded,
  near-constant byte count independent of screen size. **Mapped** to RD-09
  `render-bytes-damage.spec`, extended with an 8×8-vs-200×50 size-independence case.
  *(AR-10; RD-10 AC-2)*
- [ ] **FR-3 — Detection budget**: capability detection against a **non-responding**
  query stub completes via fallback within `timeoutMs`+slack (≤ ~200 ms). *(AR-12; RD-10 AC-3)*
- [ ] **FR-4 — Bounded memory**: input/paste/carry buffers are bounded. **Mapped** to
  RD-06 fuzz (`input-fuzz.spec`) + decoder caps. Typed-array backing stays out (DEF-3).
  *(AR-10, AR-14)*

### Must Have — Compatibility & API
- [ ] **FR-5 — Packaging contract**: ESM-only, ships `.d.ts`, `sideEffects:false`,
  `engines.node>=18`. **Mapped** to RD-01 `packaging.spec` (ST-3…ST-6). *(AR-10; RD-10 AC-4)*
- [ ] **FR-6 — Tree-shakeable**: a one-symbol import bundles materially smaller than
  the all-exports import (esbuild, relational). *(AR-4, AR-8; RD-10 AC-4)*
- [ ] **FR-7 — Cross-platform**: 3 OS × Node 18/20/22 CI green. **Mapped** to the
  green CI matrix (today). *(AR-10; RD-10 AC-7)*
- [ ] **FR-8 — API stability**: SemVer + documented deprecation policy + a maintained
  changelog. *(AR-7; RD-10 AC governance)*

### Must Have — Accessibility & Degradation
- [ ] **FR-9 — NO_COLOR / monochrome-legible**: with `NO_COLOR`, the grid renders in
  mono yet conveys focus/selection via attributes (reverse/bold) — golden test. *(AR-11; RD-10 AC-5)*
- [ ] **FR-10 — Glyph fallback**: with `boxDrawing:false`, frames render in ASCII and
  remain legible — golden test. `TERM=dumb`/non-TTY degrades without crashing
  (**mapped** to RD-08 essentials). *(AR-11; RD-10 AC-6)*

### Must Have — Supply Chain & Docs
- [ ] **FR-11 — Audit clean**: `npm audit` reports no high/critical. **Mapped** to the
  CI audit step. npm provenance on publish is **deferred** (DEF-1). *(AR-13; RD-10 AC-7)*
- [ ] **FR-12 — Documentation**: an architecture + public API reference + ADR set,
  produced via the **techdocs skill**; the RD-03 terminal-matrix and `examples/` are
  the support-matrix + runnable-examples evidence. *(AR-5; RD-10 AC docs)*

### Should Have (in scope this RD)
- [ ] **FR-13 — Perf regression check in CI**: `npm run bench` runs as an informational
  CI step (prints median/p95, never fails). *(AR-6, AR-9)*
- [ ] **FR-14 — ADR / architecture doc set**: delivered as part of FR-12 (techdocs). *(AR-6)*

### Won't Have (Out of Scope)
- Bidi/RTL, Sixel/Kitty images, nested TUIs, telemetry, persistence, UI/widgets (RD-10 AR-26).
- Dependency MIT-license guard (DEF-2 — zero runtime deps today).
- npm provenance verification (DEF-1 — no publish yet).
- Typed-array buffer backing (DEF-3 — optional RD-04 optimization).
- Hard-failing wall-clock perf gate in CI (AR-2 — informational only).

## Technical Requirements

### Performance
- The frame-budget and detection-budget timing assertions are wall-clock and therefore
  **skippable under `CI`** (env `CI` truthy); off-CI they assert the budget. Numbers use
  median over N warmed runs, never a single sample. *(AR-2, AR-3, AR-12)*

### Compatibility
- New dev dep `esbuild` is **dev-only** (never in `dist`) and ships a **prebuilt
  platform binary** — no node-gyp/compile step on install, so a clean install works
  on linux/darwin/win32. `check:deps` inspects **runtime** deps only
  (`scripts/check-no-native-deps.mjs:65`), so a dev-only esbuild keeps it green; the
  clean-install ethos holds. *(AR-4)*
- `bench/frame-bench.mjs` and any new script are pure-Node ESM, OS-portable. *(AR-2)*

### Security
- No secrets/PII handled or logged; reaffirmed (no telemetry). Benchmarks and tests use
  synthetic buffers only. *(RD-10 Security)*
- The detection-budget stub returns synthetic bytes, never real terminal data. *(AR-12)*

## Acceptance Criteria

> Maps RD-10's AC-1…AC-8. Items realized now must pass locally; deferred items recorded as DEFERRED.

1. [ ] `npm run bench` reports the 200×50 compose+diff median; the ceiling spec asserts ≤16 ms off-CI (skips under CI). *(FR-1)*
2. [ ] A steady-state single-cell update at the same coordinate emits a **byte-identical** count for 8×8 and 200×50 (size-independent). *(FR-2)*
3. [ ] Detection against a non-responding stub completes via fallback within `timeoutMs`+slack. *(FR-3)*
4. [ ] esbuild check: a one-symbol import bundles materially smaller than the all-exports import; packaging contract (ESM/`.d.ts`/`sideEffects`/`engines`) mapped green. *(FR-5, FR-6)*
5. [ ] `NO_COLOR` golden: mono grid with focus conveyed via attributes (no color, no info lost). *(FR-9)*
6. [ ] `boxDrawing:false` golden: ASCII frame legible; `TERM=dumb`/non-TTY degrades without crash (mapped). *(FR-10)*
7. [ ] CI matrix green; `npm audit` 0 high/critical; bench runs informationally in CI. Deferred items (DEF-1…DEF-3) recorded as DEFERRED. *(FR-7, FR-11, FR-13)*
8. [ ] API-stability docs present: `CHANGELOG.md` + README "Versioning & stability"; architecture + API reference + ADRs via techdocs. *(FR-8, FR-12, FR-14)*
9. [ ] `npm run verify` green; lint/check:deps clean. Documentation updated (README, CLAUDE.md, roadmap → Implemented). *(all)*
