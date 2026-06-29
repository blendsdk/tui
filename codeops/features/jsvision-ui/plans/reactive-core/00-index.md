# Reactive Core — Implementation Plan (Index)

> **Implements**: RD-01
> **Feature**: `@jsvision/ui` reactive core — `signal`/`computed`/`effect`, ownership &
> disposal, `batch`/`untrack`/`onCleanup`/`createRoot`, and the structural combinators
> `Show`/`For`.
> **Status**: Planned (ready for exec_plan)
> **Created**: 2026-06-29
> **CodeOps Skills Version**: 2.0.0

---

## Overview

The reactive core is the **reactivity layer of the disciplined-hybrid model**: Solid-style
fine-grained signals where a value change surgically notifies exactly the computations that
read it — no tree diff, no virtual DOM. It is **UI-independent** (no rendering, no widget
types); the binding of a signal change to a widget redraw lives in RD-03 (view/group spine,
backlog). This is the root of the `@jsvision/ui` dependency graph: nothing depends on it
being first except everything that comes after.

Greenfield subsystem under `packages/ui/src/reactive/`, re-exported through the single
`@jsvision/ui` entry point, no third-party/native runtime deps (its only non-Node import is
the workspace dep `@jsvision/core` for `TuiError`).

## Document map

| Doc | Purpose |
|-----|---------|
| [00-ambiguity-register.md](00-ambiguity-register.md) | Zero-Ambiguity Gate — plan decisions PA-1…PA-5 + inherited RD AR-01…AR-18 |
| [01-requirements.md](01-requirements.md) | Scope, in/out, success criteria (sourced from RD-01) |
| [02-current-state.md](02-current-state.md) | Codebase analysis, patterns to mirror, target file layout |
| [03-01-reactive-graph.md](03-01-reactive-graph.md) | `signal`/`computed`/`effect`, tracking context, glitch-free scheduler, `batch`/`untrack`, runaway guard, exception handling |
| [03-02-ownership.md](03-02-ownership.md) | Owner/scope tree, `createRoot`/`onCleanup`, disposal, no-owner policy, `ReactiveCycleError` + dev-warn helper |
| [03-03-combinators.md](03-03-combinators.md) | `Show` + `For` (keyed reconciliation, reactive `index`, duplicate-key policy) |
| [07-testing-strategy.md](07-testing-strategy.md) | Specification test cases ST-01…ST-NN traced to RD-01 AC-1…AC-20 |
| [99-execution-plan.md](99-execution-plan.md) | Phases, sessions, task checklist (spec-first ordering) |

## Key decisions (at a glance)

| Decision | Choice | Ref |
|----------|--------|-----|
| Reactivity model | Fine-grained signals, synchronous + glitch-free, lazy/memoized computeds | AR-02, AR-06, AR-07 |
| Signal API | callable accessor + `.set`/`.update`/`.peek` | AR-01 |
| Disposal | owner-scope tree + `onCleanup`; no-owner allowed but dev-warned | AR-03, AR-14 |
| Error model | `ReactiveCycleError extends TuiError`; runaway bound = fixed 1000 | AR-13, AR-18 |
| Dev warnings | raw `console.warn`, gated `NODE_ENV !== 'production'` | PA-1 |
| Multi-throw cascade | drain, rethrow first as-is, rest → `console.error` | PA-2 |
| File layout | granular split (scheduler isolated), ~13 src + ~13 test files | PA-3 |

## To begin implementation

Use the **exec_plan** skill on `reactive-core`. Commits reference **/gitcm** / **/gitcmp**;
the verify command is `yarn verify` (per the project CLAUDE.md). Scoped per-package iteration:
`yarn workspace @jsvision/ui test`.
