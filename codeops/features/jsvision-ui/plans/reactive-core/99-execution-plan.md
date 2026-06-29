# Execution Plan — Reactive Core

> **Implements**: RD-01 · **Plan**: `plans/reactive-core/`
> **CodeOps Skills Version**: 2.0.0

Specification-first ordering is **non-negotiable**: every feature phase runs three sessions —
**(A) Spec Tests → confirm RED → (B) Implementation → confirm GREEN → (C) Impl Tests & Hardening**.
Spec tests derive from RD-01 ACs (the immutable oracles in
[07-testing-strategy.md](07-testing-strategy.md)). Commits reference **/gitcm** (commit) or
**/gitcmp** (commit + push) — never raw git. Commit scope: `reactive`. Verify with `yarn verify`;
iterate with `yarn workspace @jsvision/ui test`.

Four phases build the subsystem in dependency order: graph foundation (signal+effect+scheduler+owner)
→ computeds+glitch-freedom → combinators → packaging/hardening. Each phase produces files ≤ 500
lines (PA-3 layout) with full JSDoc on public symbols.

---

## Phase 1 — Reactive graph foundation (signal · effect · scheduler · owner)

Self-contained on **signals + effects only** (no computeds yet): reactivity, `batch`/`untrack`,
disposal, no-owner policy, runaway guard, exception handling. Covers AC-1,2,3,5,6,8,9,10,11,16,17,18.

### Session 1A — Spec tests (RED)
- [x] T1.1 — Scaffold `packages/ui/src/reactive/` dir + empty `index.ts` barrel; wire a re-export into `src/index.ts` so the package still builds. (PA-3, PA-4) <!-- 2026-06-29 -->
- [x] T1.2 — Write `reactive.signal.spec.test.ts` (ST-01, ST-02, ST-03). (AC-1,2,3) <!-- 2026-06-29 -->
- [x] T1.3 — Write `reactive.effect.spec.test.ts` (ST-05, ST-10). (AC-5,10) <!-- 2026-06-29 -->
- [x] T1.4 — Write `reactive.scheduling.spec.test.ts` (ST-06, ST-11, ST-18 — batch, runaway, nested batch; diamond ST-07 deferred to Phase 2). (AC-6,11,18) <!-- 2026-06-29 -->
- [x] T1.5 — Write `reactive.ownership.spec.test.ts` (ST-08, ST-09, ST-16, ST-17). (AC-8,9,16,17) <!-- 2026-06-29 -->
- [x] T1.6 — Run `yarn workspace @jsvision/ui test` → confirm all Phase-1 spec tests **fail (RED)**. <!-- 2026-06-29 -->>

### Session 1B — Implementation (GREEN)
- [x] T1.7 — `types.ts`: public `Signal`/`Computed`/`EqualsOption` + internal `Source`/`Computation`/`Owner`/`NodeState` (+ `Subscribable` for variance-safety). (03-01, 03-02) <!-- 2026-06-29 -->
- [x] T1.8 — `errors.ts`: `ReactiveCycleError extends TuiError` (import from `@jsvision/core`). (AR-13) <!-- 2026-06-29 -->
- [x] T1.9 — `warnings.ts`: `devWarn` (NODE_ENV-gated `console.warn`). (PA-1) <!-- 2026-06-29 -->
- [x] T1.10 — `owner.ts`: owner tree, `createRoot`, `onCleanup`, depth-first idempotent `dispose`, no-owner policy. (AR-03, AR-14) <!-- 2026-06-29 -->
- [x] T1.11 — `scheduler.ts`: tracking context, mark/flush propagation (effects), `batch` (outermost-only), `untrack`, runaway guard (1000), exception drain (first rethrown, rest `console.error`). (AR-02,07,08,15,16,18 · PA-2) <!-- 2026-06-29 -->
- [x] T1.12 — `signal.ts`: factory, read/subscribe, `set`/`update`/`peek`, equality. (AR-01, AR-05) <!-- 2026-06-29 -->
- [x] T1.13 — `effect.ts`: owner-bound sync effect. (AR-02, AR-03) <!-- 2026-06-29 -->
- [x] T1.14 — Export Phase-1 symbols from `reactive/index.ts` → `src/index.ts`. Run tests → Phase-1 spec tests **GREEN** (25 passed). <!-- 2026-06-29 -->
- Note: added internal leaf `cleanup.ts` (`runCleanups`) shared by `scheduler.ts`/`owner.ts` to keep the LIFO-drain DRY without a scheduler↔owner import cycle.

