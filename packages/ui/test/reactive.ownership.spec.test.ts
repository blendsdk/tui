/**
 * Specification tests (immutable oracles) — Reactive core, ownership & disposal.
 *
 * Source: RD-01 AC-8, AC-9, AC-16, AC-17 → ST-08, ST-09, ST-16, ST-17
 * (plans/reactive-core/07-testing-strategy.md). Plus RD-03 plan PA-1 / AR-43 →
 * ST-21 (the additive `runWithOwner` primitive — the RD-03 spine creates an
 * imperatively-added child's scope under a chosen parent owner).
 * Expectations derive from the acceptance criteria, never from the implementation.
 */
import { test, expect, vi } from 'vitest';
import { signal, effect, createRoot, onCleanup, runWithOwner, getOwner } from '../src/reactive/index.js';
import type { Owner } from '../src/reactive/index.js';

// ST-08 / AC-8 — disposing the owner scope stops re-runs; onCleanup ran exactly once.
test('ST-08: after dispose, a signal write does not re-run; onCleanup ran once', () => {
  const s = signal(0);
  let runs = 0;
  let cleanups = 0;

  const dispose = createRoot((disposeScope) => {
    effect(() => {
      s();
      runs += 1;
      onCleanup(() => {
        cleanups += 1;
      });
    });
    return disposeScope;
  });
  expect(runs).toBe(1); // ran once on creation

  dispose();
  expect(cleanups).toBe(1); // onCleanup fired exactly once at disposal

  s.set(1);
  expect(runs).toBe(1); // disposed computation does not re-run
});

// ST-09 / AC-9 — onCleanup fires before each re-run and once at disposal:
// R re-runs ⇒ R+1 cleanups = total run count.
test('ST-09: onCleanup fires R+1 times over 1 initial run + R re-runs + disposal', () => {
  const s = signal(0);
  let runs = 0;
  let cleanups = 0;

  const dispose = createRoot((disposeScope) => {
    effect(() => {
      s();
      runs += 1;
      onCleanup(() => {
        cleanups += 1;
      });
    });
    return disposeScope;
  });

  s.set(1); // re-run 1
  s.set(2); // re-run 2
  expect(runs).toBe(3); // 1 initial + 2 re-runs (R = 2)

  dispose();
  expect(cleanups).toBe(3); // R + 1 = total run count
});

// ST-16 / AC-16 — a computation created with no owner works, is never auto-disposed,
// and emits a dev console.warn exactly once (NODE_ENV !== 'production').
test('ST-16: a no-owner effect works, is not auto-disposed, and dev-warns once', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const s = signal(0);
    let runs = 0;

    effect(() => {
      s();
      runs += 1;
    }); // created outside any createRoot

    expect(runs).toBe(1); // fully functional
    s.set(1);
    expect(runs).toBe(2); // never auto-disposed — still reacts
    expect(warnSpy).toHaveBeenCalledTimes(1); // dev warn emitted once
  } finally {
    process.env.NODE_ENV = prevEnv;
    warnSpy.mockRestore();
  }
});

// ST-17 / AC-17 — a throw in a run aborts that run (firing its onCleanup), propagates
// out of the triggering set, leaves the new value in place, and still runs siblings.
test('ST-17: a throwing re-run propagates out of set; sibling runs; no rollback', () => {
  const s = signal(0);
  let siblingRuns = 0;
  let cleanupRan = 0;
  let runCount = 0;

  createRoot(() => {
    effect(() => {
      s();
      siblingRuns += 1;
    });
    effect(() => {
      s();
      runCount += 1;
      onCleanup(() => {
        cleanupRan += 1;
      });
      if (runCount > 1) throw new Error('boom');
    });
  });

  expect(siblingRuns).toBe(1);

  expect(() => s.set(1)).toThrow('boom'); // throw surfaces out of the set

  expect(s()).toBe(1); // no rollback — retains the new value
  expect(siblingRuns).toBe(2); // sibling effect still ran
  expect(cleanupRan).toBeGreaterThanOrEqual(1); // onCleanup before the throw fired
});

// ST-21 / PA-1, AR-43 — runWithOwner runs fn under a CHOSEN owner regardless of the ambient
// context (the imperative-add case the RD-03 spine needs): a scope created inside nests under
// that owner and disposes with it; fn's return value propagates; the previous ambient owner is
// restored afterwards.
test('ST-21: runWithOwner nests created scopes under the chosen owner and restores the ambient owner', () => {
  const s = signal(0);
  let runs = 0;

  // Capture an owner `o`, then leave its scope so the ambient owner is null (top-level) —
  // exactly the situation of an imperatively-constructed child with no ambient parent.
  let o: Owner | null = null;
  const disposeOuter = createRoot((dispose) => {
    o = getOwner();
    return dispose;
  });

  const ambientBefore = getOwner(); // null at the test top level — no active scope
  let ownerInside: Owner | null = null;

  const returned = runWithOwner(o, () => {
    ownerInside = getOwner(); // must be `o` while fn runs
    createRoot(() => {
      effect(() => {
        s();
        runs += 1;
      });
    });
    return 'value';
  });

  expect(ownerInside).toBe(o); // getOwner() inside runWithOwner(o, …) returns o
  expect(getOwner()).toBe(ambientBefore); // previous ambient owner (null) restored afterwards
  expect(returned).toBe('value'); // fn's return value propagated
  expect(runs).toBe(1); // the inner effect ran once on creation

  disposeOuter(); // disposes o → the inner createRoot scope nested under it → the effect
  s.set(1);
  expect(runs).toBe(1); // disposed: a signal write that fed the inner effect runs no work
});
