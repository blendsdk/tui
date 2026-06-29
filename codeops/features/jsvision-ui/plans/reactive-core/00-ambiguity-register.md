# Ambiguity Register — Reactive Core (RD-01)

> **Plan**: `plans/reactive-core/`
> **Status**: ✅ GATE PASSED — all items resolved, user-confirmed 2026-06-29
> **CodeOps Skills Version**: 2.0.0

This plan implements **RD-01** (`requirements/RD-01-reactive-core.md`), which was
authored and **preflighted** (`requirements/00-preflight-report.md`). All *behavioral*
decisions are already locked upstream as **AR-01…AR-18** in
`requirements/00-ambiguity-register.md` and are inherited verbatim — they are **not**
re-litigated here. This register captures only the **plan-level** decisions the RD left
open (warning emission, multi-error scheduler behavior, file structure), numbered
`PA-NN`, plus a traceability map of the inherited requirements decisions.

## Plan-level decisions (PA-NN)

| PA # | Category | Question | Options Considered | Decision | Status |
|------|----------|----------|--------------------|----------|--------|
| PA-1 | Error/Logging | How are the dev-only warnings (no-owner AR-14, duplicate `For` key AR-17) emitted + gated, given no `src` code uses `console.*` (screen-safe discipline)? | (a) raw `console.warn`, gated `NODE_ENV !== 'production'` (Solid-parity, zero API, prod-silent, spy-testable); (b) injectable `setReactiveWarning(fn)` handler (adds public API beyond AC-14); (c) always-on `console.warn` (noisy in prod) | **(a)** raw `console.warn`, emitted only when `process.env.NODE_ENV !== 'production'` | ✅ Resolved (user) |
| PA-2 | Edge case / Scheduler | When >1 effect throws in a single cascade (AC-17 pins only the single-throw case), what happens? | (a) drain cascade, rethrow the FIRST error as-is to the `set`/`batch` caller, report the rest via `console.error`; (b) `AggregateError` (changes thrown type, weakens AC-17); (c) first wins, rest swallowed (hides bugs) | **(a)** first rethrown as-is; additional errors → `console.error` (not gated; real errors) | ✅ Resolved (user) |
| PA-3 | Architecture / Files | Internal file split for `src/reactive/` + spec/impl test layout | (a) **granular** (~13 src + ~13 test files, scheduler isolated); (b) consolidated `graph.ts` (risks >500 lines) | **(a) granular split** (see 02-current-state.md §Target layout) | ✅ Resolved (user) |
| PA-4 | Naming | Feature/folder name for the plan + subsystem dir | `reactive-core` plan dir; `packages/ui/src/reactive/` source dir (matches RD-01 line 51 + AR-10) | **As stated** — only viable per project conventions | ✅ Resolved |
| PA-5 | Scope | Does `effect` expose a per-effect disposer handle? | RD types `effect(fn): void` (AR-03 owner-tree disposal only); a return handle is out of scope | **No handle** — disposal is owner-scoped only (RD-01 API surface) | ✅ Resolved (RD) |
| PA-6 | Edge case / Combinator | `For` output array shape when two live items resolve to the same key (AC-20 pins only "defined", needs a concrete oracle for ST-20) | (a) iterate `items`, resolve each position's key to its last-writer-wins entry node ⇒ **length === `items.length`**, duplicate node repeated; (b) collapse to distinct keys ⇒ length < `items.length` (surprising for a consumer attaching nodes positionally) | **(a)** length always === `items.length`, duplicate node repeated per position, in `items` order | ✅ Resolved (preflight PF-002) |

## Inherited requirements decisions (RD-01 AR-NN) — traceability

These are **already resolved** in `requirements/00-ambiguity-register.md`; listed so plan
docs can back-reference them. Not re-opened.

| AR # | Decision (summary) |
|------|--------------------|
| AR-01 | Signal API: callable accessor + `.set`/`.update`/`.peek` |
| AR-02 | Effects synchronous + glitch-free; `batch(fn)` coalesces; redraw cadence is RD-03's |
| AR-03 | Disposal: owner-scope tree + `onCleanup`; disposing a scope disposes all under it |
| AR-04 | `For` keyed by a key function (stable identity across moves) |
| AR-05 | Equality: `Object.is` default; per-signal `equals` override; `equals:false` always-notify |
| AR-06 | `computed` lazy + memoized |
| AR-07 | Glitch-free topological propagation (no partial-graph reads) |
| AR-08 | Provide `untrack(fn)` (+ `.peek()`) |
| AR-09 | Reactive↔view seam: RD-01 primitives only; RD-03 binds effect→widget-dirty |
| AR-10 | Packaging: `packages/ui/src/reactive/`, no third-party/native deps, ESM/NodeNext, re-exported via `@jsvision/ui` |
| AR-11 | `Show` mounts one branch, disposes the inactive branch's scope, re-evaluates on `when` change |
| AR-13 | `ReactiveCycleError extends @jsvision/core`'s `TuiError` |
| AR-14 | No-owner computation: allowed, never auto-disposed, dev `console.warn` (see PA-1) |
| AR-15 | Throw in a run: abort run → fire its `onCleanup` → propagate to caller, no rollback, queued siblings still run (see PA-2 for multi-throw) |
| AR-16 | Nested `batch` joins the outer; flush only at outermost close |
| AR-17 | `For` keys unique among live items; duplicate → dev warn + last-writer-wins (see PA-1) |
| AR-18 | Runaway guard: fixed 1000 propagation iterations, not configurable in v1 |

> **Gate enforcement:** every design/scope/error-handling decision in the plan documents
> back-references a `PA-NN` (plan) or `AR-NN` (requirements) entry above. Zero items
> deferred; the user confirmed PA-1…PA-3 on 2026-06-29, and PA-6 (preflight PF-002) on the
> same day.
