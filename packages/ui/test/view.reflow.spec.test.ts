/**
 * Specification tests (immutable oracles) — the reflow pass (view tree → RD-02 layout → bounds).
 *
 * Source: RD-03 AC-2, AC-3 → ST-02, ST-03
 * (codeops/features/jsvision-ui/plans/view-group-spine/07-testing-strategy.md).
 * Expectations derive from the acceptance criteria + RD-02's documented flex behavior, never from
 * the implementation.
 */
import { test, expect } from 'vitest';
import { View, Group } from '../src/view/index.js';
import { reflow } from '../src/view/index.js';

/** Minimal concrete leaf view. */
class Leaf extends View {
  draw(): void {
    // no-op — reflow writes bounds; rendering is asserted in the render specs
  }
}

// ST-02 / AC-2 — after reflow, every view's bounds equals RD-02 layout()'s rect for its box;
// nested rects are parent-relative.
test('ST-02: reflow writes RD-02 rects to bounds; nested bounds are parent-relative', () => {
  // col root: [ fixed-3 leaf, fr-1 row-group [ fr-1, fr-1 ] ] in an 80×24 viewport.
  const header = new Leaf();
  header.layout = { size: { kind: 'fixed', cells: 3 } };

  const innerA = new Leaf();
  innerA.layout = { size: { kind: 'fr', weight: 1 } };
  const innerB = new Leaf();
  innerB.layout = { size: { kind: 'fr', weight: 1 } };
  const body = new Group();
  body.layout = { direction: 'row', size: { kind: 'fr', weight: 1 } };
  body.add(innerA);
  body.add(innerB);

  const root = new Group();
  root.layout = { direction: 'col' };
  root.add(header);
  root.add(body);

  reflow(root, { width: 80, height: 24 });

  expect(root.bounds).toEqual({ x: 0, y: 0, width: 80, height: 24 });
  expect(header.bounds).toEqual({ x: 0, y: 0, width: 80, height: 3 }); // fixed 3 rows, stretched width
  expect(body.bounds).toEqual({ x: 0, y: 3, width: 80, height: 21 }); // fills the rest, below header

  // Nested children are parent-relative: innerA/innerB are relative to `body`, so their y is 0
  // (NOT 3), and they split body's width 80 → 40/40 across body's height 21.
  expect(innerA.bounds).toEqual({ x: 0, y: 0, width: 40, height: 21 });
  expect(innerB.bounds).toEqual({ x: 40, y: 0, width: 40, height: 21 });
});

// ST-03 / AC-3 — a visible:false view is omitted from the layout tree, so its siblings reflow to
// fill the freed space (the not-drawn half is asserted by the render specs).
test('ST-03: a visible:false child is omitted from layout; siblings refill the space', () => {
  const a = new Leaf();
  a.layout = { size: { kind: 'fr', weight: 1 } };
  const b = new Leaf();
  b.layout = { size: { kind: 'fr', weight: 1 } };
  const c = new Leaf();
  c.layout = { size: { kind: 'fr', weight: 1 } };

  const root = new Group();
  root.layout = { direction: 'col' };
  root.add(a);
  root.add(b);
  root.add(c);

  reflow(root, { width: 80, height: 24 });
  // three equal fr rows over height 24 → 8 each.
  expect(a.bounds.height).toBe(8);
  expect(b.bounds.height).toBe(8);
  expect(c.bounds.height).toBe(8);

  // Hide the middle child and reflow again.
  b.state.visible = false;
  reflow(root, { width: 80, height: 24 });

  // a and c now split the full height → 12 each, contiguous (no gap where b was).
  expect(a.bounds).toEqual({ x: 0, y: 0, width: 80, height: 12 });
  expect(c.bounds).toEqual({ x: 0, y: 12, width: 80, height: 12 });

  // b was omitted from the layout tree: its bounds were not rewritten (still its old 8-row rect).
  expect(b.bounds.height).toBe(8);
});
