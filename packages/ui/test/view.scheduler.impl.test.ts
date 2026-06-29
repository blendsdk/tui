/**
 * Implementation tests — scheduler + partial recompose (internals & edges; 07 §impl).
 *
 * `{ relayout: true }` binds reflow; onMount→bind schedules exactly one extra coalesced frame;
 * pre-mount invalidate is a no-op; a reflow refreshes the compose cache (new bounds).
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import { signal } from '../src/reactive/index.js';
import { View, Group, createRenderRoot } from '../src/view/index.js';
import type { DrawContext } from '../src/view/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

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

test('bind with { relayout: true } triggers a reflow + full recompose', () => {
  const sig = signal(0);
  const a = new Counter('A');
  a.layout = { size: { kind: 'fixed', cells: 2 } };
  const b = new Counter('B');
  b.layout = { size: { kind: 'fixed', cells: 2 } };
  const root = new Group();
  root.layout = { direction: 'row' };
  root.add(a);
  root.add(b);

  a.onMount(() => {
    a.bind(
      () => sig(),
      () => {},
      { relayout: true },
    );
  });

  const sched = capturing();
  const rr = createRenderRoot({ width: 4, height: 1 }, { caps, schedule: sched.schedule });
  rr.mount(root);
  sched.run(); // drain the bind's initial frame

  const bBefore = b.draws;
  sig.set(1); // relayout bind → invalidateLayout → reflow + full recompose
  sched.run();
  expect(b.draws).toBeGreaterThan(bBefore); // sibling redrawn → full recompose ran
});

test('onMount → bind initial apply schedules exactly one coalesced frame', () => {
  const sig = signal(0);
  const v = new Counter('V');
  v.layout = { size: { kind: 'fixed', cells: 2 } };
  const root = new Group();
  root.layout = { direction: 'row' };
  root.add(v);

  v.onMount(() => {
    v.bind(
      () => sig(),
      () => {},
    );
  });

  const sched = capturing();
  const rr = createRenderRoot({ width: 2, height: 1 }, { caps, schedule: sched.schedule });
  const before = sched.calls();
  rr.mount(root); // mount → reflow → onMount → bind → one initial invalidate

  expect(sched.calls() - before).toBe(1); // exactly one extra coalesced frame
});

test('invalidate()/invalidateLayout() before mount are safe no-ops', () => {
  const v = new Counter('V');
  expect(() => v.invalidate()).not.toThrow();
  expect(() => v.invalidateLayout()).not.toThrow();
});

test('a reflow refreshes the compose cache so later frames use the new bounds', () => {
  const a = new Counter('A');
  a.layout = { size: { kind: 'fixed', cells: 2 } };
  const b = new Counter('B');
  b.layout = { size: { kind: 'fr', weight: 1 } };
  const root = new Group();
  root.layout = { direction: 'row' };
  root.add(a);
  root.add(b);

  const sched = capturing();
  const rr = createRenderRoot({ width: 6, height: 1 }, { caps, schedule: sched.schedule });
  rr.mount(root);
  expect(rr.buffer().get(0, 0)?.char).toBe('A'); // a at cols 0..1
  expect(rr.buffer().get(2, 0)?.char).toBe('B'); // b at cols 2..5

  a.state.visible = false; // hide a → relayout
  a.invalidateLayout();
  sched.run();

  expect(rr.buffer().get(0, 0)?.char).toBe('B'); // b moved to x0 (cache refreshed to new bounds)
});
