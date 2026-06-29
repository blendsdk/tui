/**
 * Ownership & disposal tree (RD-01, 03-02; AR-03, AR-14) — what makes the memory-safety
 * guarantee real. An owner holds the computations and child scopes created under it;
 * disposing it tears them all down, depth-first.
 *
 * This module depends only on the scheduler's tracking-context accessors (one-directional:
 * owner → scheduler), keeping the two free of a concrete import cycle (02-current-state
 * §Layering).
 */
import type { Computation, Owner } from './types.js';
import { runCleanups } from './cleanup.js';
import { devWarn } from './warnings.js';
import { getObserver, getOwner, setOwner } from './scheduler.js';

/** @returns A fresh, undisposed owner whose parent is the given owner (or `null` at a root). */
function createOwner(parent: Owner | null): Owner {
  return { owner: parent, owned: [], children: [], cleanups: [], disposed: false };
}

/**
 * Attach a freshly created computation (effect or computed) to the current owner scope so
 * it is disposed with that scope. With no current owner (AR-14) the computation is left
 * unowned — fully functional but never auto-disposed — and a one-time dev warning flags the
 * leak risk (PA-1).
 *
 * @param computation The computation to attach.
 */
export function attachComputation(computation: Computation): void {
  const owner = getOwner();
  if (owner !== null) {
    computation.owner = owner;
    owner.owned.push(computation);
    return;
  }
  computation.owner = null;
  devWarn(
    'a computation was created outside any createRoot() scope; it will never be ' +
      'auto-disposed (potential leak). Wrap it in createRoot((dispose) => …) to manage its lifetime.',
  );
}

/**
 * Register a child owner scope under the current owner (`createRoot`, or a combinator's
 * per-branch/per-item scope). Unowned child scopes are allowed (same no-owner policy as
 * computations) and are simply not linked into any parent.
 *
 * @returns The new child owner.
 */
export function createChildScope(): Owner {
  const parent = getOwner();
  const scope = createOwner(parent);
  if (parent !== null) parent.children.push(scope);
  return scope;
}

/**
 * Create a root owner scope and run `fn` under it, passing `fn` a `dispose()` bound to that
 * scope (AR-03). The previous owner is restored afterwards (try/finally).
 *
 * @param fn Receives the scope's `dispose`; its return value is returned by `createRoot`.
 * @returns `fn`'s return value.
 */
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const scope = createChildScope();
  const previousOwner = getOwner();
  setOwner(scope);
  try {
    return fn(() => dispose(scope));
  } finally {
    setOwner(previousOwner);
  }
}

/**
 * Run `fn` with `owner` as the ambient owner scope, restoring the previous owner afterwards
 * (try/finally; re-entrant and nestable). Unlike {@link createRoot} this creates **no** new
 * scope — it re-parents creation onto a *chosen, already-existing* owner, so a `createRoot`,
 * `effect`, `computed`, or `signal` created inside `fn` attaches to `owner` and is disposed with
 * it (AR-43, PA-1). This is the seam RD-03 needs to nest an imperatively-added child view's scope
 * under its parent — `createRoot` alone would nest under the *ambient* owner, which is `null` for a
 * `new View()` constructed outside any scope.
 *
 * Sets the **owner** only, not a tracking (observer) context — reads inside `fn` do not subscribe;
 * an `effect` created inside still tracks normally when it runs. With `owner === null`, created
 * computations are unowned and dev-warn, consistent with the no-owner policy (AR-14).
 *
 * @param owner The owner to make ambient for the duration of `fn` (or `null` for unowned).
 * @param fn The function to run; its return value is returned by `runWithOwner`.
 * @returns `fn`'s return value.
 */
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const previousOwner = getOwner();
  setOwner(owner);
  try {
    return fn();
  } finally {
    setOwner(previousOwner);
  }
}

/**
 * Register a teardown callback (AR-03). Inside a running computation it joins that
 * computation's cleanups (fired before each re-run and once at disposal); otherwise it joins
 * the current owner's cleanups (fired once at disposal). Outside any computation *and* any
 * owner it cannot ever run, so it is a no-op with a dev warning.
 *
 * @param cb The teardown callback.
 */
export function onCleanup(cb: () => void): void {
  const observer = getObserver();
  if (observer !== null) {
    observer.cleanups.push(cb);
    return;
  }
  const owner = getOwner();
  if (owner !== null) {
    owner.cleanups.push(cb);
    return;
  }
  devWarn('onCleanup() was called outside any computation or owner scope; it will never run.');
}

/**
 * Dispose an owner scope (AR-03), idempotently. Depth-first: dispose child scopes, then
 * release each owned computation's dependency edges and fire its cleanups, then fire the
 * owner's own cleanups. After disposal a subsequent signal write reaches none of the
 * disposed computations (AC-8), and each `onCleanup` has run exactly once (AC-8, AC-9).
 *
 * @param owner The owner to dispose. Disposing an already-disposed owner is a safe no-op.
 */
export function dispose(owner: Owner): void {
  if (owner.disposed) return;
  owner.disposed = true; // set first: a cleanup that re-triggers dispose sees a no-op

  // Depth-first: child scopes first. Snapshot because each child removes itself below.
  for (const child of owner.children.slice()) {
    dispose(child);
  }

  // Release each owned computation's edges, then fire its onCleanups.
  for (const computation of owner.owned) {
    for (const source of computation.sources) {
      source.observers.delete(computation);
    }
    computation.sources.clear();
    runCleanups(computation.cleanups);
  }

  // The owner's own cleanups, then detach from the tree.
  runCleanups(owner.cleanups);
  owner.owned.length = 0;
  owner.children.length = 0;

  const parent = owner.owner;
  if (parent !== null) {
    const index = parent.children.indexOf(owner);
    if (index !== -1) parent.children.splice(index, 1);
  }
}
