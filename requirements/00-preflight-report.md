# Preflight Report — RD-01 (Reactive Core)

> **Artifact**: `requirements/RD-01-reactive-core.md`
> **Type**: Requirements document (single RD)
> **Date**: 2026-06-29
> **Iteration**: 2 (independent fresh-session verification)
> **Status**: ✅ Resolved — all 9 findings accepted (recommended resolutions) and applied to RD-01
> **CodeOps Skills Version**: 2.0.0

> ✅ **FRESH-SESSION RE-REVIEW** — iteration 1 was a same-session review (same agent
> authored and audited RD-01). This iteration is a **new session**, providing the review
> independence iteration 1 flagged as missing. The RD is byte-identical to iteration 1
> (no fixes were applied), so PF-001…PF-008 are re-verified and **all still stand**.
> Codebase grounding re-confirmed against the real code: `TuiError` base-class convention
> (`packages/core/src/engine/safety/errors.ts:16`, re-exported `engine/index.ts:104`),
> `@jsvision/core` declared dep of `@jsvision/ui` (`packages/ui/package.json`), greenfield
> `packages/ui/src/reactive/`, vitest unit/e2e split (`packages/ui/vitest.config.ts`).
> **New this iteration:** PF-009 (`For` duplicate-key behavior) — missed by the same-session pass.

## Codebase Context Summary

- **Target location** `packages/ui/src/reactive/` does **not** exist yet — this is greenfield;
  the RD is a clean add. The sibling `layout/` subsystem (`packages/ui/src/layout/index.ts`)
  is the re-export pattern to mirror, and `packages/ui/src/index.ts` is the single public entry.
- **Typed-error precedent**: `@jsvision/core` exports `TuiError` (base) +
  `EssentialsNotMetError`, `LoggerConfigError`, `InvalidColorError`
  (`packages/core/src/engine/safety/errors.ts:18`, re-exported `engine/index.ts:104`).
  The project-wide convention is that every SDK error extends `TuiError`.
- **Dependency policy**: `scripts/check-no-native-deps.mjs` fails only on **native** runtime
  deps; the workspace dep `@jsvision/core` (already declared in `packages/ui/package.json`)
  passes. Importing `TuiError` from core would **not** violate `check:deps`.
- **Test split**: `packages/ui/vitest.config.ts` → `unit` = `*.{spec,impl}.test.ts`,
  `e2e` = `*.e2e.test.ts`. Matches the RD's spec/impl assumption.

## Findings

| ID | Sev | Dimension | Summary |
|----|-----|-----------|---------|
| PF-001 | 🟠 MAJOR | Codebase Alignment / Consistency | `ReactiveCycleError` should extend core's `TuiError`; AC-14 wording then needs revising |
| PF-002 | 🟠 MAJOR | Completeness / Edge Cases | Behavior of primitives created outside any owner scope is unspecified (memory-leak footgun) |
| PF-003 | 🟠 MAJOR | Completeness | Exception semantics inside an `effect`/`computed` run are undefined |
| PF-004 | 🟡 MINOR | Ambiguity / Testability | Runaway-guard iteration limit (value + configurability) unspecified — AC-11 not deterministic |
| PF-005 | 🟡 MINOR | Contradiction | `.peek()` is Must-Have (in the `Signal` interface) yet listed under Should-Have |
| PF-006 | 🟡 MINOR | Completeness | Nested-`batch` flush semantics unspecified |
| PF-007 | 🟡 MINOR | Consistency | AC-9 cleanup/run-count wording is muddled and risks a wrong spec test |
| PF-008 | 🟡 MINOR | Testability | AC enumeration omits `ReactiveCycleError` + exported types; `For` index-reactivity has no AC |
| PF-009 | 🟡 MINOR | Edge Cases / Completeness | `For` behavior on **duplicate keys** is unspecified (silent map collision) |

