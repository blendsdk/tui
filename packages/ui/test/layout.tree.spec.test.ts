/**
 * Specification tests (immutable oracles) — RD-02 layout engine, Phase 3.
 *
 * ST-10…ST-15 derive from RD-02 acceptance criteria AC-10…AC-15 (nested 2-D
 * composition, parent-relative rects, overflow, degenerate viewport, `col`
 * mirroring `row`, and the integer/non-negative invariant). They assert exact
 * integer rects through the public `layout()` function. If one fails after
 * implementation, the implementation is wrong — not the test.
 *
 * Trace: RD-02 §Acceptance Criteria 10–15 · AR-22, AR-27, AR-28, AR-19.
 */
import { test, expect } from 'vitest';
import { layout, type LayoutBox, type Rect } from '../src/layout/index.js';

// ST-10 / AC-10 — a `col` containing a `row` produces correct 2-D rects: the inner row's
// children are relative to the row, which is itself offset within the column.
test('ST-10: col containing a row → inner row children are relative to the row', () => {
  const a: LayoutBox = { props: { size: { kind: 'fixed', cells: 3 } }, children: [] };
  const b: LayoutBox = { props: { size: { kind: 'fr', weight: 1 } }, children: [] };
  const header: LayoutBox = { props: { size: { kind: 'fixed', cells: 2 } }, children: [] };
  const body: LayoutBox = { props: { direction: 'row', size: { kind: 'fr', weight: 1 } }, children: [a, b] };
  const root: LayoutBox = { props: { direction: 'col' }, children: [header, body] };

  const result = layout(root, { width: 10, height: 10 });

  // The row sits below the 2-cell header within the column.
  expect(result.get(body)).toEqual({ x: 0, y: 2, width: 10, height: 8 });
  // The row's children are relative to the row's own origin — y is 0, not 2.
  expect(result.get(a)).toEqual({ x: 0, y: 0, width: 3, height: 8 });
  expect(result.get(b)).toEqual({ x: 3, y: 0, width: 7, height: 8 });
});

// ST-11 / AC-11 — a child's Rect.x/y is relative to its parent's content-box origin,
// not absolute screen coordinates.
test('ST-11: a nested child rect is parent-relative, not absolute', () => {
  const leaf: LayoutBox = { props: { size: { kind: 'fr', weight: 1 } }, children: [] };
  const panel: LayoutBox = {
    props: { direction: 'col', size: { kind: 'fr', weight: 1 }, padding: 1 },
    children: [leaf],
  };
  const top: LayoutBox = { props: { size: { kind: 'fixed', cells: 4 } }, children: [] };
  const root: LayoutBox = { props: { direction: 'col' }, children: [top, panel] };

  const result = layout(root, { width: 12, height: 12 });

  // The panel is offset 4 down within the column.
  expect(result.get(panel)).toEqual({ x: 0, y: 4, width: 12, height: 8 });
  // The leaf is relative to the panel's own origin (its padding only) — (1,1), NOT (1,5).
  // Absolute position is reconstructed by the renderer as panel.y(4) + leaf.y(1) = 5.
  expect(result.get(leaf)).toEqual({ x: 1, y: 1, width: 10, height: 6 });
});

// ST-12 / AC-12 — fixed/auto overflow extends past the edge; an `fr` sibling clamps to 0.
test('ST-12: row width 6, [fixed 4, fixed 4, fr 1] → fixed extend past edge, fr → width 0', () => {
  const a: LayoutBox = { props: { size: { kind: 'fixed', cells: 4 } }, children: [] };
  const b: LayoutBox = { props: { size: { kind: 'fixed', cells: 4 } }, children: [] };
  const c: LayoutBox = { props: { size: { kind: 'fr', weight: 1 } }, children: [] };
  const root: LayoutBox = { props: { direction: 'row' }, children: [a, b, c] };

  const result = layout(root, { width: 6, height: 1 });

  expect(result.get(a)).toMatchObject({ x: 0, width: 4 });
  // Second fixed child keeps its size and extends past the 6-cell edge.
  expect(result.get(b)).toMatchObject({ x: 4, width: 4 });
  // The fr child resolves to width 0 (no free space remained).
  expect(result.get(c)?.width).toBe(0);
});

