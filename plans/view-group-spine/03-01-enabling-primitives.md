# Component: Enabling Primitives (`runWithOwner`, `ScreenBuffer.clone`)

> **Files**: `packages/ui/src/reactive/owner.ts`, `packages/ui/src/reactive/index.ts`,
> `packages/core/src/engine/render/buffer.ts`
> **CodeOps Skills Version**: 2.0.0

Two small, fully back-compatible **additive** primitives the spine needs. Both were
user-approved during planning; each is a Phase-1 task with its own specification test, and
each commits under its owning subsystem's scope (`reactive`, `render`).

---

## 1. RD-01 `runWithOwner` + `getOwner` + opaque `Owner` (PA-1, AR-43)

### Why

`createRoot` nests its new scope under the **ambient** owner at call time (`owner.ts:49,63`).
An imperatively-constructed `new View()` runs with `getOwner() === null`, so its scope would
not nest under its parent and disposing the parent would not dispose it — the leak the RD-03
preflight caught (PF-001). `runWithOwner` lets `Group.add` create a child's scope under a
**chosen** parent owner regardless of the ambient context.

### API

```ts
// reactive/owner.ts
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T;
// reactive/index.ts (additions)
export { runWithOwner } from './owner.js';
export { getOwner } from './scheduler.js';
export type { Owner } from './types.js';   // opaque token — fields stay internal
```

### Behavior (spec)

- Runs `fn` with `owner` as the current ambient owner, then **restores** the previous owner
  in a `finally` (re-entrant / nestable); returns `fn`'s return value.
- A `createRoot`/`effect`/`computed`/`signal` created **inside** `fn` attaches to `owner`
  (so disposing `owner` disposes it). With `owner === null`, created computations are unowned
  and dev-warn — consistent with the no-owner policy (AR-14).
- It sets the **owner** only, **not** a tracking (observer) context — reads inside `fn` do not
  subscribe; an `effect` created inside still tracks normally when it runs.
- `getOwner()` returns the current `Owner | null` handle for later use with `runWithOwner`.

### Implementation

```ts
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const previousOwner = getOwner();   // scheduler.ts:41
  setOwner(owner);                    // scheduler.ts:52
  try {
    return fn();
  } finally {
    setOwner(previousOwner);
  }
}
```

Mirrors `createRoot`'s own try/finally owner-restore (`owner.ts:65-71`). No change to
`createRoot`, `dispose`, or any existing signature → RD-01's ownership spec tests stay green.

### Tests (extend `reactive.ownership.{spec,impl}` — PA-5)

- **ST-21 (spec)**: `createRoot((disposeOuter) => { const o = getOwner(); runWithOwner(o, () => createRoot(() => { effect(() => sig()); })); ... })` — disposing the outer scope disposes the inner effect (a later `sig.set` runs no work); `getOwner()` inside `runWithOwner(o, …)` returns `o`; the ambient owner is restored afterwards.
- **impl**: `runWithOwner(null, …)` leaves an inner computation unowned (dev-warn, never auto-disposed); nested `runWithOwner` restores correctly; `fn`'s return value is propagated; a throw in `fn` still restores the previous owner.

---

## 2. core `ScreenBuffer.clone()` (PA-8, AR-44)

### Why

AC-7 requires **partial recompose** (only the dirty view's `draw()` runs). With one persistent
screen buffer, core `serialize(current, previous, {caps})` then needs a faithful snapshot of
the **previous** frame to diff against. `ScreenBuffer` exposes no clone, and a view-layer copy
via public `get`/`set` cannot reproduce wide-glyph **continuation** cells (`set()` recomputes
width from the char). The exact copy belongs in core, which owns the cell array.

### API

```ts
// render/buffer.ts (additive method)
/** @returns A deep, independent copy of this buffer (same dims + exact cell state). */
public clone(): ScreenBuffer;
```

### Behavior (spec)

- Returns a new `ScreenBuffer` with the same `width`/`height` and a **deep copy** of every
  cell (char, `fg`/`bg`/`attrs`, and `width` 0/1/2 — including wide-lead and continuation
  cells), independent of the original (mutating one does not affect the other).
- `serialize(b.clone(), b, {caps})` over an unchanged pair emits an empty diff body (the clone
  equals the original cell-for-cell).

### Implementation

Copy the internal `cells` array element-wise (each `Cell` is a small record). The buffer ctor
already allocates `width*height` cells (`buffer.ts:49-58`); `clone()` allocates a sibling and
assigns copied cell fields. No public-API behavior change to existing methods.

### Tests (`packages/core/test/render-buffer-clone.spec.test.ts` — PA-5)

- **ST-22 (spec)**: write ASCII + a wide glyph (e.g. `'世'`, width 2 + a continuation cell) +
  a styled run into a buffer; `clone()` it; assert (a) `serialize(clone, original, {caps})`
  body is empty (exact equality incl. the continuation cell), (b) mutating the clone does not
  change the original, (c) dims match.

## Traceability

PA-1, PA-5, PA-8 · AR-43, AR-44. Enables AC-1/AC-11 (scope nesting) and AC-7/AC-19 (diff).