### PF-001 🟠 — `ReactiveCycleError` should extend core's `TuiError`
RD-01 (Should-Have line 54, Security §line 183, AC-11) introduces a typed `ReactiveCycleError`
but does not say it extends `@jsvision/core`'s `TuiError`. The project's entire error model is
"every SDK error extends `TuiError` so consumers can `catch (e instanceof TuiError)`"
(`packages/core/src/engine/safety/errors.ts:18`). A standalone error class breaks that contract.
Knock-on: AC-14 asserts the subsystem "imports nothing beyond the package and Node built-ins" —
extending `TuiError` means importing from `@jsvision/core` (a declared workspace dep, so
`check:deps` still passes, but the AC wording becomes false).
**Options:** (a) **[recommended]** `ReactiveCycleError extends TuiError` (imported from `@jsvision/core`); reword AC-14 to "imports nothing beyond the package, its declared workspace deps, and Node built-ins." (b) standalone `ReactiveCycleError extends Error` — keeps reactive dependency-free of core, but fragments the error model (rejected: contradicts the established convention for marginal benefit).

### PF-002 🟠 — Primitives created outside any owner scope
The RD binds every `effect`/`computed`/`Show`/`For` to "the current owner scope" and rests its
memory-safety claim (§Security, line 184–187: "no unbounded global registry") on disposal. But
it never says what happens when `effect`/`signal`/`computed` is called with **no** active owner
(outside any `createRoot`). Solid's convention: such computations are never disposed and it
emits a dev warning. Undefined here = a silent leak path that directly undercuts the security
claim, and a spec test can't assert it.
**Options:** (a) **[recommended]** specify "creating a tracked computation outside any owner is allowed but it is never auto-disposed; in dev a `console.warn` is emitted" (Solid-parity) + add an AC; (b) throw a `TuiError` when there is no owner (stricter, but breaks ad-hoc/test usage and top-level app setup); (c) leave it to the impl (rejected: it's the crux of the memory guarantee).

### PF-003 🟠 — Exception semantics inside a run
If a user's `effect`/`computed` `fn` throws (initial run or re-run), the RD is silent: does the
throw propagate to the writer / `batch` caller? Is the dependency graph left consistent? Do
pending dependents still run? Does `onCleanup` still fire? This interacts with glitch-freedom
(a throw mid-cascade could strand dependents stale) and disposal. An impl will pick *something*
silently and no spec test pins it.
**Options:** (a) **[recommended]** specify: a throw aborts the current run, runs that computation's `onCleanup`, propagates to the triggering `set`/`batch` caller, and leaves already-applied signal values in place (no rollback); siblings already queued still run. Add an AC. (b) swallow-and-log per effect (rejected: hides bugs, un-idiomatic). (c) defer (rejected: scheduler correctness must be pinned before planning).

### PF-004 🟡 — Runaway-guard limit unspecified
AC-11 and §Security require a bounded iteration count before `ReactiveCycleError`, but neither a
concrete bound nor whether it's configurable is stated. A spec test needs a deterministic trigger.
**Options:** (a) **[recommended]** fix a constant default (e.g. 1000 propagation iterations), not configurable in v1; document the number in the RD so AC-11 is deterministic. (b) make it an option on a future scheduler config (defer the knob; rejected as premature).

### PF-005 🟡 — `.peek()` Must vs Should contradiction
`.peek()` is in the Must-Have `signal` bullet (line 36) and in the `Signal`/`Computed` interfaces
(lines 76, 82), but is *also* listed under Should-Have (line 53). It can't be both mandatory and
optional. **Recommendation:** drop the Should-Have line 53 entry — `.peek()` is Must (it's in the
typed interface and implied by AC needs); Should-Have keeps only the error class + idempotent dispose.

### PF-006 🟡 — Nested `batch` semantics
`batch(fn)` coalescing is defined for the flat case; nesting (`batch` inside `batch`) is unspecified —
flush at the outermost close, or each? **Recommendation:** specify outermost-only flush (Solid-parity:
inner `batch` joins the outer; effects run once when the outermost returns). One added sentence + an AC.

### PF-007 🟡 — AC-9 wording muddled
AC-9 reads "spy was called N times (once per re-run after the first) + once at disposal — i.e.
cleanup count equals run count." The invariant (cleanup count == run count) is correct, but the
parenthetical "(once per re-run after the first)" mixes run-counting with cleanup-counting and
will mislead the spec-test author. **Recommendation:** restate as: "`onCleanup` runs before every
re-run and once at disposal; for an effect with 1 initial run + R re-runs, cleanup fires R+1 times,
equal to the total run count (1+R)."

### PF-008 🟡 — AC enumeration / coverage gaps
AC-14's importable-symbol list omits `ReactiveCycleError` (a Should-Have public symbol) and the
exported types (`Signal`, `Computed`). Separately, the `For` `index: () => number` reactivity
(behavior note line 124) has no acceptance criterion. **Recommendation:** add `ReactiveCycleError`
+ the type exports to AC-14's list, and add an AC: "reordering a `For` list updates the reactive
`index` observed by a surviving item's effect."

### PF-009 🟡 — `For` duplicate-key behavior unspecified
The `For` reconciler "maintains a `key → { node, scope }` map" (line 122) and AC-13 (line 206)
asserts `render` is called "once per **distinct** id" — both assume keys are unique, but the RD
never says what happens when `key(item)` yields the same value for two live items. With a plain
`Map`, the second item silently overwrites the first's entry: one scope leaks (never disposed,
undercutting the §Security memory claim) and node↔item correspondence becomes undefined. A keyed
list primitive must define this; a spec test can't pin current behavior. (Solid dev-warns on
duplicate keys and renders undefined-order output.)
**Options:** (a) **[recommended]** specify "keys must be unique among live items; a duplicate key
is a usage error — in dev emit a `console.warn` and last-writer-wins, mirroring the no-owner dev-warn
policy of PF-002" + add an AC asserting the dev-warn. (b) throw `ReactiveCycleError`/a `TuiError` on
duplicate key (stricter, but a transient duplicate during an in-flight data update would crash a
valid UI — rejected). (c) leave to impl (rejected: it's a correctness + memory-leak boundary, same
class as PF-002).

