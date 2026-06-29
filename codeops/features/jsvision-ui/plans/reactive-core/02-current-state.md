# Current State Analysis — Reactive Core

> **CodeOps Skills Version**: 2.0.0

## Summary

`packages/ui/src/reactive/` does **not exist** — this is a clean greenfield add to an
already-scaffolded, CI-green `@jsvision/ui`. There is no reactivity code to migrate or refactor;
the archived Ink/React prototype (`_archive/`) is reference-only and uses React reconciliation,
which is explicitly **not** the model here (AR-09). The work is purely additive.

## Patterns to mirror (verified against the code)

| Pattern | Evidence | Apply to reactive |
|---------|----------|-------------------|
| Subsystem dir + barrel `index.ts` re-export | `packages/ui/src/layout/index.ts:8` re-exports from `apportion.js`; `packages/core/src/engine/color/index.ts` is the fuller model | `src/reactive/index.ts` re-exports public symbols; `src/index.ts` re-exports those again |
| Single public entry re-export | `packages/ui/src/index.ts:19` re-exports layout symbols | Add `export { signal, computed, … } from './reactive/index.js'` |
| `.js` specifier on `.ts` source (NodeNext) | `packages/ui/src/index.ts:16`, layout files | All intra-subsystem imports use `.js` |
| Typed error extends `TuiError` | `packages/core/src/engine/safety/errors.ts:16`; re-exported `engine/index.ts:104`; importable as `@jsvision/core` `TuiError` (exports map → `dist/engine/index.js`) | `ReactiveCycleError extends TuiError` (AR-13) |
| Readonly, well-JSDoc'd public API | `packages/ui/src/layout/apportion.ts:16-30` (typed unions, `@param`/`@returns`) | Public symbols get full JSDoc |
| Spec test = immutable oracle from the requirement | `packages/ui/test/apportion.spec.test.ts:1-10` (header cites ADR, derives from requirement not impl) | ST cases derive from RD-01 ACs |
| Import core by name, never internals | `packages/ui/test/core-integration.spec.test.ts:9` (`from '@jsvision/core'`) | Import `TuiError` from `@jsvision/core` |
| Two-project vitest: `unit`=`*.{spec,impl}.test.ts` | `packages/ui/vitest.config.ts` | All reactive tests are `unit`; no e2e needed |

## Constraints confirmed from manifests

- `tsconfig.base.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, `module`/`moduleResolution` NodeNext, `target` ES2022. Intentionally-unused params use the `_param` convention.
- `packages/ui/package.json`: `@jsvision/core` is a declared dependency (`"*"`); `private: true`; `check:deps` script = `node ../../scripts/check-no-native-deps.mjs .` (fails only on native deps — a workspace dep is fine).
- **No `console.*` calls exist anywhere in `packages/*/src`** — the project keeps output screen-safe (`@jsvision/core` `safety/logger.ts`). This is *why* PA-1 gates the dev warnings behind `NODE_ENV !== 'production'` rather than emitting unconditionally.

## Target file layout (PA-3, granular split)

```
packages/ui/src/reactive/
├── index.ts          # barrel: re-export public symbols + the public types Signal<T>, Computed<T>, EqualsOption<T> (→ src/index.ts; verified by ST-14, PF-004)
├── types.ts          # Signal<T>, Computed<T>, EqualsOption<T> (public) + internal node/owner interfaces
├── errors.ts         # ReactiveCycleError extends TuiError (AR-13)
├── warnings.ts       # devWarn(msg): NODE_ENV-gated console.warn helper (PA-1) — shared by owner.ts + for.ts
├── owner.ts          # Owner/scope tree, createRoot, onCleanup, disposal, no-owner policy (AR-03, AR-14)
├── scheduler.ts      # tracking context (current observer/owner), glitch-free topological propagation,
│                     #   batch, untrack, runaway guard (AR-18), exception drain (AR-15, PA-2)
├── signal.ts         # signal() factory: read/subscribe, set/update, peek, equality (AR-01, AR-05)
├── computed.ts       # computed() lazy + memoized derived node (AR-06)
├── effect.ts         # effect() — owner-bound side-effecting node (AR-02, AR-03)
├── show.ts           # Show(when, then, else?) (AR-11)
└── for.ts            # For(each, key, render): keyed reconciliation, reactive index, dup-key policy (AR-04, AR-17)
```

> **Layering** (foundation-first): `types` → `errors`/`warnings` → `scheduler`/`owner` →
> `signal`/`computed`/`effect` → `show`/`for` → `index`. Each upper layer imports only from
> lower layers. The scheduler and owner are mutually aware via interfaces declared in `types.ts`
> (no cyclic concrete imports).

## Test file layout (PA-3)

```
packages/ui/test/
├── reactive.signal.spec.test.ts      / .impl.test.ts   # AC-1,2,3
├── reactive.computed.spec.test.ts    / .impl.test.ts   # AC-4
├── reactive.effect.spec.test.ts      / .impl.test.ts   # AC-5,10
├── reactive.scheduling.spec.test.ts  / .impl.test.ts   # AC-6,7,11,18
├── reactive.ownership.spec.test.ts   / .impl.test.ts   # AC-8,9,16,17
├── reactive.combinators.spec.test.ts / .impl.test.ts   # AC-12,13,19,20
└── reactive.packaging.spec.test.ts                     # AC-14,15
```

## Risks / watch-items

- **Scheduler is the hard part** (RD-01 complexity L). Glitch-free topological order + lazy
  computeds + dynamic dependency re-collection + a bounded runaway guard interact. Isolated in
  `scheduler.ts` and covered by the densest spec block (ST for AC-6/7/11/18).
- **`For` keyed reconciliation** (reuse on reorder, reactive index, dup-key last-writer-wins) is
  the second-densest area; isolated in `for.ts`.
- **No-owner + exception edges** rest the memory-safety claim — covered explicitly (ST for AC-16/17),
  not left to impl.
