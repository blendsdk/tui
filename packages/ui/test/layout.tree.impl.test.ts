/**
 * Implementation tests — RD-02 layout engine, Phase 3 (recursion/tree internals).
 *
 * Covers internals not pinned by the spec oracles: a leaf container yields its
 * own rect but no child entries, deep nesting composes offsets parent-relative
 * at each level, the result map has exactly one entry per box, and overflow in a
 * nested container is scoped to that container's content box (not the root).
 */
import { test, expect } from 'vitest';
import { layout, type LayoutBox } from '../src/layout/index.js';

test('a leaf container (empty children) gets its rect but produces no child entries', () => {
  const leaf: LayoutBox = { props: { direction: 'row' }, children: [] };
  const root: LayoutBox = { props: { direction: 'row' }, children: [leaf] };

  const result = layout(root, { width: 10, height: 4 });

  expect(result.get(leaf)).toBeDefined();
  expect(result.size).toBe(2); // root + leaf only
});

test('deep nesting composes offsets, parent-relative at each level', () => {
  const spacer1: LayoutBox = { props: { size: { kind: 'fixed', cells: 2 } }, children: [] };
  const leaf: LayoutBox = { props: { size: { kind: 'fr', weight: 1 } }, children: [] };
  const spacer2: LayoutBox = { props: { size: { kind: 'fixed', cells: 3 } }, children: [] };
  const mid: LayoutBox = {
    props: { direction: 'col', size: { kind: 'fr', weight: 1 } },
    children: [spacer2, leaf],
  };
  const root: LayoutBox = { props: { direction: 'col' }, children: [spacer1, mid] };

  const result = layout(root, { width: 10, height: 10 });

  // mid sits below spacer1 (height 2) within the root.
  expect(result.get(mid)).toMatchObject({ y: 2, height: 8 });
  // leaf sits below spacer2 (height 3) within mid — y is parent-relative (3), not absolute (5).
  expect(result.get(leaf)).toMatchObject({ y: 3, height: 5 });
});

test('the result map has exactly one entry per box in the tree', () => {
  const a: LayoutBox = { props: { size: { kind: 'fixed', cells: 2 } }, children: [] };
  const b: LayoutBox = { props: { size: { kind: 'fixed', cells: 2 } }, children: [] };
  const inner: LayoutBox = { props: { direction: 'row', size: { kind: 'fr', weight: 1 } }, children: [a, b] };
  const c: LayoutBox = { props: { size: { kind: 'fixed', cells: 1 } }, children: [] };
  const root: LayoutBox = { props: { direction: 'col' }, children: [inner, c] };

  const result = layout(root, { width: 8, height: 6 });

  // root, inner, a, b, c = 5 boxes.
  expect(result.size).toBe(5);
  for (const box of [root, inner, a, b, c]) {
    expect(result.has(box)).toBe(true);
  }
});

test('overflow inside a nested container is scoped to that container, not the root', () => {
  const a: LayoutBox = { props: { size: { kind: 'fixed', cells: 4 } }, children: [] };
  const b: LayoutBox = { props: { size: { kind: 'fixed', cells: 4 } }, children: [] };
  // inner is 6 wide but holds 4 + 4 = 8 cells of fixed children → overflow.
  const inner: LayoutBox = { props: { direction: 'row', size: { kind: 'fixed', cells: 6 } }, children: [a, b] };
  const root: LayoutBox = { props: { direction: 'row' }, children: [inner] };

  const result = layout(root, { width: 20, height: 4 });

  expect(result.get(inner)?.width).toBe(6);
  // Children overflow inner's 6-cell content box; offsets are relative to inner.
  expect(result.get(a)).toMatchObject({ x: 0, width: 4 });
  expect(result.get(b)).toMatchObject({ x: 4, width: 4 }); // 4 + 4 = 8 > inner width 6
});
