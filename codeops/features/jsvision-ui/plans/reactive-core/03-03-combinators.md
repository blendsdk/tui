# Component: Structural Combinators (`Show` · `For`)

> **Files**: `show.ts`, `for.ts`
> **CodeOps Skills Version**: 2.0.0

The two structural primitives (AR-11, AR-04). Both are **UI-independent**: they are generic over
the rendered child type `N` (supplied as `ViewNode` by RD-03 later) and each returns a **reactive
accessor** the consumer reads inside its own `effect` to attach/detach children (AR-09). They build
on the reactive graph (03-01) and the owner tree (03-02).

## `Show` (`show.ts`, AR-11)

```ts
function Show<N>(when: () => boolean, then: () => N, else_?: () => N): () => N | undefined;
```

- Internally a `computed` over a **memoized boolean** `cond = computed(() => !!when())` so the
  branch only re-evaluates when the truthiness actually flips (not on every `when` dependency tick).
- **Driver (PF-003):** the branch is produced by an **inner memo keyed on `cond`** — a `computed`
  whose body reads `cond()` and, *only when the boolean value transitions*, performs the flip. The
  flip is therefore bound to `cond` transitions, **independent of how many times** the returned
  accessor is read (Solid's `createMemo` + per-branch `createRoot` model). This is what makes AC-12's
  "`onCleanup` fires **exactly once** per flip" hold regardless of read count.
- Maintains the active branch under its **own child owner scope**. On a flip (a `cond` transition):
  1. dispose the previous branch's scope (its `onCleanup`s fire **exactly once** — AC-12),
  2. create a fresh child scope (`createRoot`) and evaluate `then()` (truthy) or `else_?.()` (falsy ⇒ `undefined` if no `else`).
- Returns `() => N | undefined` — a reactive accessor yielding the current branch's node. Reading it
  inside an effect re-attaches on change; reading it zero or many times between flips changes nothing.
- **If** `Show` is created outside any owner (no enclosing `createRoot`), the same no-owner dev-warn
  path applies to its internal memo (03-02, AR-14) — it is not unconditional.

## `For` (`for.ts`, AR-04)

```ts
function For<T, N>(
  each: () => readonly T[],
  key: (item: T, index: number) => unknown,
  render: (item: T, index: () => number) => N,
): () => N[];
```

**State:** a `Map<unknown, Entry>` where `Entry = { node: N; scope: Owner; setIndex: (i: number) => void; item: T }`.
Each entry owns a per-item **index signal** so `render`'s `index: () => number` is reactive (AC-19).

**Reconciliation** on each `each()` change (driven by an internal `computed`/`effect` over `each`).
The whole diff — including every index-signal write in step 5 — runs inside a single **`batch`**
(PF-006) so one list change coalesces to one flush and no item effect observes an intermediate
index state:

1. Compute the new key list `keys[i] = key(items[i], i)`.
2. **Duplicate-key guard (AR-17, PA-1):** while building the new key set, if a key repeats among
   the *live* items, `devWarn(...)` once for that render and apply **last-writer-wins** (the later
   item claims the entry). No throw — a transient duplicate during an in-flight data update must not
   crash a valid UI.
3. **New** keys → create a child owner scope + index signal, call `render(item, indexAccessor)`, store the `Entry`.
4. **Missing** keys (in old map, not in new) → dispose that entry's scope (`onCleanup` fires — AC-13) and delete it.
5. **Surviving** keys → **reuse** the existing `node` + `scope` (no `render` re-call — AC-13); if the item's position changed, update its index signal (drives AC-19); if the item object changed under the same key, update `Entry.item`.
6. Produce the output array by iterating **`items` in order** and resolving each position's key to its
   (deduped) entry `node` — so output **length always equals `items.length`** and a duplicated key
   simply repeats its last-writer-wins node at each position holding it (PA-6; AC-13/AC-20: order and
   count always defined and matching input length).

**Guarantees realized:**
- `render` called once per distinct key over the list's life (AC-13).
- Reorder = a permutation of the same keys ⇒ zero additional `render` calls; same node instances, new order (AC-13).
- Reorder updates each surviving item's reactive `index()` (AC-19).
- Removed key ⇒ its scope disposed, `onCleanup` fires (AC-13).
- Duplicate key ⇒ dev-warn + last-writer-wins, no crash; output length === `items.length` with the surviving node repeated per duplicate position (PA-6; AC-20).

> **`key` returns `unknown`** — used directly as a `Map` key (any value is a valid `Map` key); no
> cast needed, type-safe (no `as`).

## Disposal integration

Both combinators create child owner scopes under `currentOwner`; when an enclosing scope is
disposed (03-02), every branch/item scope is torn down depth-first — no manual cleanup needed by
RD-03 consumers.

## Traceability

AR-04, AR-09, AR-11, AR-14, AR-17 · PA-1. ACs: 12, 13, 19, 20.
