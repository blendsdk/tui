# Preflight Report — Reactive Core (`plans/reactive-core/`)

> **Artifact**: implementation plan `plans/reactive-core/` (implements RD-01)
> **Reviewed**: 2026-06-29
> **Reviewer**: preflight (CodeOps 2.0.0) — 13-dimension, codebase-grounded audit
> **Iteration**: 1
> **Outcome**: ✅ **PASSED** — all 6 findings resolved (fixes applied 2026-06-29, user-approved)

This report is the post-creation safety net for the `reactive-core` plan. It is separate
from the plan's Ambiguity Register (`00-ambiguity-register.md`, creation-time PA-1…PA-5)
and from the upstream requirements preflight (`requirements/00-preflight-report.md`).

## Codebase Context Summary

The plan targets a **clean greenfield add** under `packages/ui/src/reactive/` — verified
absent (`ls packages/ui/src/reactive` → no such dir). Every structural claim the plan makes
was checked against the real code and **holds**:

| Plan claim | Verified against | Result |
|---|---|---|
| `TuiError(message)` base, extendable | `packages/core/src/engine/safety/errors.ts:16-24` | ✅ ctor takes a single `message` — `ReactiveCycleError`'s `super(msg)` is valid |
| `TuiError` importable from `@jsvision/core` | `packages/core/src/engine/index.ts:104` | ✅ re-exported |
| subsystem barrel pattern | `packages/ui/src/layout/index.ts:8` | ✅ matches |
| single entry re-export | `packages/ui/src/index.ts:19` | ✅ matches |
| `@jsvision/core` is a declared dep; `check:deps` fails only on native | `packages/ui/package.json:29-33` | ✅ workspace dep is fine |
| two-project vitest (`unit` = `*.{spec,impl}.test.ts`) | `packages/ui/vitest.config.ts:14-22` | ✅ matches |
| no `console.*` anywhere in `packages/*/src` (PA-1 rationale) | `grep -rn 'console\.' …/src` → empty | ✅ confirmed |
| RD-01 AC-1…AC-20, AC-19 ↦ PF-008 | `requirements/RD-01-reactive-core.md:203-222` | ✅ all 20 ACs mapped 1:1 to ST-01…ST-20 |

Scheduler design (mark/flush, CHECK/DIRTY, lazy pull, memo-equal short-circuit) was
walked against the standard Solid/"reactively" two-phase algorithm — diamond, signal+computed
mixed reads, and the "stop descending at ≥ CHECK" rule all resolve glitch-free under lazy
pull. **No correctness defect found in the propagation design.**

This is a **strong, well-grounded plan**. No CRITICAL or MAJOR findings. The notes below are
testability/clarity refinements worth resolving before `exec_plan`.

## Findings

### 🟡 PF-001 — MINOR (Testability) — ST-15 "observer-set sizes return to baseline" is not assertable through the public API

`07-testing-strategy.md:32,51` make the memory/no-leak claim concrete by asserting "observer-set
sizes return to baseline over mount/unmount cycles." But the public surface (`signal`/`computed`)
exposes **no observer-count introspection** (`()`, `.set`, `.update`, `.peek` only), and the spec
file imports **by name** from `@jsvision/ui`. As written, that assertion cannot be implemented.

- **Recommendation**: reformulate ST-15's leak check to **behavioral** assertions already
  available — after `dispose()`, a `signal.set` does **not** re-run the effect (this is ST-08),
  repeated over N mount/unmount cycles. If a quantitative check is wanted, add a clearly-marked
  **test-only internal seam** (e.g. an `__observerCount(source)` exported from
  `../src/reactive/` and imported only by an `*.impl.test.ts`, never the public barrel).
- **Dropped**: `process.memoryUsage()` heuristics — non-deterministic, flaky, unfit for a spec oracle.

### 🟡 PF-002 — MINOR (Testability / Ambiguity) — duplicate-key `For` output (ST-20 / AC-20) is not pinned to a concrete shape

`03-03-combinators.md:49` produces the output "in `items` order by mapping each key to its entry's
node," and AC-20/ST-20 require only that "node count and order remain **defined**." With
last-writer-wins, two same-key items can resolve **either** to (a) the single surviving node
repeated at both positions (output length = `items.length`) **or** (b) one collapsed slot (length =
distinct-key count). ST-20 is an **immutable spec oracle** — it must assert a concrete length/order,
which "defined" does not provide.

