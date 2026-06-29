/**
 * Implementation tests — RD-02 layout engine, Phase 2 (justify/align/padding edges).
 *
 * Covers internals not pinned by the spec oracles: `space-between` degenerating
 * to `start` for a single child, `center` flooring an odd leftover, non-stretch
 * cross-size clamping, uniform/per-side padding equivalence, the overflow
 * `free`-clamp under non-`start` justify (PF-004), and `space-between`
 * distributing leftover on top of the base `gap` (PF-006).
 */
import { test, expect } from 'vitest';
import { layout, type LayoutBox } from '../src/layout/index.js';

test('space-between with a single child behaves like start (offset 0)', () => {
  const a: LayoutBox = { props: { size: { kind: 'fixed', cells: 4 } }, children: [] };
  const root: LayoutBox = { props: { direction: 'row', justify: 'space-between' }, children: [a] };

  const result = layout(root, { width: 10, height: 1 });

  expect(result.get(a)?.x).toBe(0);
});

test('center floors an odd leftover: width 9, fixed 4 → x 2', () => {
  const a: LayoutBox = { props: { size: { kind: 'fixed', cells: 4 } }, children: [] };
  const root: LayoutBox = { props: { direction: 'row', justify: 'center' }, children: [a] };

  const result = layout(root, { width: 9, height: 1 });

  // free = 9 - 4 = 5 → floor(5/2) = 2.
  expect(result.get(a)?.x).toBe(2);
});

test('non-stretch align clamps a natural cross size larger than the content extent', () => {
  const a: LayoutBox = {
    props: { size: { kind: 'fixed', cells: 6 } },
    children: [],
    measure: () => ({ width: 6, height: 5 }), // natural cross 5 > content height 2
  };
  const root: LayoutBox = { props: { direction: 'row', align: 'start' }, children: [a] };

  const result = layout(root, { width: 10, height: 2 });

  expect(result.get(a)?.height).toBe(2); // clamped to content cross extent
  expect(result.get(a)?.y).toBe(0);
});

test('uniform padding:n equals the equivalent per-side Padding object', () => {
  const childOf = (): LayoutBox => ({ props: { size: { kind: 'fr', weight: 1 } }, children: [] });
  const uniformChild = childOf();
  const perSideChild = childOf();
  const uniform: LayoutBox = { props: { direction: 'row', padding: 2 }, children: [uniformChild] };
  const perSide: LayoutBox = {
    props: { direction: 'row', padding: { top: 2, right: 2, bottom: 2, left: 2 } },
    children: [perSideChild],
  };

  const viewport = { width: 12, height: 8 };
  expect(layout(uniform, viewport).get(uniformChild)).toEqual(layout(perSide, viewport).get(perSideChild));
});

test('overflow + justify end/center still runs from offset 0 (free clamped to ≥ 0)', () => {
  const make = (justify: 'end' | 'center'): LayoutBox => {
    const a: LayoutBox = { props: { size: { kind: 'fixed', cells: 4 } }, children: [] };
    const b: LayoutBox = { props: { size: { kind: 'fixed', cells: 4 } }, children: [] };
    return { props: { direction: 'row', justify }, children: [a, b] };
  };

  for (const justify of ['end', 'center'] as const) {
    const root = make(justify);
    const result = layout(root, { width: 6, height: 1 }); // 4 + 4 > 6 → overflow
    // No negative offset past the near edge: first at 0, second extends past the far edge.
    expect(result.get(root.children[0])?.x).toBe(0);
    expect(result.get(root.children[1])?.x).toBe(4);
  }
});

test('space-between distributes leftover on top of the base gap', () => {
  const a: LayoutBox = { props: { size: { kind: 'fixed', cells: 2 } }, children: [] };
  const b: LayoutBox = { props: { size: { kind: 'fixed', cells: 2 } }, children: [] };
  const c: LayoutBox = { props: { size: { kind: 'fixed', cells: 2 } }, children: [] };
  const root: LayoutBox = {
    props: { direction: 'row', gap: 1, justify: 'space-between' },
    children: [a, b, c],
  };

  const result = layout(root, { width: 12, height: 1 });

  // used = 6 + base gap(2) = 8; free = 4 → apportion(4,[1,1]) = [2,2] extra per slot.
  // Slot span = base gap 1 + extra 2 = 3 → x: 0, 2+3=5, 5+2+3=10 (last flush at 12).
  expect(result.get(a)?.x).toBe(0);
  expect(result.get(b)?.x).toBe(5);
  expect(result.get(c)?.x).toBe(10);
});