### Session 1C — Impl tests & hardening
- [x] T1.15 — `reactive.signal.impl.test.ts`, `reactive.effect.impl.test.ts` (custom equals, peek, dynamic dep drop, nested effects). (07 §impl) <!-- 2026-06-29 -->
- [x] T1.16 — `reactive.scheduling.impl.test.ts`, `reactive.ownership.impl.test.ts` (batch return value, multi-throw `console.error`, context restore after throw, idempotent dispose, `iterationLimit===1000` & `instanceof TuiError`). (07 §impl, PA-2) <!-- 2026-06-29 -->
- [x] T1.17 — `yarn verify` + `check:deps` + `lint` green; no file > 500 lines (max 209). **/gitcm** (`feat(reactive): graph foundation — signal/effect/scheduler/owner`). <!-- 2026-06-29 -->

---

## Phase 2 — Computeds & glitch-freedom

Adds lazy/memoized derived nodes and the `CHECK`/lazy-pull scheduler path that guarantees diamond
glitch-freedom. Covers AC-4, AC-7.

### Session 2A — Spec tests (RED)
- [x] T2.1 — `reactive.computed.spec.test.ts` (ST-04 — lazy + memoized). (AC-4) <!-- 2026-06-29 -->
- [x] T2.2 — Add ST-07 (diamond glitch-freedom) to `reactive.scheduling.spec.test.ts`. (AC-7) <!-- 2026-06-29 -->
- [x] T2.3 — Run tests → new computed/diamond specs **RED** (Phase-1 specs stay green). <!-- 2026-06-29 -->

### Session 2B — Implementation (GREEN)
- [x] T2.4 — `computed.ts`: lazy + memoized derived node (Source + Computation; value held in closure to keep `T` exact, no placeholder cast). (AR-06) <!-- 2026-06-29 -->
- [x] T2.5 — Extend `scheduler.ts`: `markStale` CHECK propagation for transitive computed observers, `updateIfNecessary`/`resolveCheck` lazy pull (resolve ALL sources before running → glitch-free), `pull()` source interface, memo-equal short-circuit (recompute marks observers only on a real change; first compute marks nothing). (AR-07) <!-- 2026-06-29 -->
- [x] T2.6 — Export `computed`. Run tests → **GREEN** (40 passed). <!-- 2026-06-29 -->

### Session 2C — Impl tests & hardening
- [x] T2.7 — `reactive.computed.impl.test.ts` (CHECK→CLEAN demotion, nested computed, `equals:false` computed). (07 §impl) <!-- 2026-06-29 -->
- [x] T2.8 — `yarn verify` + `lint` green (43 tests, max file 280 lines). **/gitcm** (`feat(reactive): lazy memoized computeds + glitch-free diamond`). <!-- 2026-06-29 -->

---

## Phase 3 — Structural combinators (`Show` · `For`)

Covers AC-12, AC-13, AC-19, AC-20. Depends on Phases 1–2 (uses `computed`, `effect`, owner scopes).

### Session 3A — Spec tests (RED)
- [x] T3.1 — `reactive.combinators.spec.test.ts` (ST-12 Show, ST-13 For keyed reuse, ST-19 reactive index, ST-20 duplicate key). (AC-12,13,19,20) <!-- 2026-06-29 -->
- [x] T3.2 — Run tests → combinator specs **RED**. <!-- 2026-06-29 -->