- **Recommendation**: pin **(a)** — iterate `items`, resolve each position's key to its (deduped)
  entry node, so output length always equals `items.length` and the duplicate node simply repeats.
  It is the least surprising for an RD-03 consumer attaching nodes positionally, and gives ST-20 a
  concrete oracle. Record the choice as a new PA entry (the RD intentionally left AC-20 loose; the
  plan is where it gets pinned).

### 🟡 PF-003 — MINOR (Completeness / Clarity) — `Show`'s internal driver (eager effect vs lazy-on-read) is under-specified

`03-03-combinators.md:17-24` calls `Show` "internally a `computed`" returning an accessor "read
inside an effect," yet the flip performs **eager side effects** ("dispose the previous branch's
scope; create a fresh scope"). Whether branch disposal/creation runs **eagerly** (an internal
effect/memo observing `cond`) or **lazily** (only when the returned accessor is read) decides
whether AC-12's "`onCleanup` fires **exactly once** per flip" holds when the accessor is read zero
or multiple times between flips.

- **Recommendation**: state explicitly that an **internal memo keyed on the boolean `cond`** drives
  the flip (Solid's `createMemo` + per-branch `createRoot` model) — disposal is bound to `cond`
  transitions, independent of how many times the accessor is read. This is the design the doc
  already gestures at; making it explicit removes the AC-12 ambiguity.

### 🟡 PF-004 — MINOR (Consistency) — `EqualsOption<T>` export status is inconsistent between the API surface and ST-14

`01-requirements.md:32` lists exported types as "`Signal<T>`, `Computed<T>`, `EqualsOption<T>`" and
`03-01-reactive-graph.md:38` says "Public types `Signal`/`Computed`/`EqualsOption` are exported."
But ST-14 (`07-testing-strategy.md:31`) and RD-01 AC-14 verify only `Signal` and `Computed` import
from `@jsvision/ui` — `EqualsOption` is omitted from the import assertion.

- **Recommendation**: treat `EqualsOption<T>` as part of the public type surface (it appears in the
  `signal`/`computed` `options` signature, so consumers writing a typed `equals` will reference it)
  — re-export it through `reactive/index.ts` → `src/index.ts` and **add it to ST-14's import list**.
  Alternative (if it's meant to stay internal): drop it from `01-requirements.md:32` and
  `03-01:38`. Either way, make the two statements agree.

### 🔵 PF-005 — OBSERVATION — `Show` "Created with no active owner ⇒ no-owner dev-warn path" reads as unconditional

`03-03-combinators.md:24` can be misread as "`Show` always detaches from the current owner and
always dev-warns." Intent is the **AR-14 edge** (only when `Show` is called outside any
`createRoot`). Suggest rewording to "**If** created outside any owner, the same no-owner dev-warn
path applies (AR-14)."

### 🔵 PF-006 — OBSERVATION — batch `For`'s per-item index-signal writes during reconciliation

On reorder, reconciliation writes each surviving item's index signal (`03-03:48`), and those writes
re-enter the scheduler. Wrapping the diff + index updates in an internal `batch` coalesces a single
reorder into one flush (and avoids intermediate index states leaking to item effects). Minor
perf/clarity; not blocking. (Also: the `MAX_PROPAGATION_ITERATIONS` comment at `03-01:101` cites
"(AR-18, PA-2)" — the runaway guard is AR-18; PA-2 is multi-throw. Trim to AR-18 when transcribed
to source.)

## Resolutions (applied 2026-06-29)

| # | Resolution |
|---|---|
| PF-001 | ST-15 + security §Memory reformulated to a **behavioral** N-cycle leak check (disposed effects re-run zero times); no observer-set introspection assumed (`07-testing-strategy.md`). |
| PF-002 | New **PA-6** pins `For` output length === `items.length` (duplicate node repeated); ST-20 and `03-03` step 6 + guarantees updated. |
| PF-003 | `03-03` `Show` now specifies an **inner memo keyed on `cond`** drives the flip, independent of accessor read count (AC-12 holds). |
| PF-004 | `EqualsOption<T>` added to ST-14's import assertion and the `reactive/index.ts` barrel note (`02-current-state.md`). |
| PF-005 | `Show` "no active owner" reworded to the conditional AR-14 edge. |
| PF-006 | `For` reconciliation diff + index writes wrapped in one `batch`; `03-01:101` comment trimmed to AR-18. |

## Status

**✅ PREFLIGHT PASSED — all 6 findings resolved.** Zero 🔴/🟠 throughout. Design and codebase
grounding are sound; the plan is ready for `exec_plan`.
