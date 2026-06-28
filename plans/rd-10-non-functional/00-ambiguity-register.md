# Ambiguity Register: RD-10 Non-Functional Requirements

> **Status**: ✅ GATE PASSED — all 14 items resolved
> **Last Updated**: 2026-06-28

Decisions captured across two clarifying-question rounds on 2026-06-28 plus the
RD-10 requirements doc. Items marked ★ were resolved with a recommended default
(low-stakes, derived directly from RD-10) and are open to revision at preflight.

| #  | Category        | Ambiguity / Gap | Options | Decision | Status |
|----|-----------------|-----------------|---------|----------|--------|
| 1  | Scope           | Base this plan on RD-10? | RD-based / fresh | **Base on `requirements/RD-10-non-functional.md`** | ✅ |
| 2  | Performance     | How to enforce the frame budget given CI jitter | Bench+skippable ceiling / hard CI gate / regression-vs-baseline / bench-only | **`npm run bench` (median/p95) + a suite ceiling test that asserts ≤16 ms median locally and auto-skips its hard assert when `CI` is set** | ✅ |
| 3  | Performance     | Frame-budget value + target | — | **≤ 16 ms median, compose + diff-serialize of a 200×50 frame (RD AR-25/AC-1); reference = a modern dev machine, documented; CI numbers informational** | ✅ |
| 4  | Packaging       | Tree-shake / bundle-size check mechanism | esbuild / size-limit / structural-only | **`esbuild` dev dep (dev-only; ships a prebuilt platform binary — no node-gyp/compile step, installs clean on all 3 OS; `check:deps` is runtime-only so it stays green); a relational assertion that a one-symbol import bundles materially smaller than the all-exports import** | ✅ |
| 5  | Docs            | How to produce the public API reference | typedoc / hand-written / techdocs skill | **Via the techdocs skill (architecture + API reference + ADRs as one doc set)** | ✅ |
| 6  | Scope           | Which should-haves are in scope now | (multi) | **In: CHANGELOG + SemVer/deprecation policy; perf-regression-in-CI (informational); ADR/techdocs set. Out: dependency-license guard** | ✅ |
| 7  | Docs/API        | Changelog + policy home & tooling | CHANGELOG+README / docs files / changesets | **`CHANGELOG.md` (Keep-a-Changelog) + a "Versioning & stability" section in README; manual entries, no tooling dep** | ✅ |
| 8  | Packaging       | What the esbuild check asserts | relational / absolute KB | **Relational: single-import bundle ≤ a set fraction of the all-exports bundle (machine-independent)** | ✅ |
| 9  | CI              | CI perf behavior | bench informational + skip assert / assert in CI | **`npm run bench` as an informational CI step (prints, never fails); the ceiling test skips its hard assertion under `CI`** | ✅ |
| 10 | Scope ★         | Existing NFRs already satisfied by RD-01…09 | rebuild / map | **Map, don't rebuild (RD-09 AR-8 precedent): output∝damage (RD-09 `render-bytes-damage`), bounded buffers (RD-06 fuzz), cross-platform CI green (today), ESM/`.d.ts`/`sideEffects`/`engines` (RD-01 `packaging.spec`)** | ✅ |
| 11 | Testing ★       | NO_COLOR + glyph-fallback coverage | unit-only / add golden | **Add golden-screen tests (extend RD-09 `golden-screen-helpers`): NO_COLOR→mono with attributes legible; `boxDrawing:false`→ASCII. TERM=dumb/non-TTY mapped to RD-08 essentials** | ✅ |
| 12 | Testing ★       | Detection-budget (≤200 ms) coverage | map only / add dedicated | **Add a dedicated spec: a non-responding query stub resolves via fallback within `timeoutMs`+slack; the wall-clock assertion is skippable under `CI` like perf** | ✅ |
| 13 | Supply chain ★  | npm provenance on publish | now / defer | **DEFERRED (DEF-1): no publish/remote-publish yet; document the `npm publish --provenance` intent; verify at first real release** | ✅ |
| 14 | Performance ★   | Typed-array buffer backing for large screens | implement / out | **Out of scope: RD-10 says "may"; remains the optional RD-04 DEF-2 optimization. Bounded-memory AC is met by existing buffer/paste/carry bounds** | ✅ |

### Runtime decisions (during execution)

| #  | Category | Ambiguity / Gap | Decision | Status |
|----|----------|-----------------|----------|--------|
| 15 (runtime) | Docs | techdocs Phase 3 installs VitePress as a dev dep, conflicting with RD-10 success criterion 5 ("only `esbuild` added") + the zero/minimal-dep ethos + `npm audit` 0 high | **Generate the VitePress-compatible markdown set (overview, API reference, ADRs) + a `docs/.vitepress/config.ts`, but do NOT `npm install vitepress` and do NOT add `docs:*` scripts.** The markdown content is the deliverable (AR-5); the dep is intentionally not added, honoring criterion 5 + audit-clean. (User-confirmed.) | ✅ |

### Deferrals (DEF-n)

- **DEF-1** — npm provenance verification on publish (needs a real publish + CI OIDC). [AR-13]
- **DEF-2** — dependency MIT-license guard (zero runtime deps today; revisit when a runtime dep is added). [AR-6]
- **DEF-3** — typed-array buffer backing (optional perf optimization, RD-04 carryover). [AR-14]

### Resolution notes

**AR-2/AR-9:** Wall-clock perf is environment-sensitive, so the *hard* assertion runs only off-CI; CI still tracks numbers via the informational `npm run bench` step. This mirrors RD-09's stance (deterministic gate evidence stays gated; timing stays informational) and resolves RD-09 DEF-4.

**AR-10:** "Mapped, not rebuilt" follows RD-09 AR-8 — existing immutable spec oracles are referenced from the RD-10 acceptance map, not duplicated. New RD-10 code is only the bench, the esbuild check, the a11y golden tests, the detection-budget test, and the docs/policy artifacts.

**AR-5/AR-6:** The documentation deliverable (API reference + architecture + ADRs) is produced by invoking the **techdocs skill** during execution, not hand-authored here.
