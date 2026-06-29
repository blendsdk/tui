# Current State: RD-10 Non-Functional Requirements

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## What already satisfies RD-10 (map, don't rebuild — AR-10)

| RD-10 requirement | Already provided by | Evidence (file) |
|-------------------|---------------------|-----------------|
| Output ∝ damage (FR-2) | RD-09 byte-proportionality | `test/render-bytes-damage.spec.test.ts` (no-change empty; single ≪ full/10) |
| Bounded memory (FR-4) | RD-06 decoder caps + fuzz | `test/input-fuzz.spec.test.ts`; carry ≤ `RESPONSE_BUFFER_CAP` (1024), paste ≤ cap |
| Packaging contract (FR-5) | RD-01 packaging spec | `test/packaging.spec.test.ts` ST-3…ST-6 (ESM-only, `.d.ts`, `sideEffects:false`, `engines>=18`) |
| Cross-platform (FR-7) | CI matrix (today) | `.github/workflows/ci.yml` — 3 OS × Node 18/20/22 green |
| NO_COLOR → mono (FR-9, unit) | RD-02 env layer | `test/capability-env.impl.test.ts` (NO_COLOR/FORCE_COLOR) |
| ASCII glyph fallback (FR-10, unit) | RD-04 glyphs | `test/render-glyphs.spec.test.ts` / `.impl` (box-drawing → ASCII) |
| Non-TTY / dumb degradation (FR-10) | RD-08 essentials gate | `test/safety-essentials.spec.test.ts`, `test/host-detect-tty.spec.test.ts` |
| Detection fallback (FR-3) | RD-02 bounded query | `resolveCapabilitiesAsync`, `ResolveOptions.timeoutMs` default 200 (`capability/profile.ts`) |
| Audit clean (FR-11) | CI audit step | `npm audit --audit-level=high` in CI |
| Support matrix + examples (FR-12) | RD-03 + examples | `terminal-matrix.json`, `examples/capability-probe`, `examples/resize-demo` |

These are referenced from the RD-10 acceptance map and **not duplicated** — the
existing `*.spec.test.ts` files remain the immutable oracles (RD-09 AR-8 precedent).

## Gaps (what this plan adds)

### Gap 1: No performance benchmark / frame-budget assertion
**Current:** output∝damage is asserted (byte counts), but there is no timing benchmark
and no 16 ms frame-budget check. **Fix:** `bench/frame-bench.mjs` (`npm run bench`) +
`test/perf-budget.spec.test.ts` (ceiling, skippable under `CI`). Resolves RD-09 DEF-4.

### Gap 2: No tree-shake / bundle-size check
**Current:** `sideEffects:false` is declared but never verified by a bundler. **Fix:**
`esbuild` dev dep + `test/treeshake.spec.test.ts` (relational single-vs-full bundle size).

### Gap 3: No explicit detection-budget test
**Current:** the bounded query exists; no test asserts the ≤200 ms budget against a
non-responding stub. **Fix:** `test/capability-budget.spec.test.ts`.

### Gap 4: No NO_COLOR / glyph-fallback golden tests
**Current:** unit tests only; RD-10 AC-5/AC-6 want real-emulator golden proof. **Fix:**
`test/a11y-golden.spec.test.ts` using the RD-09 `golden-screen-helpers`.

### Gap 5: No API-stability docs
**Current:** no `CHANGELOG.md`; README has a heavy-development notice but no versioning
/deprecation policy. **Fix:** `CHANGELOG.md` (Keep-a-Changelog) + a README "Versioning &
stability" section.

### Gap 6: No architecture / API reference / ADR doc set
**Current:** `docs/` holds only `acceptance-gate.md`. **Fix:** invoke the **techdocs
skill** to generate the architecture overview, API reference, and ADRs.

## Relevant Files

| File | Purpose | Change |
|------|---------|--------|
| `src/engine/render/serialize.ts`, `buffer.ts` | compose + diff target of the bench | None (bench imports them) |
| `src/engine/capability/index.ts` | `resolveCapabilitiesAsync` (detection budget) | None (budget test drives it) |
| `test/golden-screen-helpers.ts` | RD-09 emulator adapter | Reused by the a11y golden tests |
| `test/render-bytes-damage.spec.test.ts` | RD-09 byte-proportionality | Extended with a size-independence case (FR-2) |
| `package.json` | scripts + devDependencies | Add `esbuild`; add `bench` script |
| `.github/workflows/ci.yml` | CI matrix | Add an informational `bench` step (non-failing) |
| `README.md`, `CLAUDE.md`, `plans/00-roadmap.md` | docs | Updated in the docs phase |

## Dependencies

- **Internal:** RD-04 `serialize`/`ScreenBuffer`, RD-05 `encodeStyle`, RD-02
  `resolveCapabilities(Async)`, RD-09 golden harness + byte-proportionality. All implemented.
- **External:** new dev dep `esbuild` (dev-only; prebuilt platform binary, no compile step) for the tree-shake check (AR-4).

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Wall-clock perf assertions flake in CI | Med | Med | Hard assert skipped under `CI`; CI bench is informational (AR-2, AR-9) |
| `esbuild` bundles `@xterm/headless` or test code into the size check | Low | Med | Bundle only `src/engine/index.ts` entry; assert relationally, not absolute |
| techdocs skill output drifts from code | Low | Low | Generated from current source/JSDoc at execution time; re-runnable |
| Detection-budget test slow (real 200 ms timer) | Med | Low | Inject a small `timeoutMs`; assert completion + fallback, skip strict timing under CI |
