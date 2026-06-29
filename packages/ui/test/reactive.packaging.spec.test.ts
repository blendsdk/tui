/**
 * Specification tests (immutable oracles) — Reactive core, packaging & security.
 *
 * Source: RD-01 AC-14, AC-15 → ST-14, ST-15 (plans/reactive-core/07-testing-strategy.md).
 * Imports the public API **by name** from `@jsvision/ui` (the published entry point), proving
 * every reactive symbol and type is reachable through the single package surface — not via an
 * internal path. Expectations derive from the acceptance criteria, never from the implementation.
 */
import { test, expect } from 'vitest';
import {
  signal,
  computed,
  effect,
  batch,
  untrack,
  onCleanup,
  createRoot,
  Show,
  For,
  ReactiveCycleError,
  type Signal,
  type Computed,
  type EqualsOption,
} from '@jsvision/ui';

// ST-14 / AC-14 — every public reactive symbol is importable from `@jsvision/ui`.
test('ST-14: all public reactive symbols are importable from @jsvision/ui', () => {
  const callables = [signal, computed, effect, batch, untrack, onCleanup, createRoot, Show, For];
  for (const fn of callables) {
    expect(fn).toBeTypeOf('function');
  }
  expect(ReactiveCycleError).toBeTypeOf('function');
  expect(new ReactiveCycleError(1000)).toBeInstanceOf(Error);
});

// ST-14 / AC-14 — the public reactive types are importable from `@jsvision/ui`.
// These annotations fail to typecheck if a type is missing from the public surface.
test('ST-14: the public reactive types are importable from @jsvision/ui', () => {
  const s: Signal<number> = signal(1);
  const c: Computed<number> = computed(() => s() + 1);
  const eq: EqualsOption<number> = (a, b) => a === b;

  expect(s()).toBe(1);
  expect(c()).toBe(2);
  expect(eq(1, 1)).toBe(true);
});

// ST-15 / AC-15 — security: no external-input/injection/auth surface (pure in-process library);
// the runaway guard bounds propagation (covered by ST-11). Memory safety is asserted
// **behaviorally** (no internal observer-set introspection — none is exposed; PF-001): over many
// mount/unmount cycles, disposal releases every subscription so a later write re-runs none of the
// disposed effects.
test('ST-15: disposal releases subscriptions across repeated mount/unmount cycles', () => {
  const s = signal(0);
  let runs = 0;
  const cycles = 50;

  for (let i = 0; i < cycles; i += 1) {
    const dispose = createRoot((disposeScope) => {
      effect(() => {
        s();
        runs += 1;
      });
      return disposeScope;
    });
    dispose(); // tear the scope down immediately
  }

  expect(runs).toBe(cycles); // each effect ran exactly once on creation

  s.set(1); // every effect was disposed → none should re-run
  expect(runs).toBe(cycles); // zero disposed effects re-ran (subscriptions were released)
});
