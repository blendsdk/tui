/**
 * Specification tests (immutable oracles) — RD-02 layout engine, packaging & security.
 *
 * Source: RD-02 AC-16, AC-17, AC-18 → ST-16, ST-17, ST-18 (07-testing-strategy.md).
 * Imports the public API **by name** from `@jsvision/ui` (the published entry
 * point), proving every layout symbol and type — plus the pre-existing
 * `apportion`/`solveTrack`/`TrackItem` spike — is reachable through the single
 * package surface. Expectations derive from the acceptance criteria, never from
 * the implementation.
 *
 * Trace: RD-02 §Acceptance Criteria 16–18 · Should-Have (purity), Security §.
 */
import { test, expect } from 'vitest';
import {
  layout,
  apportion,
  solveTrack,
  type LayoutBox,
  type LayoutProps,
  type LayoutResult,
  type Size,
  type Rect,
  type TrackItem,
} from '@jsvision/ui';

// ST-16 / AC-16 — purity: two calls return equal results and `root` is not mutated.
test('ST-16: layout is pure — repeatable results, no input mutation', () => {
  const a: LayoutBox = { props: { size: { kind: 'fixed', cells: 3 } }, children: [] };
  const b: LayoutBox = { props: { size: { kind: 'fr', weight: 1 } }, children: [] };
  const inner: LayoutBox = { props: { direction: 'row', gap: 1, padding: 1 }, children: [a, b] };
  const root: LayoutBox = { props: { direction: 'col' }, children: [inner] };

  const before = JSON.stringify(root);
  const first = layout(root, { width: 12, height: 6 });
  const second = layout(root, { width: 12, height: 6 });

  // Repeatable: every box gets an equal rect across the two calls.
  for (const box of [root, inner, a, b]) {
    expect(second.get(box)).toEqual(first.get(box));
  }
  // No input mutation: the tree is structurally unchanged.
  expect(JSON.stringify(root)).toBe(before);
});

// ST-17 / AC-17 — packaging: the public symbols and types import from `@jsvision/ui`.
test('ST-17: layout symbols + the apportion spike are importable from @jsvision/ui', () => {
  expect(layout).toBeTypeOf('function');
  expect(apportion).toBeTypeOf('function');
  expect(solveTrack).toBeTypeOf('function');

  // Type annotations fail to typecheck if a type is missing from the public surface.
  const props: LayoutProps = { direction: 'row', gap: 1 };
  const size: Size = { kind: 'fixed', cells: 4 };
  const child: LayoutBox = { props: { size }, children: [] };
  const root: LayoutBox = { props, children: [child] };
  const item: TrackItem = { kind: 'flex', weight: 1 };

  const result: LayoutResult = layout(root, { width: 10, height: 1 });
  const rect: Rect | undefined = result.get(child);

  expect(rect).toEqual({ x: 0, y: 0, width: 4, height: 1 });
  expect(solveTrack(10, [item])).toEqual([10]);
});

// ST-18 / AC-18 — security: degenerate inputs resolve to zero-size rects (not exceptions);
// the pass is a single bounded traversal of a finite tree.
test('ST-18: degenerate viewports resolve to zero-size rects without throwing', () => {
  const child: LayoutBox = { props: { size: { kind: 'fr', weight: 1 } }, children: [] };
  const root: LayoutBox = { props: { direction: 'row' }, children: [child] };

  expect(() => layout(root, { width: 0, height: 0 })).not.toThrow();
  // Negative viewport is clamped, not an error.
  expect(() => layout(root, { width: -5, height: -5 })).not.toThrow();

  const zero = layout(root, { width: 0, height: 0 });
  expect(zero.get(root)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  expect(zero.get(child)).toMatchObject({ width: 0, height: 0 });

  const negative = layout(root, { width: -5, height: -5 });
  for (const rect of negative.values()) {
    expect(rect.width).toBeGreaterThanOrEqual(0);
    expect(rect.height).toBeGreaterThanOrEqual(0);
  }
});

test('ST-18: a deep finite tree is a bounded traversal (one entry per box, completes)', () => {
  const depth = 200;
  const leaf: LayoutBox = { props: { size: { kind: 'fr', weight: 1 } }, children: [] };
  let node = leaf;
  for (let i = 0; i < depth; i += 1) {
    node = { props: { direction: i % 2 === 0 ? 'row' : 'col' }, children: [node] };
  }
  const root = node;

  const result = layout(root, { width: 50, height: 50 });

  // depth wrapper boxes + the root counter is inclusive: depth + 1 boxes total.
  expect(result.size).toBe(depth + 1);
  expect(result.get(leaf)).toBeDefined();
});
