# Component: Ownership, Disposal, Errors & Warnings

> **Files**: `owner.ts`, `errors.ts`, `warnings.ts`
> **CodeOps Skills Version**: 2.0.0

The disposal tree that makes the memory-safety guarantee real (AR-03), the typed error
(AR-13), and the dev-warning helper (PA-1) shared by `owner.ts` and `for.ts`.

## Owner / scope tree (`owner.ts`, AR-03)

```ts
/** A node in the disposal tree. */
interface Owner {
  owner: Owner | null;                 // parent scope (null at a root)
  readonly owned: Computation[];       // computations created directly under this scope
  readonly children: Owner[];          // nested owner scopes (createRoot, Show branch, For item)
  cleanups: Array<() => void>;         // onCleanup callbacks registered directly on this owner
  disposed: boolean;
}
```

- Creating an `effect`/`computed` attaches it to `currentOwner.owned`. Creating a nested scope
  (`createRoot`, or a combinator's per-branch/per-item scope — 03-03) pushes onto `currentOwner.children`.
- **`createRoot(fn)`** (AR-03): make a fresh `Owner` (parent = `currentOwner`), set it as
  `currentOwner` for the duration of `fn`, pass `fn` a `dispose()` bound to that owner, restore the
  previous owner, return `fn`'s result.
- **`onCleanup(cb)`** (AR-03): push `cb` onto the **current computation's** `cleanups` if a computation
  is running (so it fires before each re-run), else onto the **current owner's** `cleanups`. Outside
  any computation *and* any owner, it is a no-op dev-warn (same no-owner path below).

## Disposal (AR-03)

`dispose(owner)`:

1. If `owner.disposed`, return (**idempotent** — Should-Have "dispose twice is a safe no-op").
2. Depth-first: dispose `owner.children` first, then for each `owned` computation: remove it from every `source.observers` it subscribes to (releasing dependency edges), run its `cleanups` (LIFO), clear its `sources`.
3. Run the owner's own `cleanups` (LIFO), mark `disposed`, empty `owned`/`children`.

After disposal a subsequent `signal.set` reaches none of the disposed computations (AC-8); each
`onCleanup` ran exactly once (AC-8, AC-9).

**`onCleanup` re-run semantics (AC-9):** a computation runs its own `cleanups` immediately
**before each re-run** (in `scheduler.ts`'s run routine, before `fn` re-executes) and once at
disposal. For an effect with 1 initial run + R re-runs, cleanups fire R+1 times = total run count.

## No-owner policy (AR-14, PA-1)

When `effect`/`computed`/`Show`/`For` is created with `currentOwner === null` (outside any
`createRoot`):

- The computation is **created and fully functional** (it does not throw).
- It is attached to **no** owner ⇒ **never auto-disposed** (caller's responsibility).
- `devWarn(...)` (below) emits **once** for that computation, naming the leak risk (AC-16).

## Errors (`errors.ts`, AR-13)

```ts
import { TuiError } from '@jsvision/core';

/** Thrown when reactive propagation fails to converge within the iteration bound (AR-18). */
export class ReactiveCycleError extends TuiError {
  /** The propagation-iteration limit that was hit (1000 in v1). */
  public readonly iterationLimit: number;
  public constructor(iterationLimit: number) {
    super(
      `Reactive propagation did not converge within ${iterationLimit} iterations ` +
        `(an effect likely writes a signal it depends on).`,
    );
    this.iterationLimit = iterationLimit;
  }
}
```

`extends TuiError` (not bare `Error`) so consumers' `catch (e instanceof TuiError)` covers it
(AR-13). Importing `TuiError` from `@jsvision/core` is the only non-Node import in the subsystem
and does **not** violate `check:deps` (workspace dep, not native).

## Dev-warning helper (`warnings.ts`, PA-1)

```ts
/**
 * Emit a development-only warning. Silenced when NODE_ENV === 'production' so a shipped
 * TUI never writes to the (screen-coupled) console; surfaced otherwise to flag footguns.
 * No public API surface (internal helper) — shared by owner.ts (no-owner) and for.ts (dup key).
 */
export function devWarn(message: string): void {
  if (process.env.NODE_ENV !== 'production') console.warn(`[jsvision/ui reactive] ${message}`);
}
```

- Gating rationale: the project keeps `src` free of `console.*` (screen-safe discipline); PA-1
  chose raw `console.warn` **prod-gated** as the Solid-parity, zero-extra-API option. Tests assert
  emission with `vi.spyOn(console, 'warn')` after forcing a non-production `NODE_ENV` (AC-16, AC-20).
- Distinct from `console.error` used for surplus cascade errors (PA-2), which is **not** gated.

## Traceability

AR-03, AR-13, AR-14, AR-18 · PA-1, PA-2. ACs: 8, 9, 11, 16, 20; Should-Have (idempotent dispose, error class).
