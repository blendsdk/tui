# Requirements & Scope — Reactive Core

> **Source**: [RD-01](../../requirements/RD-01-reactive-core.md)
> **Preflight**: [report](../../requirements/00-preflight-report.md) — ✅ passed (9 findings resolved → AR-13…AR-18)
> **CodeOps Skills Version**: 2.0.0

This document restates the RD-01 scope as the implementation contract. The RD is the
authoritative source; nothing here may contradict it. Acceptance criteria below map 1:1 to
RD-01 AC-1…AC-20 and are realized as specification tests in
[07-testing-strategy.md](07-testing-strategy.md).

## Feature

A fine-grained reactive core (Solid-style) for `@jsvision/ui`: primitives only. No rendering,
no widget types — UI-independent. Lives at `packages/ui/src/reactive/`, re-exported through
`@jsvision/ui`.

## IN scope

**Public API (RD-01 §Public API surface):**

- `signal<T>(initial, options?)` → `Signal<T>` — callable read; `.set`/`.update` write; `.peek()` non-subscribing read. (AR-01)
- `computed<T>(fn, options?)` → `Computed<T>` — read-only, lazy + memoized. (AR-06)
- `effect(fn): void` — runs once on creation, re-runs on tracked-dependency change; disposed with its owner. (AR-02, AR-03)
- `batch<T>(fn): T` — coalesce writes; nested joins outer, flush at outermost close. (AR-02, AR-16)
- `untrack<T>(fn): T` — run without subscribing. (AR-08)
- `onCleanup(fn): void` — teardown before each re-run + once at disposal. (AR-03)
- `createRoot<T>(fn: (dispose) => T): T` — owner scope with a `dispose()`. (AR-03)
- `Show<N>(when, then, else?)` → `() => N | undefined` — reactive conditional; disposes the inactive branch scope. (AR-11)
- `For<T, N>(each, key, render)` → `() => N[]` — keyed list; reuse/reorder by key; reactive `index`. (AR-04)
- `ReactiveCycleError extends @jsvision/core`'s `TuiError`. (AR-13)
- Exported types: `Signal<T>`, `Computed<T>`, `EqualsOption<T>`.

**Behavioral guarantees:**

- Dynamic dependency re-collection every run (untaken branch drops its old subscription).
- Equality: `Object.is` default; `equals` override; `equals:false` always-notify. (AR-05)
- Glitch-free topological propagation; diamond yields one consistent re-run. (AR-07)
- Runaway guard: fixed **1000** propagation iterations → throw `ReactiveCycleError`. (AR-18)
- No-owner computation: allowed, never auto-disposed, dev `console.warn`. (AR-14, PA-1)
- Exception in a run: abort → fire `onCleanup` → propagate to caller; no rollback; queued siblings still run. Multi-throw: first rethrown as-is, rest → `console.error`. (AR-15, PA-2)
- Nested `batch`: outermost-only flush. (AR-16)
- `For` duplicate keys: dev `console.warn` + last-writer-wins. (AR-17, PA-1)

## OUT of scope (RD-01 §Won't Have)

- Async/resource primitives (`createResource`, transitions, Suspense). Defer.
- Store / nested-proxy deep reactivity. Defer.
- `ViewNode` type, widget dirty-marking, child attachment — owned by RD-03. RD-01 supplies the mechanism only. (AR-09)
- JSX / declarative authoring sugar — separate later concern.
- A per-`effect` disposer handle — disposal is owner-scoped only. (PA-5)

## Dependencies / constraints

- **Runtime**: only `@jsvision/core` (`TuiError`) + Node built-ins; no third-party/native deps — `yarn check:deps` must pass. (AR-10)
- **Toolchain**: TypeScript ESM-only, NodeNext (`.js` specifiers on `.ts` sources), `strict`, `noUnusedLocals`/`noUnusedParameters`. Build `tsc`; test vitest `unit` project (`*.{spec,impl}.test.ts`).
- **Prerequisite**: none — RD-01 is the root of the dependency graph. `@jsvision/ui` is scaffolded and CI-green.

## Success criteria (Definition of Done)

1. All 20 specification tests (ST-01…ST-20, mapping RD-01 AC-1…AC-20) pass.
2. Implementation (edge/error) tests pass; happy-path + boundary + error coverage per concern.
3. `yarn verify` green (typecheck + build + unit tests across packages).
4. `yarn workspace @jsvision/ui check:deps` passes (no third-party/native deps).
5. All public symbols + types importable from `@jsvision/ui`.
6. Every `src/reactive/` file ≤ 500 lines; public symbols carry JSDoc.
7. No dead code; ESLint + Prettier clean (`yarn lint`).