## Resolutions (iteration 2 — user accepted all recommendations, 2026-06-29)

All 9 findings were resolved by accepting the recommended option and applying the edit to
`RD-01-reactive-core.md` + `00-ambiguity-register.md` (new entries AR-13…AR-18).

| ID | Resolution | Applied to RD-01 |
|----|-----------|------------------|
| PF-001 | `ReactiveCycleError extends @jsvision/core`'s `TuiError`; AC-14 + Packaging FR reworded to allow the workspace dep | FR (runaway/error), Packaging FR, Security §, AC-14, AR-13 |
| PF-002 | No-owner computation: allowed, never auto-disposed, dev `console.warn` | new FR "Computation without an owner", Security §, AC-16, AR-14 |
| PF-003 | Throw aborts run → fires `onCleanup` → propagates to caller, no rollback, queued siblings still run | new FR "Error propagation in a run", AC-17, AR-15 |
| PF-004 | Runaway limit fixed at 1000 iterations, not configurable in v1 | runaway FR, Security §, AR-18 |
| PF-005 | Dropped the duplicate Should-Have `.peek()` (it is Must, in the interface) | Should-Have section |
| PF-006 | Nested `batch` joins the outer; flush only at outermost close | `batch` FR, AC-18, AR-16 |
| PF-007 | AC-9 restated cleanly (cleanup fires R+1 times = total run count) | AC-9 |
| PF-008 | AC-14 lists `ReactiveCycleError` + `Signal`/`Computed` types; added `For` index-reactivity AC | AC-14, AC-19 |
| PF-009 | `For` keys unique among live items; duplicate → dev `console.warn` + last-writer-wins | `For` FR, AC-20, AR-17 |

## Pass/Fail

✅ **PREFLIGHT PASSED — all 9 findings resolved.** Every 🟠 MAJOR (PF-001/002/003) and every
🟡 MINOR (PF-004…009) was resolved by an applied edit; no findings remain open and no CRITICAL
findings were ever raised. The reactive-core RD is now spec-complete at the edges (no-owner,
exception, nested-batch, duplicate-key, error-base-class, runaway-limit all pinned) and ready to
feed the make_plan skill. Re-scan note: the applied edits introduced no new contradictions
(verified the `.peek()` Must/Should conflict is gone and the Packaging FR now matches AC-14).

