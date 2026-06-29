# RD-01: Reactive Core

> **Document**: RD-01-reactive-core.md
> **Status**: Draft
> **Created**: 2026-06-29
> **Project**: jsvision UI (`@jsvision/ui`)
> **Depends On**: —
> **CodeOps Skills Version**: 2.0.0

---

## Feature Overview

The reactive core is the reactivity layer of the disciplined-hybrid model. It
provides **fine-grained signals** (Solid-style, **not** a React/virtual-DOM
reconciler): values that, when they change, surgically notify exactly the
computations that read them. Every widget property in `@jsvision/ui` will bind to a
signal, and a signal change will mark just the affected widget dirty — no tree diff.

This RD covers the primitives only — `signal`, `computed`, `effect`, ownership and
disposal, `batch`/`untrack`/`onCleanup`, and the two structural combinators `Show`
and `For`. It is fully **UI-independent** (no rendering, no widget types): the binding
of a signal change to a concrete widget redraw lives in the view/group spine (RD-03,
backlog). It is the root of the dependency graph — nothing depends on it being built
first except *everything that comes after it*.

Complexity: **L** overall (the dependency graph + glitch-free scheduling + ownership
tree is the hard part; the combinators and helpers are S–M).

---

## Functional Requirements

### Must Have

- [ ] **`signal<T>(initial, options?)`** — returns a callable accessor: calling it reads (and, inside a tracking context, subscribes); `.set(v)` and `.update(fn)` write; `.peek()` reads without subscribing. (AR-01)
- [ ] **`computed<T>(fn, options?)`** — a read-only derived accessor; **lazy + memoized**: `fn` runs on first read and re-runs only after a tracked dependency changed. (AR-06)
- [ ] **`effect(fn)`** — runs `fn` synchronously once on creation and re-runs it when a tracked dependency changes; bound to the current owner scope and disposed with it. (AR-02, AR-03)
- [ ] **Dynamic dependency tracking** — dependencies are re-collected on every run (a branch not taken this run does not keep its old subscription).
- [ ] **Equality** — change detection uses `Object.is` by default; a write to an equal value notifies nothing. A per-signal/computed `equals` option overrides it; `equals: false` forces notification on every write. (AR-05)
- [ ] **`batch(fn)`** — coalesces all writes inside `fn`; dependent effects run **once**, after `fn` returns, observing final values. **Nested `batch` joins the outer batch** — effects flush only when the outermost `batch` returns. (AR-02, AR-16)
- [ ] **`untrack(fn)`** — runs `fn` and returns its result without subscribing to any signal read inside it. (AR-08)
- [ ] **`onCleanup(fn)`** — registers teardown for the current computation/owner; runs before each re-run of an effect and once when the owner is disposed. (AR-03)
- [ ] **`createRoot(fn)`** — creates an owner scope; `fn` receives a `dispose()` that tears down every computation created under the scope (running their `onCleanup`s). (AR-03)
- [ ] **Glitch-freedom** — when a write triggers a cascade, dependents execute in topological order; no effect/computed ever observes a partially-updated graph (e.g. a diamond dependency yields one consistent re-run). (AR-07)
- [ ] **Runaway guard** — propagation that does not converge (an effect writing a signal it depends on) is bounded by a **fixed maximum of 1000 propagation iterations** (not configurable in v1) and throws a typed `ReactiveCycleError` (extends `@jsvision/core`'s `TuiError`) instead of hanging the event loop. (AR-13, AR-18)
- [ ] **Computation without an owner** — calling `effect`/`computed`/`Show`/`For` with no active owner (outside any `createRoot`) is **allowed**, but the computation is **never auto-disposed**; in dev a `console.warn` flags the potential leak. (AR-14)
- [ ] **Error propagation in a run** — if an `effect`/`computed` `fn` throws, the current run aborts and that computation's `onCleanup` fires; the throw **propagates** to the triggering `set`/`batch` caller; already-applied signal values are **not** rolled back; sibling dependents already queued in the cascade still run. (AR-15)
- [ ] **`Show(when, then, else?)`** — a reactive conditional combinator: yields `then`'s child when `when()` is truthy, `else`'s (or nothing) otherwise; switching branches disposes the previous branch's owner scope. (AR-11)
- [ ] **`For(each, key, render)`** — a keyed list combinator: `render` is called once per new key; on array change, items are created/removed/reordered **by key**, reusing each surviving item's child + owner scope (no re-render on reorder), disposing removed items' scopes. **Keys must be unique among live items**; a duplicate key is a usage error — in dev a `console.warn` is emitted and last-writer-wins. (AR-04, AR-17)
- [ ] **Packaging** — pure TypeScript, no third-party/native runtime dependencies (its only import beyond Node built-ins is the declared workspace dep `@jsvision/core` for `TuiError`; passes `check:deps`), ESM/NodeNext, under `packages/ui/src/reactive/`, re-exported through the single `@jsvision/ui` entry point. (AR-10, AR-13)

### Should Have

- [ ] A typed error class for the runaway guard — `ReactiveCycleError`, **extending `@jsvision/core`'s `TuiError`** (the SDK-wide error base), carrying the iteration limit hit. (AR-13)
- [ ] Disposal idempotency — calling a `dispose()` twice is a safe no-op.

### Won't Have (Out of Scope)

- **Async/resource primitives** (Suspense-style `createResource`, transitions) — not needed for the UI layer now; defer.
- **Store / nested-proxy reactivity** (deep object reactivity à la Solid stores) — signals only for this RD; defer if a real need appears.
- **The `ViewNode` type, widget dirty-marking, and child attachment** — owned by RD-03 (view/group spine); RD-01 only provides the mechanism (see Integration Points & AR-09).
- **JSX / declarative authoring sugar** — the public surface is plain function calls; any JSX layer is a separate, later, optional concern.

---

## Technical Requirements

### Public API surface

```ts
// --- Signals ---
interface Signal<T> {
  (): T;                              // read (subscribes inside a tracking context)
  set(value: T): void;
  update(fn: (prev: T) => T): void;
  peek(): T;                          // read without subscribing
}
type EqualsOption<T> = false | ((a: T, b: T) => boolean);
function signal<T>(initial: T, options?: { equals?: EqualsOption<T> }): Signal<T>;

// --- Computeds (read-only derived) ---
interface Computed<T> { (): T; peek(): T; }
function computed<T>(fn: () => T, options?: { equals?: EqualsOption<T> }): Computed<T>;

// --- Effects & lifecycle ---
function effect(fn: () => void): void;          // disposed with its owner scope
function onCleanup(fn: () => void): void;
function createRoot<T>(fn: (dispose: () => void) => T): T;

// --- Scheduling helpers ---
function batch<T>(fn: () => T): T;
function untrack<T>(fn: () => T): T;

// --- Structural combinators (generic over the rendered child type N) ---
// N is supplied by the view layer (RD-03) as ViewNode; here it is generic so the
// combinators stay UI-independent. Each returns a reactive accessor the consumer
// reads (inside its own effect) to attach/detach children.
function Show<N>(when: () => boolean, then: () => N, else_?: () => N): () => N | undefined;
function For<T, N>(
  each: () => readonly T[],
  key: (item: T, index: number) => unknown,
  render: (item: T, index: () => number) => N,
): () => N[];
```

### Behavior notes

- **Tracking context** — `computed`/`effect` push a tracking context for the duration
  of their run; signal reads inside it register a dependency edge. `untrack` and
  `.peek()` temporarily suspend tracking.
- **Lazy computed** — a computed marks itself "stale" when a dependency changes but
  defers recomputation until next read; memoized result is returned while clean.
- **Synchronous, glitch-free scheduling** — a write marks dependents stale and runs
  them in dependency (topological) order before control returns to the writer (or, in
  a `batch`, after the batch closes). The redraw cadence is **not** RD-01's concern —
  the view layer schedules paints on a frame, so a burst of effects coalesces into one
  paint there (AR-02).
- **Ownership tree** — every `effect`/`computed`/`Show`/`For` is created under the
  current owner (root or a combinator's per-branch/per-item scope). Disposing an owner
  disposes its descendants depth-first, running `onCleanup`s.
- **`For` reconciliation** — maintains a `key → { node, scope }` map; on each `each()`
  change it diffs keys: new keys → create scope + `render`; missing keys → dispose
  scope; surviving keys → reuse, reorder output to match input order; `index` passed to
  `render` is itself reactive so an item can observe its position.

---

## Integration Points

### With RD-03 (View/Group spine — backlog)

- **Property binding** — a widget binds a reactive property by creating an `effect`
  (in the widget's owner scope) that reads the bound signal/getter and marks the
  widget dirty. RD-01 supplies `effect`, the owner tree, and `onCleanup`; RD-03 supplies
  the `ViewNode` type, the dirty flag, and the redraw scheduling. No virtual DOM. (AR-09)
- **Structure** — a `Group` consumes `Show`/`For`'s reactive node accessors inside its
  own effect to attach/detach child views as the accessor's value changes. RD-01
  manages the reactive lifecycle (scopes, when to (re)render, disposal); RD-03 owns
  attaching produced nodes to a parent.

### With RD-02 (Layout engine)

- No direct dependency. Widget layout inputs (sizes, weights) may be signal-backed, in
  which case a re-layout is just another effect — but that wiring lives in the widget/
  view layer, not here.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Signal read/write API | callable+methods · tuple · `.value` | callable + `.set`/`.update`/`.peek` | clean reads, discoverable writes, matches earlier sketch | AR-01 |
| Effect timing | sync + `batch()` · auto-microtask | synchronous + explicit `batch()` | glitch-free, predictable, testable | AR-02 |
| Disposal | owner tree + `onCleanup` · manual handles | owner-scope tree + `onCleanup` | auto teardown on `Show`/`For` unmount; no leaks | AR-03 |
| `For` keying | key fn · reference · index | key function | stable identity across moves/reorders | AR-04 |
| Equality | `Object.is` · deep · always | `Object.is` + `equals` override + `equals:false` | cheap, predictable, escape hatches | AR-05 |
| Computed eval | lazy+memo · eager | lazy + memoized | never compute unused values | AR-06 |
| Consistency | topological · ad-hoc | glitch-free topological | correctness | AR-07 |
| Untracked read | provide · omit | provide `untrack`/`.peek` | needed for read-without-depend | AR-08 |
| Reactive↔view seam | primitives here, binding in RD-03 · invalidation here | primitives here only | keeps reactivity UI-independent | AR-09 |
| Error base class | extend core `TuiError` · standalone `Error` | extend `TuiError` | SDK-wide `catch (e instanceof TuiError)` contract | AR-13 |
| No-owner computation | allow + dev-warn · throw | allow, never auto-disposed, dev-warn | matches Solid; doesn't break top-level/test setup | AR-14 |
| Exception in a run | abort + cleanup + propagate, no rollback · swallow-and-log | abort, fire `onCleanup`, propagate, no rollback | surfaces bugs; predictable scheduler | AR-15 |
| Nested `batch` | outermost-only flush · per-batch flush | outermost-only (inner joins outer) | one consistent flush; Solid-parity | AR-16 |
| `For` duplicate keys | dev-warn + last-writer-wins · throw | unique required; dev-warn + last-writer-wins | a transient duplicate must not crash a valid UI | AR-17 |
| Runaway limit | fixed 1000 (v1) · configurable knob | fixed 1000, not configurable in v1 | deterministic AC; avoid premature config | AR-18 |

> **Traceability:** every decision above references its Ambiguity Register entry. See
> `00-ambiguity-register.md`.

---

## Security Considerations

> A pure, in-process reactivity library: no network, no persistence, no external I/O,
> no untrusted-input parsing. Most categories are N/A and are recorded as such honestly.

- **Data sensitivity**: none — holds in-process developer values only; no PII, no
  credentials, no persistence.
- **Input validation**: the API accepts developer-provided values/functions, not
  untrusted external input. There is no parser, `eval`, template, SQL, shell, HTML, or
  filesystem surface — no injection class applies.
- **Authentication & authorization**: N/A (in-process library, no access boundary).
- **Injection risks**: N/A (see above).
- **Availability / runaway protection** *(the one real concern)*: a reactive cycle
  (an effect writing a signal it depends on) must **not** hang the event loop. The
  scheduler bounds propagation by a **fixed 1000-iteration** limit and throws a typed
  `ReactiveCycleError` (extending `@jsvision/core`'s `TuiError`) instead of looping forever.
- **Memory**: subscriptions are owned by the disposal tree — disposing a scope (e.g. a
  `Show` branch or a removed `For` item) releases all its computations and dependency
  edges. There is no unbounded global registry; long-running apps do not leak
  computations as UI mounts/unmounts. **One documented footgun:** a computation created
  outside any owner (no enclosing `createRoot`) is never auto-disposed — the dev-mode
  `console.warn` (AR-14) flags it; production code mounts every computation under a scope.
- **Encryption / rate limiting / infrastructure**: N/A.

---

## Acceptance Criteria

1. [ ] **Read/write** — `const s = signal(1)`: `s() === 1`; after `s.set(2)`, `s() === 2`; after `s.update(n => n + 1)`, `s() === 3`.
2. [ ] **Equality no-op** — `const s = signal(1); let runs = 0; effect(() => { s(); runs++ })` leaves `runs === 1`; `s.set(1)` (equal) leaves `runs === 1`; `s.set(2)` makes `runs === 2`.
3. [ ] **`equals:false`** — with `signal(1, { equals: false })`, `s.set(1)` re-runs a dependent effect (the equal-value write notifies).
4. [ ] **Lazy + memoized computed** — `const c = computed(spy)` does not call `spy` until `c()` is read; two consecutive `c()` reads with no dependency change call `spy` exactly once; after a dependency changes, the next `c()` read calls `spy` again.
5. [ ] **Effect run count** — creating `effect(() => s())` runs it exactly once; a single `s.set(<new>)` re-runs it exactly once; an `s.set(<equal>)` does not.
6. [ ] **Batch coalescing** — `batch(() => { s.set('a'); s.set('b') })` re-runs a dependent effect exactly once, and that run observes `'b'`.
7. [ ] **Glitch-freedom (diamond)** — with `a = signal(0)`, `b = computed(() => a())`, `d = computed(() => a())`, `effect(() => sink(b() + d()))`, one `a.set(1)` re-runs the effect exactly once, observing `b` and `d` both derived from `1` (never a mixed old/new pair).
8. [ ] **Ownership disposal** — `createRoot(dispose => { effect(() => s()); return dispose })` then calling the returned `dispose()`: a subsequent `s.set(<new>)` does NOT re-run the effect, and any `onCleanup` registered ran exactly once.
9. [ ] **`onCleanup` ordering** — `onCleanup(spy)` runs before every re-run and once at disposal; for an effect with 1 initial run + R re-runs, `spy` fires R+1 times, equal to the total run count (1+R).
10. [ ] **`untrack`** — `effect(() => { a(); untrack(() => b()) })` re-runs when `a` changes but does NOT re-run when `b` changes.
11. [ ] **Runaway guard** — an effect that writes a signal it reads throws `ReactiveCycleError` after the bounded iteration limit; the call returns control (the event loop does not hang).
12. [ ] **`Show`** — `Show(() => cond(), A, B)` yields A's node while `cond()` is true and B's (or `undefined` with no `else`) while false; flipping `cond` disposes the previous branch's scope (its `onCleanup` fires exactly once).
13. [ ] **`For` keyed reuse** — `For(() => items(), it => it.id, render)`: `render` is called once per distinct id; reordering `items` to a permutation of the same ids calls `render` zero additional times and the produced nodes are the same instances in the new order; removing an id disposes that item's scope (its `onCleanup` fires); the produced node order always matches `items` order.
14. [ ] **Packaging** — the reactive subsystem imports nothing beyond the package, its declared workspace deps (`@jsvision/core`, for `TuiError`), and Node built-ins (`yarn check:deps` passes); all public symbols (`signal`, `computed`, `effect`, `batch`, `untrack`, `onCleanup`, `createRoot`, `Show`, `For`, `ReactiveCycleError`) and types (`Signal`, `Computed`) are importable from `@jsvision/ui`.
15. [ ] **Security verified** — no external-input/injection/auth surface exists; the runaway guard (AC-11) bounds propagation; disposal (AC-8) releases subscriptions so repeated mount/unmount does not grow live-computation count without bound.
16. [ ] **No-owner computation** — creating an `effect`/`computed` outside any `createRoot` does NOT throw and returns a working computation; it is never auto-disposed, and in dev a `console.warn` is emitted exactly once for it. (AR-14)
17. [ ] **Exception in a run** — given `effect(() => { s(); throw new Error('x') })`, the throw propagates out of the triggering `s.set(<new>)`; an `onCleanup` registered before the throw ran exactly once; a sibling effect on the same signal still ran; the signal retains its new value (no rollback). (AR-15)
18. [ ] **Nested `batch`** — `batch(() => batch(() => { s.set('a'); s.set('b') }))` re-runs a dependent effect exactly once, and that run observes `'b'`. (AR-16)
19. [ ] **`For` index reactivity** — reordering a `For` list to a permutation of the same keys updates the reactive `index()` observed by a surviving item's effect (the effect re-runs with the item's new position). (PF-008)
20. [ ] **`For` duplicate keys** — two live items resolving to the same key emit a dev `console.warn` and do not crash (last-writer-wins); the produced node count and order remain defined. (AR-17)
