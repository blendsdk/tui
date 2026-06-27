# Ambiguity Register: RD-01 Scaffolding & Toolchain (Plan)

> **Status**: ✅ GATE PASSED — all 8 items resolved
> *(User confirmed the complete register on 2026-06-27: "Confirm all 8".)*
> **Last Updated**: 2026-06-27
> **Scope**: Plan-level decisions for implementing **RD-01** (scaffolding & toolchain) only.
> **Source RD**: [RD-01](../../requirements/RD-01-scaffolding-and-toolchain.md)

The requirements-level Zero-Ambiguity Gate (AR-1…AR-26 in
[requirements/00-ambiguity-register.md](../../requirements/00-ambiguity-register.md))
already passed. This register covers only the **new** plan-level decisions surfaced
while turning RD-01 into an implementation plan. Each entry is prefixed `PL-` to
distinguish it from the requirements `AR-` entries it builds on.

| #     | Category            | Ambiguity / Gap | Options Presented | User Decision | Status |
|-------|---------------------|-----------------|-------------------|---------------|--------|
| PL-1  | Scope / Technical   | RD-01's Must-item says primitives are *migrated* from the prototype "not rewritten from scratch". Does this plan migrate them, relocate them now, or start fresh? | A: toolchain + migrate primitives later · B: relocate primitives into `engine/` now · C: clean slate (archive prototype, write fresh) | **C — Start fresh. Archive the current implementation; `src/engine/` is written clean in later RDs, taking inspiration from the archived sources. This SUPERSEDES the RD-01 Must-item "primitives are migrated… not rewritten." No RD-01 acceptance criterion depends on migration, so the override is clean.** | ✅ Resolved |
| PL-2  | Technical / Naming  | Linter/formatter choice (RD-01 Should-Have offers "ESLint + Prettier or Biome") | ESLint + Prettier · Biome · Defer | **ESLint + Prettier** (flat config `eslint.config.js` + `typescript-eslint`; Prettier for formatting; both enforced in CI) | ✅ Resolved |
| PL-3  | Scope / Infra       | No git repo or GitHub remote exists, so CI cells and `npm publish` cannot be *executed* here — only authored. How far does this plan go on CI/release? | A: git init + author CI matrix, defer publish/changelog · B: also author full release pipeline now · C: local verify only | **A — `git init`; author the GitHub Actions matrix (ubuntu/macos/windows × Node 18/20/22) running `verify` + `npm audit`; configure packaging. Defer publish-with-provenance + automated changelog (RD-01 Should-Have) to a later release milestone. CI cells (AC-2) and publish dry-run (AC-7 CI half) are verified once a remote exists.** | ✅ Resolved |
| PL-4  | Scope               | RD-01 Should-Have lists an `examples/` workspace (probe harness + demos). Scaffold it now? | Defer to RD-03 · Scaffold empty `examples/` now | **Defer to RD-03** (probe harness is RD-03; demos come later) | ✅ Resolved |
| PL-5  | Data / State        | Concrete archive mechanism for the current prototype before clean slate | Browsable folder in `_archive/` · Gzip tarball | **Move current `src/` (+ `dist/`) into `_archive/prototype-2026-06-27/` uncompressed, so sources stay easy to reference for inspiration** | ✅ Resolved |
| PL-6  | NFR / Packaging     | Starting SemVer version for `@blendsdk/tui` (AR-22 SemVer; foundation API still changing) | 0.1.0 · 1.0.0 | **0.1.0** (pre-1.0 signals the public API is not yet frozen during the foundation build-out) | ✅ Resolved |
| PL-7  | Naming / Integration| `engine/index.ts` is the single public entry point, but with a clean slate there is no runtime code yet — AC-1 needs a real importable symbol to verify resolution + `.d.ts` | Export a `VERSION` constant · Export nothing (empty module) | **Export a `VERSION` string constant from `engine/index.ts`, kept in sync with `package.json` version.** (Recommendation confirmed by user — only viable option: AC-1 `import { … }` requires a named export; an empty module gives nothing to assert.) | ✅ Resolved |
| PL-8  | Technical           | How tests are invoked (RD-01: `node:test` + `node:assert`; files `*.spec.test.ts` / `*.impl.test.ts`; TS is ESM) | `tsx --test` over `*.{spec,impl}.test.ts` · compile-then-`node --test` | **`tsx --test 'src/**/*.{spec,impl}.test.ts'`** — runs TS directly via `tsx` (the chosen dev runner, RD-01) using Node's built-in `node:test`. (Recommendation confirmed by user; matches RD-01's toolchain + the existing working pattern.) | ✅ Resolved |

### Resolution Notes

- **PL-1:** User verbatim — *"I want to start fresh, archive the current implementation whatever it is. If we need anything from the demo sources, then take inspiration from the archived files."* This is a deliberate override of the RD-01 Must-Have migration item; recorded here so the chain user→decision→plan is explicit. The reusable primitives (cell buffer, ANSI serializer, SGR-mouse parser, hit-tester) will be (re)built fresh in their owning RDs (RD-04/05/06), informed by the archived prototype.
- **PL-3:** Verification boundary — locally verifiable now: AC-3 (`npm pack` file list), AC-4 (no native install / zero runtime deps), AC-5 (unused import fails typecheck), AC-6 (native-dep policy guard). Authored-but-deferred-verification (needs a remote): AC-2 (9 green CI cells) and the CI half of AC-7 (`npm audit` + publish dry-run running in Actions). The plan marks these explicitly as "deferred to remote".
- **PL-7 / PL-8:** The only two entries that are my recommendations rather than a direct user answer. Both are confirmed via your explicit review of this register (per the gate's final-confirmation rule), not by silence.