---
---

# Preflight Report — RD-03 (View/Group Spine + DrawContext + Theming)

> **Artifact**: `requirements/RD-03-view-group-spine.md`
> **Type**: Requirements document (single RD). **Finding IDs PF-001…PF-006 below are scoped to RD-03.**
> **Date**: 2026-06-29
> **Reviewer note**: Not a same-session creation — RD-03 pre-existed this session
> (authored via `add_requirement`). Reviewed against the live `packages/ui` and `packages/core` sources.
> **Outcome**: ✅ **PASSED** — 2 MAJOR + 3 MINOR resolved into the RD; 1 OBSERVATION accepted.

## Codebase reconnaissance (what was verified)

| Claim in RD-03 | Verified against | Result |
|---|---|---|
| Reuse `Rect`/`Size2D`/`Padding`/`LayoutProps` | `packages/ui/src/index.ts:21-34` | ✅ all exported |
| `Show<N>` / `For<T,N>` generic (`N=View`) | `reactive/show.ts:24`, `reactive/for.ts:43` | ✅ generic; return reactive accessors |
| `ScreenBuffer` `set`/`fillRect`/`text`/`box`/`shadow` | `render/buffer.ts` | ✅ present; `.text()` calls `sanitize` (`:159`) |
| Theme roles `window`/`button`/`buttonFocused` | `color/theme.ts` | ✅ present (`ThemeRole = {fg,bg,hotkey?}`) |
| `createLogger`/`serialize`/`Style`/`Theme`/`defaultTheme` exported | `core/src/engine/index.ts` | ✅ |
| `Point`/`intersect`/`translate`/`contains` not pre-existing | grep `packages/ui`, `core/render` | ✅ no duplication |
| Owner-scope nests under parent | `reactive/owner.ts:49-72` | ⚠️ nests under *ambient* owner; no re-parent (PF-001) |
| `serialize()` signature | `render/serialize.ts:31,64` | ⚠️ requires previous buffer + `caps` (PF-002) |
| `ThemeRoleName` type from core | `color/index.ts` | ⚠️ no such export (PF-003) |

## Findings

| ID | Sev | Dimension | Summary | Resolution → AR |
|----|-----|-----------|---------|-----------------|
| PF-001 | 🟠 MAJOR | Codebase Alignment / Dependency Reality | Owner-scope nesting for imperatively-added children not realizable via RD-01's public API (`createRoot` nests under *ambient* owner; no re-parent; `Owner`/`setOwner` internal) | Add additive `runWithOwner(owner, fn)`; create child scopes at add-time → **AR-43** |
| PF-002 | 🟠 MAJOR | Completeness | `RenderRoot` omitted the required `caps: CapabilityProfile` + previous-buffer that core `serialize(current, previous, {caps})` needs (`serialize.ts:31,64`) | Required `caps` + retained previous buffer (double-buffer swap) → **AR-44** |
| PF-003 | 🟡 MINOR | Codebase Alignment | `ThemeRoleName` phantom type (core exports none); roles are `{fg,bg,hotkey?}` not `Style` — `color()` needs an adapter | `ThemeRoleName = keyof Theme` + `ThemeRole→Style` adapter → **AR-45** |
| PF-004 | 🟡 MINOR | Consistency | API sketch self-imports geometry from `'@jsvision/ui'` (own package name) | Changed to relative `../layout/index.js` |
| PF-005 | 🟡 MINOR | Testability | `bind()` repaint-only contract vs AC-9's relayout distinction; a bound auto-measured prop repaints with stale bounds | `bind` repaints by default; layout-affecting binds opt in → **AR-46** |
| PF-006 | 🔵 OBSERVATION | Consistency | `DrawContext.fill()` (whole-view) has no `ScreenBuffer` counterpart — convenience, not a mirror | Accepted as-is (wording nit) |

