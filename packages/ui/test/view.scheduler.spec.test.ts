/**
 * Specification tests (immutable oracles) — coalescing scheduler + partial recompose.
 *
 * Source: RD-03 AC-7, AC-8, AC-9, AC-10 → ST-07, ST-08, ST-09, ST-10
 * (codeops/features/jsvision-ui/plans/view-group-spine/07-testing-strategy.md).
 * Determinism via an injected scheduler that CAPTURES the flush callback (the test runs it),
 * counting draws per view. Expectations derive from the acceptance criteria, never the impl.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import { signal } from '../src/reactive/index.js';
import { View, Group, createRenderRoot } from '../src/view/index.js';
import type { DrawContext } from '../src/view/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

/** A leaf that counts how many times it was drawn (and fills, so it fully covers its rect). */
class Counter extends View {
  draws = 0;
  constructor(private readonly ch: string) {
    super();
  }
  draw(ctx: DrawContext): void {
    this.draws += 1;
    ctx.fill(this.ch);
  }
}

/** A capturing scheduler: records the pending flush callback instead of running it. */
function capturing(): { schedule: (fn: () => void) => void; run: () => void; calls: () => number } {
  let pending: (() => void) | null = null;
  let count = 0;
  return {
    schedule: (fn): void => {
      count += 1;
      pending = fn;
    },
    run: (): void => {
      const fn = pending;
      pending = null;
      if (fn) fn();
    },
    calls: () => count,
  };
}

// ST-07 / AC-7 — bind ⇒ repaint of only that view's subtree, coalesced into one frame.
test('ST-07: a bind change repaints only the bound view’s subtree (siblings not redrawn)', () => {
  const sig = signal(0);
  const a = new Counter('A');
  a.layout = { size: { kind: 'fixed', cells: 2 } };
  const b = new Counter('B');
  b.layout = { size: { kind: 'fixed', cells: 2 } };
  const root = new Group();
  root.layout = { direction: 'row' };
  root.add(a);
  root.add(b);

  // bind in onMount (PA-2): re-applies + repaints `a` when `sig` changes.
  a.onMount(() => {
    a.bind(
      () => sig(),
      () => {},
    );
  });

  const sched = capturing();
  const rr = createRenderRoot({ width: 4, height: 1 }, { caps, schedule: sched.schedule });
  rr.mount(root); // full compose → a.draws=1, b.draws=1; bind's initial apply scheduled a frame
  sched.run(); // drain the bind's initial repaint (partial → only a)

  const bBefore = b.draws;
  sig.set(1); // effect re-runs → apply + invalidate(a) → schedules one flush
  sched.run(); // partial recompose of a only

  expect(a.draws).toBeGreaterThan(1); // a was repainted
  expect(b.draws).toBe(bBefore); // b was NOT redrawn — only a's subtree recomposed
});

// ST-08 / AC-8 — N invalidate() within one tick coalesce into exactly one scheduled flush.
test('ST-08: N invalidate() in a tick produce exactly one scheduled flush', () => {
  const v = new Counter('V');
  v.layout = { size: { kind: 'fixed', cells: 2 } };
  const root = new Group();
  root.layout = { direction: 'row' };
  root.add(v);

  const sched = capturing();
  const rr = createRenderRoot({ width: 2, height: 1 }, { caps, schedule: sched.schedule });
  rr.mount(root); // synchronous; does not route through the scheduler

  const before = sched.calls();
  v.invalidate();
  v.invalidate();
  v.invalidate();
  expect(sched.calls() - before).toBe(1); // three invalidations → one scheduled flush (coalesced)
});

// ST-09 / AC-9 — a draw-only invalidate recomposes WITHOUT a reflow (partial: siblings not
// redrawn); an invalidateLayout runs a reflow + full recompose (siblings redrawn).
test('ST-09: repaint recomposes only the dirty subtree; relayout recomposes the whole tree', () => {
  const a = new Counter('A');
  a.layout = { size: { kind: 'fixed', cells: 2 } };
  const b = new Counter('B');
  b.layout = { size: { kind: 'fixed', cells: 2 } };
  const root = new Group();
  root.layout = { direction: 'row' };
  root.add(a);
  root.add(b);

  const sched = capturing();
  const rr = createRenderRoot({ width: 4, height: 1 }, { caps, schedule: sched.schedule });
  rr.mount(root); // a.draws=1, b.draws=1

  a.invalidate(); // repaint-only
  sched.run();
  expect(a.draws).toBe(2);
  expect(b.draws).toBe(1); // partial — no reflow, b not redrawn

  a.invalidateLayout(); // relayout
  sched.run();
  expect(b.draws).toBe(2); // full recompose after reflow — b redrawn too
});

// ST-10 / AC-10 — all flush scheduling routes through the injected scheduler (no queueMicrotask).
test('ST-10: flush scheduling routes through the injected scheduler', () => {
  const v = new Counter('V');
  v.layout = { size: { kind: 'fixed', cells: 2 } };
  const root = new Group();
  root.layout = { direction: 'row' };
  root.add(v);

  const sched = capturing();
  const rr = createRenderRoot({ width: 2, height: 1 }, { caps, schedule: sched.schedule });
  rr.mount(root);

  const before = sched.calls();
  v.invalidate();
  expect(sched.calls() - before).toBe(1); // the injected fn received the flush scheduling
  sched.run();
  expect(v.draws).toBeGreaterThanOrEqual(2); // and running it produced a frame
});
