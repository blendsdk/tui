# Testing Strategy — Reactive Core

> **CodeOps Skills Version**: 2.0.0

Specification-first (CLAUDE.md): write `*.spec.test.ts` from RD-01 acceptance criteria → confirm
red → implement → green → add `*.impl.test.ts` for internals/edges → verify. **Spec tests are
immutable oracles**: each ST below derives from an RD-01 AC, never from implementation behavior. If
a spec test fails after implementation, the implementation is wrong.

All tests are vitest `unit` (`*.{spec,impl}.test.ts`), importing the API **by name** from
`../src/reactive/index.js` (or `@jsvision/ui` for the packaging spec). Test files per
[02-current-state.md](02-current-state.md) §Test file layout.

## Specification test cases (ST → AC, 1:1)

| ST | File | Input → Expected | Trace |
|----|------|------------------|-------|
| ST-01 | signal.spec | `s=signal(1)`: `s()===1`; `s.set(2)`→`s()===2`; `s.update(n=>n+1)`→`s()===3` | AC-1 / AR-01 |
| ST-02 | signal.spec | `s=signal(1)`, `effect(()=>{s();runs++})`→`runs===1`; `s.set(1)`→`runs===1`; `s.set(2)`→`runs===2` | AC-2 / AR-05 |
| ST-03 | signal.spec | `s=signal(1,{equals:false})`: `s.set(1)` re-runs a dependent effect (equal write notifies) | AC-3 / AR-05 |
| ST-04 | computed.spec | `c=computed(spy)`: `spy` uncalled until first `c()`; two reads, no dep change → `spy` called once; after a dep change, next read calls `spy` again | AC-4 / AR-06 |
| ST-05 | effect.spec | `effect(()=>s())` runs once; one `s.set(new)` re-runs once; `s.set(equal)` does not | AC-5 / AR-02 |
| ST-06 | scheduling.spec | `batch(()=>{s.set('a');s.set('b')})` re-runs a dependent effect once, observing `'b'` | AC-6 / AR-02 |
| ST-07 | scheduling.spec | Diamond `a=signal(0)`, `b=computed(()=>a())`, `d=computed(()=>a())`, `effect(()=>sink(b()+d()))`; one `a.set(1)` → effect re-runs **once**, never a mixed old/new pair | AC-7 / AR-07 |
| ST-08 | ownership.spec | `createRoot(dispose=>{effect(()=>s()); return dispose})`; after `dispose()`, `s.set(new)` does NOT re-run; any `onCleanup` ran exactly once | AC-8 / AR-03 |
| ST-09 | ownership.spec | Effect with `onCleanup(spy)`: over 1 initial run + R re-runs then disposal, `spy` fires R+1 times = total run count | AC-9 / AR-03 |
| ST-10 | effect.spec | `effect(()=>{a();untrack(()=>b())})` re-runs when `a` changes, NOT when `b` changes | AC-10 / AR-08 |
| ST-11 | scheduling.spec | An effect that writes a signal it reads throws `ReactiveCycleError` after the 1000-iteration bound; control returns (loop does not hang) | AC-11 / AR-18 |
| ST-12 | combinators.spec | `Show(()=>cond(),A,B)` yields A while `cond()` true, B (or `undefined`, no `else`) while false; flipping `cond` disposes the previous branch scope (its `onCleanup` fires exactly once) | AC-12 / AR-11 |
| ST-13 | combinators.spec | `For(()=>items(),it=>it.id,render)`: `render` once per distinct id; reorder to a permutation → 0 extra `render` calls, same node instances in new order; removing an id disposes its scope (`onCleanup` fires); output order always matches `items` | AC-13 / AR-04 |
| ST-14 | packaging.spec | All public symbols (`signal`,`computed`,`effect`,`batch`,`untrack`,`onCleanup`,`createRoot`,`Show`,`For`,`ReactiveCycleError`) and types (`Signal`,`Computed`,`EqualsOption`) import from `@jsvision/ui`; `yarn check:deps` passes | AC-14 / AR-10, AR-13 |
| ST-15 | packaging.spec | No external-input/injection/auth surface; runaway guard bounds propagation (ST-11); **behavioral leak check**: over N repeated `createRoot`→`effect(()=>s())`→`dispose()` cycles, a final `s.set(new)` re-runs **zero** of the disposed effects (disposal released every subscription — extends ST-08 across cycles). No reliance on internal observer-set introspection (none is exposed by the public API; PF-001) | AC-15 |
| ST-16 | ownership.spec | Creating an `effect`/`computed` outside any `createRoot` does NOT throw, returns a working computation, is never auto-disposed, and emits a dev `console.warn` exactly once (with `NODE_ENV!=='production'`) | AC-16 / AR-14, PA-1 |
| ST-17 | ownership.spec | `effect(()=>{s();throw Error('x')})`: throw propagates out of the triggering `s.set(new)`; an `onCleanup` registered before the throw ran once; a sibling effect on `s` still ran; `s` retains its new value (no rollback) | AC-17 / AR-15 |
| ST-18 | scheduling.spec | `batch(()=>batch(()=>{s.set('a');s.set('b')}))` re-runs a dependent effect once, observing `'b'` (nested joins outer) | AC-18 / AR-16 |
| ST-19 | combinators.spec | Reordering a `For` list to a permutation of the same keys updates the reactive `index()` observed by a surviving item's effect (it re-runs with the new position) | AC-19 / PF-008 |
| ST-20 | combinators.spec | Two live `For` items resolving to the same key emit a dev `console.warn` and do not crash (last-writer-wins); the output array has length === `items.length` with the surviving (last-writer) node repeated at every position holding that key, in `items` order (PA-6) | AC-20 / AR-17, PA-1, PA-6 |