// ST-13 / AC-13 — a degenerate viewport (and padding ≥ size) yields zero-size rects, no throw.
test('ST-13: viewport {0,0} → all rects zero-size, no throw', () => {
  const inner: LayoutBox = { props: { size: { kind: 'fr', weight: 1 } }, children: [] };
  const outer: LayoutBox = { props: { direction: 'row', size: { kind: 'fr', weight: 1 } }, children: [inner] };
  const root: LayoutBox = { props: { direction: 'col' }, children: [outer] };

  const result = layout(root, { width: 0, height: 0 });

  expect(result.get(root)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  expect(result.get(outer)).toMatchObject({ width: 0, height: 0 });
  expect(result.get(inner)).toMatchObject({ width: 0, height: 0 });
});

test('ST-13: padding larger than the box collapses content to zero-size, no throw', () => {
  const child: LayoutBox = { props: { size: { kind: 'fr', weight: 1 } }, children: [] };
  const root: LayoutBox = { props: { direction: 'row', padding: 100 }, children: [child] };

  const result = layout(root, { width: 10, height: 4 });

  expect(result.get(child)).toMatchObject({ width: 0, height: 0 });
});

// ST-14 / AC-14 — the same case on `direction:'col'` behaves identically with width/height swapped.
test('ST-14: col [fixed 3, fr 1] in height 10 → heights [3, 7] (mirror of ST-01)', () => {
  const a: LayoutBox = { props: { size: { kind: 'fixed', cells: 3 } }, children: [] };
  const b: LayoutBox = { props: { size: { kind: 'fr', weight: 1 } }, children: [] };
  const root: LayoutBox = { props: { direction: 'col' }, children: [a, b] };

  const result = layout(root, { width: 1, height: 10 });

  expect(result.get(a)?.height).toBe(3);
  expect(result.get(b)?.height).toBe(7);
  expect(result.get(a)?.y).toBe(0);
  expect(result.get(b)?.y).toBe(3);
  // Cross axis (width) stretches to the viewport.
  expect(result.get(a)?.width).toBe(1);
  expect(result.get(b)?.width).toBe(1);
});

// ST-15 / AC-15 — every Rect field is an integer and no size is negative, across representative trees.
test('ST-15: every rect field is an integer; no negative size', () => {
  const trees: Array<{ root: LayoutBox; viewport: { width: number; height: number } }> = [];

  // A nested row/col tree with mixed sizing.
  {
    const a: LayoutBox = { props: { size: { kind: 'fr', weight: 2 } }, children: [] };
    const b: LayoutBox = { props: { size: { kind: 'fixed', cells: 7 } }, children: [] };
    const row: LayoutBox = { props: { direction: 'row', gap: 1, padding: 1 }, children: [a, b] };
    const root: LayoutBox = { props: { direction: 'col' }, children: [row] };
    trees.push({ root, viewport: { width: 23, height: 9 } });
  }
  // An overflow tree.
  {
    const a: LayoutBox = { props: { size: { kind: 'fixed', cells: 5 } }, children: [] };
    const b: LayoutBox = { props: { size: { kind: 'fixed', cells: 5 } }, children: [] };
    const root: LayoutBox = { props: { direction: 'col' }, children: [a, b] };
    trees.push({ root, viewport: { width: 4, height: 3 } });
  }

  for (const { root, viewport } of trees) {
    const result = layout(root, viewport);
    for (const rect of result.values()) {
      assertIntegerRect(rect);
    }
  }
});

/** Assert every field of a rect is an integer and width/height are non-negative. */
function assertIntegerRect(rect: Rect): void {
  expect(Number.isInteger(rect.x)).toBe(true);
  expect(Number.isInteger(rect.y)).toBe(true);
  expect(Number.isInteger(rect.width)).toBe(true);
  expect(Number.isInteger(rect.height)).toBe(true);
  expect(rect.width).toBeGreaterThanOrEqual(0);
  expect(rect.height).toBeGreaterThanOrEqual(0);
}