### Session 3B — Implementation (GREEN)
- [x] T3.3 — `show.ts`: memoized-boolean `Show`, per-branch scope dispose-on-flip (lazy memo driver; branch built untracked). (AR-11) <!-- 2026-06-29 -->
- [x] T3.4 — `for.ts`: keyed `Map` reconciliation, per-item index signal, missing/new/surviving diff, duplicate-key dev-warn + last-writer-wins; driven by an effect (writes index/output signals) + single `batch`. (AR-04, AR-17, PA-1) <!-- 2026-06-29 -->
- [x] T3.5 — Export `Show`/`For`. Run tests → **GREEN** (48 passed). <!-- 2026-06-29 -->

### Session 3C — Impl tests & hardening
- [x] T3.6 — `reactive.combinators.impl.test.ts` (Show boolean memoization, For item-change under stable key, empty `each`, remove-then-readd key fresh scope). (07 §impl) <!-- 2026-06-29 -->
- [x] T3.7 — `yarn verify` + `lint` green; `for.ts` (127) / `show.ts` (48) ≤ 500 lines (52 tests). **/gitcm** (`feat(reactive): Show/For structural combinators`). <!-- 2026-06-29 -->

---

## Phase 4 — Packaging, security & final hardening

Covers AC-14, AC-15. Validates the assembled public surface and the cross-cutting guarantees.

### Session 4A — Spec + verification
- [x] T4.1 — `reactive.packaging.spec.test.ts` (ST-14 all symbols+types import from `@jsvision/ui`; ST-15 security: runaway bounds, disposal releases subscriptions behaviorally over 50 mount/unmount cycles). (AC-14,15) <!-- 2026-06-29 -->
- [x] T4.2 — Confirmed every public symbol/type re-exported through `reactive/index.ts` → `src/index.ts` (`export *`); JSDoc on every public symbol. <!-- 2026-06-29 -->
- [x] T4.3 — `yarn workspace @jsvision/ui check:deps` passes (only `@jsvision/core` + Node). <!-- 2026-06-29 -->

### Session 4B — Final gate
- [x] T4.4 — Full `yarn verify` (typecheck + build + tests, all packages) green (core 474 / examples 49 / ui 55); `yarn lint` clean; no dead code; no file > 500 lines (max scheduler 280). <!-- 2026-06-29 -->
- [x] T4.5 — Updated `plans/00-roadmap.md` RD-01 row → stage `Done` ✅ + journal entry (roadmap skill). **/gitcmp** (`feat(reactive): packaging + acceptance gate — RD-01 complete`). <!-- 2026-06-29 -->

---

## Master Progress Checklist

**Phase 1 — Graph foundation**
- [x] 1A Spec (RED): T1.1–T1.6
- [x] 1B Impl (GREEN): T1.7–T1.14
- [x] 1C Impl tests & harden: T1.15–T1.17 ✅ commit

**Phase 2 — Computeds & glitch-freedom**
- [x] 2A Spec (RED): T2.1–T2.3
- [x] 2B Impl (GREEN): T2.4–T2.6
- [x] 2C Impl tests & harden: T2.7–T2.8 ✅ commit

**Phase 3 — Combinators**
- [x] 3A Spec (RED): T3.1–T3.2
- [x] 3B Impl (GREEN): T3.3–T3.5
- [x] 3C Impl tests & harden: T3.6–T3.7 ✅ commit

**Phase 4 — Packaging & final gate**
- [x] 4A Spec + verification: T4.1–T4.3
- [x] 4B Final gate: T4.4–T4.5 ✅ commit + push

## Estimates

| Phase | Sessions | Est. |
|-------|----------|------|
| 1 — Graph foundation | 3 | 10–14 h |
| 2 — Computeds & glitch-freedom | 3 | 5–7 h |
| 3 — Combinators | 3 | 5–7 h |
| 4 — Packaging & gate | 2 | 2–3 h |
| **Total** | **11** | **22–31 h** |

## Done = all of

20 spec tests (ST-01…ST-20) green · impl tests green · `yarn verify` green · `check:deps` passes ·
`yarn lint` clean · all public symbols importable from `@jsvision/ui` · every `reactive/` file ≤ 500
lines with JSDoc · roadmap synced.