## Implementation tests (`*.impl.test.ts`) — internals & edges (not exhaustive)

- **signal.impl**: custom `equals` predicate honored; `.peek()` reads without subscribing inside an effect; `update` receives prev value.
- **computed.impl**: `CHECK`→`CLEAN` demotion when a source recomputes to an equal value (no downstream re-run); nested computed (computed reading computed) memoizes correctly; computed `equals:false`.
- **effect.impl**: dynamic dependency drop — an effect taking branch A then B no longer re-runs on A's signal; nested effects each track independently.
- **scheduling.impl**: write inside `untrack` still propagates to *other* observers; `batch` returns `fn`'s result; multi-throw in one cascade → first rethrown as-is, additional errors hit `console.error` (PA-2, spy); context (`currentObserver`/`batchDepth`) restored after a throw.
- **ownership.impl**: `dispose()` twice is a safe no-op (idempotent); depth-first disposal order; `onCleanup` outside any computation/owner is a no-op (dev-warn); `ReactiveCycleError.iterationLimit === 1000` and `instanceof TuiError`.
- **combinators.impl**: `Show` memoizes the boolean (no branch rebuild when `when`'s deps change but truthiness holds); `For` item-object change under a stable key updates the item without re-render; empty/absent `each()` array; removing then re-adding a key creates a fresh scope.

## Security tests (mandatory subset)

- **Runaway/availability** (ST-11): the cycle guard returns control, no hang.
- **Memory/disposal** (ST-08, ST-15): after dispose, no live computations reachable from a signal; assert **behaviorally** — over N repeated `createRoot`+`dispose` cycles a final `s.set(new)` re-runs none of the disposed effects (released subscriptions). Observer-set sizes are **not** asserted directly (the public API exposes no such introspection; PF-001).
- **No-owner leak surfacing** (ST-16): the documented footgun emits its dev warning.
- N/A categories (injection/auth/authz/rate-limiting) recorded as N/A — pure in-process library, no external input (RD-01 §Security).

## Verification

- Targeted: `yarn workspace @jsvision/ui test` (and `test -- <file>` while iterating).
- Full gate before done: `yarn verify` + `yarn workspace @jsvision/ui check:deps` + `yarn lint`.
