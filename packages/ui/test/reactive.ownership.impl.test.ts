/**
 * Implementation tests — Reactive core, ownership (internals & edges; 07 §impl).
 *
 * Idempotent disposal, depth-first teardown order, the no-scope `onCleanup` no-op, and the
 * `ReactiveCycleError` shape (`iterationLimit === 1000`, `instanceof TuiError`).
 */
import { test, expect, vi } from 'vitest';
import { TuiError } from '@jsvision/core';
import {
  signal,
  effect,
  createRoot,
  onCleanup,
  ReactiveCycleError,
  runWithOwner,
  getOwner,
} from '../src/reactive/index.js';
import type { Owner } from '../src/reactive/index.js';

test('dispose() twice is a safe no-op (idempotent)', () => {
  let cleanups = 0;
  const dispose = createRoot((disposeScope) => {
    onCleanup(() => {
      cleanups += 1;
    });
    return disposeScope;
  });

  dispose();
  dispose(); // second call must not re-run cleanups
  expect(cleanups).toBe(1);
});

test('disposal is depth-first: child scopes tear down before their parent', () => {
  const order: string[] = [];
  const dispose = createRoot((disposeScope) => {
    onCleanup(() => order.push('parent'));
    createRoot(() => {
      onCleanup(() => order.push('child'));
    });
    return disposeScope;
  });

  dispose();
  expect(order).toEqual(['child', 'parent']);
});

test('onCleanup outside any computation or owner is a no-op with a dev warning', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    expect(() => onCleanup(() => {})).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  } finally {
    process.env.NODE_ENV = previousEnv;
    warnSpy.mockRestore();
  }
});

test('ReactiveCycleError carries iterationLimit 1000 and is a TuiError', () => {
  const constructed = new ReactiveCycleError(1000);
  expect(constructed.iterationLimit).toBe(1000);
  expect(constructed).toBeInstanceOf(TuiError);

  // The error actually thrown by the runaway guard has the same shape.
  const s = signal(0);
  let thrown: unknown;
  try {
    effect(() => {
      const v = s();
      s.set(v + 1);
    });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ReactiveCycleError);
  expect(thrown).toBeInstanceOf(TuiError);
  if (thrown instanceof ReactiveCycleError) {
    expect(thrown.iterationLimit).toBe(1000);
  }
});

// --- runWithOwner internals & edges (RD-03 PA-1 / AR-43; 07 §impl) ---

test('runWithOwner(null, …) leaves a created computation unowned (dev-warn, never auto-disposed)', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const s = signal(0);
    let runs = 0;

    // Even though we're inside a live outer scope, runWithOwner(null) makes the effect unowned.
    const disposeOuter = createRoot((dispose) => {
      runWithOwner(null, () => {
        effect(() => {
          s();
          runs += 1;
        });
      });
      return dispose;
    });

    expect(runs).toBe(1); // fully functional
    expect(warnSpy).toHaveBeenCalledTimes(1); // no-owner dev warn (AR-14)

    disposeOuter(); // must NOT dispose the unowned effect
    s.set(1);
    expect(runs).toBe(2); // still reacts — it was never linked to the outer scope
  } finally {
    process.env.NODE_ENV = previousEnv;
    warnSpy.mockRestore();
  }
});

test('nested runWithOwner restores the previous owner at each level', () => {
  let o1: Owner | null = null;
  let o2: Owner | null = null;
  createRoot((d) => {
    o1 = getOwner();
    return d;
  });
  createRoot((d) => {
    o2 = getOwner();
    return d;
  });

  const seen: (Owner | null)[] = [];
  runWithOwner(o1, () => {
    seen.push(getOwner()); // o1
    runWithOwner(o2, () => {
      seen.push(getOwner()); // o2
    });
    seen.push(getOwner()); // restored to o1
  });
  seen.push(getOwner()); // restored to the ambient (null)

  expect(seen).toEqual([o1, o2, o1, null]);
});

test('a throw inside runWithOwner still restores the previous owner (finally)', () => {
  let o: Owner | null = null;
  createRoot((d) => {
    o = getOwner();
    return d;
  });

  const before = getOwner(); // null at the test top level
  expect(() =>
    runWithOwner(o, () => {
      throw new Error('boom');
    }),
  ).toThrow('boom');
  expect(getOwner()).toBe(before); // restored despite the throw
});
