# Component: Reactive Graph (signal · computed · effect · scheduler)

> **Files**: `types.ts`, `signal.ts`, `computed.ts`, `effect.ts`, `scheduler.ts`
> **CodeOps Skills Version**: 2.0.0

The dependency graph + glitch-free scheduling — RD-01's hard core (complexity L). This doc
specifies the node model, the tracking context, the propagation algorithm, and the
`batch`/`untrack` helpers, the runaway guard, and exception handling.

## Node model (`types.ts`)

Two cooperating node kinds. A **computed is both** a source (others read it) and a computation
(it reads others), so the interfaces compose.

```ts
/** Public signal accessor (AR-01). */
interface Signal<T> { (): T; set(v: T): void; update(fn: (prev: T) => T): void; peek(): T; }
/** Public read-only derived accessor (AR-06). */
interface Computed<T> { (): T; peek(): T; }
/** Change-equality policy (AR-05). `false` ⇒ always notify. */
type EqualsOption<T> = false | ((a: T, b: T) => boolean);

/** Internal: a value others can subscribe to (signal or computed). */
interface Source<T> { value: T; equals: (a: T, b: T) => boolean; readonly observers: Set<Computation>; }
/** Internal: a tracked computation (effect or computed). */
interface Computation {
  fn: () => unknown;
  readonly sources: Set<Source<unknown>>;   // re-collected every run (dynamic tracking)
  state: NodeState;                          // CLEAN | CHECK | DIRTY
  owner: Owner | null;                       // for disposal (see 03-02)
  cleanups: Array<() => void>;               // onCleanup callbacks (see 03-02)
  readonly isEffect: boolean;
}
const enum NodeState { CLEAN, CHECK, DIRTY }
```

> `NodeState` is an internal discriminator constant (not a bare string literal) per the type-safety
> standard. Public types `Signal`/`Computed`/`EqualsOption` are exported; `Source`/`Computation`/
> `NodeState` are internal to the subsystem.

## Tracking context (`scheduler.ts`)

Module-level mutable context (single-threaded JS — safe):

- `currentObserver: Computation | null` — the computation whose `fn` is running; signal reads register an edge to it.
- `currentOwner: Owner | null` — the owner new computations attach to (see 03-02).
- `batchDepth: number` — `> 0` while inside `batch`; writes queue instead of flushing.
- `pendingEffects: Computation[]` — effects queued for the current flush.

**Reading a source** (`signal()` / `computed()` call): if `currentObserver` is set, add the
source to `currentObserver.sources` and add the observer to `source.observers` (bidirectional
edge). `untrack`/`.peek()` read with `currentObserver` temporarily `null` ⇒ no edge (AR-08).

## Signals (`signal.ts`)

- `signal(initial, options?)` builds a `Source` with `equals = options.equals === false ? () => false : (options.equals ?? Object.is)` (AR-05).
- **read** `s()` — register edge (above), return `value`. `.peek()` = read with tracking suspended.
- **write** `s.set(v)` — if `equals(value, v)` ⇒ **no-op, notify nothing** (AR-05); else assign and **propagate** (below). `s.update(fn)` = `s.set(fn(peek()))`.

## Computeds (`computed.ts`)

Lazy + memoized (AR-06). A computed is a `Source` (memoized `value`) **and** a `Computation`.

- First `c()` read (state `DIRTY`): run `fn` under tracking, memoize `value`, state → `CLEAN`.
- Subsequent read when `CLEAN`: return memoized `value` (no recompute) — satisfies AC-4 "two reads ⇒ one call".
- Read when `CHECK`: a source *might* have changed — pull each source up to date; if any is now `DIRTY`-equivalent, recompute; else demote to `CLEAN` and return memo. (Glitch-free lazy pull.)
- Recompute compares new vs old via the computed's `equals`; if equal, observers are **not** marked dirty (downstream doesn't re-run) — key to diamond minimal-runs (AC-7).

## Effects (`effect.ts`)

