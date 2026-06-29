/**
 * Implementation tests — the reflow pass (internals & edges; 07 §impl).
 *
 * Nested hidden-subtree omission, the `measure` deferral, a fresh box tree per pass (no
 * cross-pass cache), and a degenerate viewport yielding zero bounds without throwing.
 */
import { test, expect } from 'vitest';
import type { Size2D } from '../src/layout/index.js';
import { View, Group } from '../src/view/index.js';
import { reflow } from '../src/view/index.js';

class Leaf extends View {
  draw(): void {
    // no-op
  }
}

test('a visible:false container omits its whole subtree from layout', () => {
  const a = new Leaf();
  a.layout = { size: { kind: 'fr', weight: 1 } };
  const c = new Leaf();
  c.layout = { size: { kind: 'fr', weight: 1 } };

  const hidden = new Group();
  hidden.layout = { direction: 'row', size: { kind: 'fr', weight: 1 } };
  const x = new Leaf();
  x.layout = { size: { kind: 'fr', weight: 1 } };
  const y = new Leaf();
  y.layout = { size: { kind: 'fr', weight: 1 } };
  hidden.add(x);
  hidden.add(y);
  hidden.state.visible = false; // hide the whole container before the first reflow

  const root = new Group();
  root.layout = { direction: 'col' };
  root.add(a);
  root.add(hidden);
  root.add(c);

  reflow(root, { width: 80, height: 24 });

  // a and c split the full height (hidden omitted) → 12 each.
  expect(a.bounds.height).toBe(12);
  expect(c.bounds.height).toBe(12);
  // x and y inside the hidden container were never laid out → still default zero bounds.
  expect(x.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  expect(y.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
});

test('measure() is honored for an auto-sized leaf', () => {
  let calls = 0;
  const leaf = new Leaf();
  leaf.layout = { size: { kind: 'auto' } };
  leaf.measure = (_available: Size2D): Size2D => {
    calls += 1;
    return { width: 5, height: 2 };
  };

  const root = new Group();
  root.layout = { direction: 'row' };
  root.add(leaf);

  reflow(root, { width: 80, height: 24 });

  expect(calls).toBeGreaterThanOrEqual(1); // measure was invoked
  expect(leaf.bounds.width).toBe(5); // auto main-axis size came from measure
});

test('each reflow builds a fresh tree — bounds reflect the latest viewport', () => {
  const a = new Leaf();
  a.layout = { size: { kind: 'fr', weight: 1 } };
  const root = new Group();
  root.layout = { direction: 'row' };
  root.add(a);

  reflow(root, { width: 80, height: 10 });
  expect(a.bounds.width).toBe(80);

  reflow(root, { width: 40, height: 10 }); // no stale cache from the first pass
  expect(a.bounds.width).toBe(40);
});

test('a degenerate (zero) viewport yields zero-size bounds without throwing', () => {
  const a = new Leaf();
  a.layout = { size: { kind: 'fr', weight: 1 } };
  const root = new Group();
  root.layout = { direction: 'col' };
  root.add(a);

  expect(() => reflow(root, { width: 0, height: 0 })).not.toThrow();
  expect(a.bounds.width).toBe(0);
  expect(a.bounds.height).toBe(0);
});
