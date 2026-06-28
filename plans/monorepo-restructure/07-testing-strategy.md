# Testing Strategy: Monorepo Restructure

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

This is a **refactor**: behavior is preserved, so the existing 91-file suite (migrated
to vitest with unchanged expectations) IS the regression oracle. The only genuinely
NEW behavior is the version-sync script, which gets a spec test first (spec-first
ordering). Everything else is verified by keeping the migrated suite — and the RD-01/
RD-09/RD-10 contract specs — green at each phase.

Wall-clock-sensitive RD-10 specs keep their `CI`/`TUI_SKIP_PERF` skips.

## 🚨 Specification Test Cases (MANDATORY)

> Expectations derive from the AR decisions + the preserved contracts — never from
> imagined behavior. ST-5 is the new spec-first oracle; the rest are
> regression/contract oracles that must stay green through the migration.

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-1 | After `yarn install`, query the workspace + resolve `@blendsdk/tui-core` from `@blendsdk/tui-examples` | both packages are workspace members; the examples package resolves core; install exits 0 | FR-1 / AR-3 |
| ST-2 | Run the FULL migrated spec+impl suite under vitest | every previously-passing test passes with the SAME expected values (assert→expect changed syntax only) | FR-8,9 / AR-6 |
| ST-3 | The RD-01 packaging spec, run from `packages/tui-core` | ESM-only `exports`, `.d.ts` shipped, `sideEffects:false`, `engines.node` present, file allowlist — all hold after the move | FR-5 / AR-9 |
| ST-4 | The RD-10 treeshake + perf specs, run against the moved `dist/engine/index.js` | one-symbol bundle ≪ full; 200×50 compose+diff median asserts off-CI / logs under CI | FR-5 / AR-9,11 |
| ST-5 | `sync-versions.mjs` on a fixture workspace (root version `9.9.9`; one public pkg at `1.0.0`, one `private` pkg at `0.0.1`) | the public pkg → `9.9.9` (and its `version.ts` if core); the `private` pkg stays `0.0.1`; `--check` then exits 0 | FR-11 / AR-8 |
| ST-6 | The 5 `*.e2e.test.ts` under the e2e vitest project on POSIX | all pass (restore-on-exit, signals, install ESM/CJS, probe `--auto`) — children spawn via `tsx` | FR-10 / AR-7 |
| ST-7 | `yarn gate` at the root | core e2e + examples probe `--auto` run; `sync-versions --check` confirms lockstep; gate exits 0 (PASS + the RD-09 DEFERRED items) | FR-12 / AR-15 |
| ST-8 | `check:deps` per public package | no native runtime deps; exits 0 (turbo/vitest/esbuild/tsx are dev-only) | FR-13 / AR-16 |

### Mapped (verified by existing specs — migrated, not rewritten)

| Requirement | Existing oracle (migrated to vitest) |
|-------------|--------------------------------------|
| Engine behavior across all subsystems | the 50 spec + 36 impl tests (RD-02…RD-10) |
| Packaging contract | `packaging.spec` (RD-01) |
| Output∝damage, a11y, detection budget, tree-shake | the RD-10 specs |
| Restore-on-every-exit | the host/safety e2e (RD-07/08/09) |

> **AUTHORING RULE:** No expected value in any `*.spec.test.ts` may change — only the
> assertion syntax (AR-6). A post-migration spec failure means the conversion is wrong.

## Test Categories

### New specification test (spec-first)
| Test File | ST | Component |
|-----------|----|-----------|
| `test/sync-versions.spec.test.ts` (root tooling, run via tui-core or a root vitest) | ST-5 | version-sync script |

### Regression / contract (migrated, must stay green)
| Scope | Files |
|-------|-------|
| tui-core | 76 migrated spec/impl + 4 e2e (`host-tier3`, `host-signals`, `safety-error-restore`, `install`) |
| tui-examples | 15 migrated probe spec/impl + `probe.e2e` |

### Integration / Manual
| Test | Description |
|------|-------------|
| `yarn turbo run verify` | cross-package typecheck + build + unit (cached) |
| `yarn gate` | root cross-package acceptance |
| `yarn workspace @blendsdk/tui-core bench` | informational perf (CI: one cell) |

## Verification Checklist
- [ ] ST-5 written and red before `sync-versions.mjs` exists; green after
- [ ] Full migrated suite green under vitest with unchanged expectations (ST-2)
- [ ] Packaging + treeshake + perf contracts green post-move (ST-3, ST-4)
- [ ] e2e project green on POSIX; root gate green (ST-6, ST-7)
- [ ] `check:deps` + `yarn audit` clean (ST-8)
- [ ] No regression in the existing suite; no spec expectation changed