- `effect(fn)` creates a `Computation` with `isEffect = true`, attaches to `currentOwner` (or the no-owner path, 03-02), then **runs it once synchronously** (AC-5). The run sets `currentObserver`, clears old edges, executes `fn`, collects new edges.
- An effect has no memoized value and no observers; it is a leaf sink.
- `effect` returns `void` (PA-5 — no per-effect disposer; disposal is owner-scoped).

## Propagation algorithm (glitch-free, synchronous) — `scheduler.ts`

On a **changed** signal write (AR-07 glitch-freedom):

1. **Mark phase (no user code runs):** for each direct observer of the source, mark `DIRTY`; for each *transitive* observer reached through computeds, mark `CHECK` (a maybe-dirty marker) and recurse — stop descending at nodes already `≥ CHECK`. Effects reached are pushed to `pendingEffects` (de-duplicated).
2. **Flush phase:** if `batchDepth === 0`, drain `pendingEffects`. Each effect, before running, **pulls** its sources up to date (a `CHECK` computed resolves to `CLEAN`/recompute via the lazy rule above) — so by the time the effect's `fn` runs every dependency is final ⇒ no effect ever observes a partial graph. A diamond (`a → b,d → effect`) recomputes `b` and `d` once each and runs the effect once (AC-7).
3. Memoized-equal computeds short-circuit step 1's descent (they don't mark their observers), so an unchanged derived value triggers no downstream work.

> **Why lazy pull gives glitch-freedom:** effects are the only eager nodes; computeds recompute
> only when pulled, and memoization guarantees one recompute per cascade. Running effects after the
> full mark phase, each pulling its (now-consistent) computeds, is the standard Solid/"reactively"
> two-phase scheme.

## `batch` and `untrack`

- `batch(fn)` (AR-02, AR-16): increment `batchDepth`, run `fn`, capture result; decrement; when it returns to **0**, flush `pendingEffects` once. **Nested `batch` joins the outer** — inner increments/decrements but only the outermost `0`-transition flushes ⇒ effects run once observing final values (AC-6, AC-18). Returns `fn`'s result.
- `untrack(fn)` (AR-08): save `currentObserver`, set `null`, run `fn`, restore, return result. `.peek()` uses the same suspension.

## Runaway guard (AR-18) — `scheduler.ts`

The flush loop counts iterations of the drain (an effect that writes a signal it reads re-enqueues
itself). A module constant **`MAX_PROPAGATION_ITERATIONS = 1000`** bounds it; on exceed, throw
`ReactiveCycleError` (03-02) carrying the limit, and clear `pendingEffects` so control returns —
the event loop never hangs (AC-11).

```ts
const MAX_PROPAGATION_ITERATIONS = 1000; // fixed, not configurable in v1 (AR-18)
```

## Exception handling (AR-15, PA-2) — `scheduler.ts`

If a computation's `fn` throws (initial run or re-run):

- Abort that run, run the computation's `cleanups` (its `onCleanup`s — 03-02), leave already-applied signal values in place (**no rollback**).
- Sibling effects already in `pendingEffects` **still run** (the drain continues past the throw, collecting further errors).
- **After the drain:** if any errors were collected, **rethrow the first as-is** to the triggering `set`/`batch` caller (so a caller catching a specific error type still gets it — AC-17); report each additional error via `console.error` (PA-2; not `NODE_ENV`-gated — these are real errors, not dev hints).
- The graph is left consistent for nodes that did not throw; a throwing computed retains its prior memo and `DIRTY` state (re-pulled on next read).

## Invariants (asserted by impl tests)

- `sources` fully re-collected each run; an untaken branch's old edge is gone (RD-01 "dynamic dependency tracking").
- `currentObserver`/`currentOwner`/`batchDepth` are always restored on both normal and throwing exits (try/finally).
- A computation appears at most once in `pendingEffects` per flush.
- No effect's `fn` runs during the mark phase.

## Traceability

AR-01, AR-02, AR-05, AR-06, AR-07, AR-08, AR-15, AR-16, AR-18 · PA-2 · PA-5. ACs: 1–7, 10, 11, 17, 18.