### PF-001 🟠 — Owner-scope nesting for imperatively-added children
`createRoot` (`owner.ts:63`) → `createChildScope` nests under `getOwner()` at call time (`owner.ts:49-54`); no re-parent op; `Owner`/`setOwner`/`createChildScope` not on the public reactive surface (`reactive/index.ts`). For an imperative `new View()` the ambient owner is `null`, so the child scope does not nest under the parent — the "leak-free by construction" guarantee fails for the imperative / Phase-0-demo path (AC-19, AC-11). The Show/For path works (per-item `createRoot` under the reconcile effect, `for.ts:56`).
**Decision (user, 2026-06-29):** Add additive RD-01 primitive `runWithOwner(owner, fn)` exported via the reactive surface; scope created at add-time under the parent; wording changed "at construction" → "when added." → **AR-43**.
*Dropped:* reaching into `../reactive/scheduler.js#setOwner` from RD-03 — depends on un-exported internals, breaks the single-public-entry convention.

### PF-002 🟠 — `RenderRoot` missing `caps` + previous-buffer
`serialize(current, previous, options)` (`serialize.ts:64`) with `RenderOptions.caps: CapabilityProfile` **non-optional** (`serialize.ts:31-32`). RD's `RenderRootOptions = {theme?, schedule?}` carried no `caps` and no previous-frame retention → AC-16/AC-19 could not call `serialize()`; diff degrades to full repaint.
**Decision (user, 2026-06-29):** `RenderRootOptions.caps` required; RenderRoot retains the previous `ScreenBuffer` and swaps each flush; `createRenderRoot(size, opts)` non-optional. → **AR-44**.

### PF-003 🟡 — `ThemeRoleName` phantom + `ThemeRole → Style` adapter
Core exports `ColorRole`/`Theme`/`ThemeRole`, no `ThemeRoleName` (`color/index.ts`); roles are `{fg,bg,hotkey?}` (+`border`/`title`/`pattern` on some), not `Style`. **Decision:** `ThemeRoleName = keyof Theme` (RD-03-owned); `color()` runs a `ThemeRole→Style` adapter (map `fg`/`bg`, default `attrs`, ignore role-only extras). → **AR-45**.

### PF-004 🟡 — Intra-package self-import
RD-03 lives in `@jsvision/ui`; siblings cross-reference via relative `./`. API sketch changed to `import … from '../layout/index.js'`; reuse intent unchanged.

### PF-005 🟡 — `bind()` repaint-only vs AC-9 relayout
`bind` defined as `apply` + `invalidate()` (repaint); a bound layout-affecting prop would repaint with stale bounds. **Decision:** `bind` repaints by default; layout-affecting binds opt in (`{ relayout: true }` / `invalidateLayout()` in `apply`). → **AR-46**.

### PF-006 🔵 — `DrawContext.fill()` not a `ScreenBuffer` mirror
`fill(char, style?)` is a view-local convenience (`fillRect(0,0,size.w,size.h,…)`), not a literal `ScreenBuffer` method. Accepted as-is.

## Dimension scan summary
All 13 dimensions scanned. Clean: Logical Contradictions, Feasibility, Scope Creep, Ordering & Sequencing, Security Blind Spots (the in-process/output-only analysis is accurate — `ScreenBuffer.text` already routes through `sanitize`). Findings concentrated in Completeness (PF-002), Codebase Alignment / Dependency Reality (PF-001, PF-003), Consistency (PF-004), Testability (PF-005).

## Resolutions (user accepted, 2026-06-29)
PF-001/002/003/005 resolved into `RD-03-view-group-spine.md` + `00-ambiguity-register.md` (new entries AR-43…AR-46); PF-004 corrected in the API sketch; PF-006 accepted. Re-scan confirmed no regressions (no new contradictions; the `caps`-now-required change propagated to AC-10's example).

## Pass/Fail
✅ **PREFLIGHT PASSED — all 5 findings resolved** (2 MAJOR, 3 MINOR), 1 OBSERVATION accepted; no CRITICAL raised. RD-03 is ready to feed the make_plan skill — note the one **new dependency** it introduces: a small additive `runWithOwner` primitive on the done RD-01 (AR-43), which the RD-03 plan must include as its first task.
