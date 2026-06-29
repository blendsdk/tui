/**
 * Specification tests (immutable oracles) — RD-02 layout engine, Phase 2.
 *
 * ST-07…ST-09 derive from RD-02 acceptance criteria AC-7…AC-9 (padding insets
 * the content box; `justify` distributes leftover main-axis space; `align`
 * positions/sizes children on the cross axis). They assert exact integer rects
 * through the public `layout()` function. If one fails after implementation, the
 * implementation is wrong — not the test.
 *
 * Trace: RD-02 §Acceptance Criteria 7–9 · AR-29, AR-24, AR-25.
 */
import { test, expect } from 'vitest';
import { layout, type LayoutBox } from '../src/layout/index.js';

// ST-07 / AC-7 — padding:1 on a 10×4 container lays children within the inner 8×2 box at offset (1,1).
test('ST-07: padding:1 on a 10×4 container → child fills inner 8×2 box at offset (1,1)', () => {
  const child: LayoutBox = { props: { size: { kind: 'fr', weight: 1 } }, children: [] };
  const root: LayoutBox = { props: { direction: 'row', padding: 1 }, children: [child] };

  const result = layout(root, { width: 10, height: 4 });
  const rect = result.get(child);

  expect(rect).toEqual({ x: 1, y: 1, width: 8, height: 2 });
});

// ST-08 / AC-8 — justify placement of leftover main-axis space when no `fr` absorbs it.
test('ST-08: justify start/end/center on a single fixed-4 child in width 10', () => {
  const make = (justify: 'start' | 'end' | 'center'): LayoutBox => {
    const child: LayoutBox = { props: { size: { kind: 'fixed', cells: 4 } }, children: [] };
    const root: LayoutBox = { props: { direction: 'row', justify }, children: [child] };
    return root;
  };

  const start = make('start');
  const end = make('end');
  const center = make('center');

  expect(layout(start, { width: 10, height: 1 }).get(start.children[0])?.x).toBe(0);
  // free = 10 - 4 = 6 → flush far edge.
  expect(layout(end, { width: 10, height: 1 }).get(end.children[0])?.x).toBe(6);
  // free = 6 → floor(6/2) = 3.
  expect(layout(center, { width: 10, height: 1 }).get(center.children[0])?.x).toBe(3);
});

test('ST-08: space-between puts first child flush start, last flush far edge', () => {
  const a: LayoutBox = { props: { size: { kind: 'fixed', cells: 4 } }, children: [] };
  const b: LayoutBox = { props: { size: { kind: 'fixed', cells: 4 } }, children: [] };
  const root: LayoutBox = { props: { direction: 'row', justify: 'space-between' }, children: [a, b] };

  const result = layout(root, { width: 10, height: 1 });

  expect(result.get(a)?.x).toBe(0); // first flush start
  expect(result.get(b)?.x).toBe(6); // last flush end (6 + 4 == 10)
});

// ST-09 / AC-9 — align positions/sizes a child on the cross axis (height, for a row).
test('ST-09: align stretch/start/center/end on a row of height 4, child natural cross height 1', () => {
  const make = (align: 'stretch' | 'start' | 'center' | 'end'): LayoutBox => {
    const child: LayoutBox = {
      props: { size: { kind: 'fixed', cells: 6 } },
      children: [],
      measure: () => ({ width: 6, height: 1 }),
    };
    const root: LayoutBox = { props: { direction: 'row', align }, children: [child] };
    return root;
  };

  const stretch = make('stretch');
  const start = make('start');
  const center = make('center');
  const end = make('end');

  // stretch (default) → child fills the content cross extent.
  const sr = layout(stretch, { width: 10, height: 4 }).get(stretch.children[0]);
  expect(sr?.height).toBe(4);
  expect(sr?.y).toBe(0);

  // start → natural cross height 1 at the near edge.
  const startRect = layout(start, { width: 10, height: 4 }).get(start.children[0]);
  expect(startRect?.height).toBe(1);
  expect(startRect?.y).toBe(0);

  // center → free cross = 4 - 1 = 3 → floor(3/2) = 1.
  const centerRect = layout(center, { width: 10, height: 4 }).get(center.children[0]);
  expect(centerRect?.height).toBe(1);
  expect(centerRect?.y).toBe(1);

  // end → flush far cross edge: 4 - 1 = 3.
  const endRect = layout(end, { width: 10, height: 4 }).get(end.children[0]);
  expect(endRect?.height).toBe(1);
  expect(endRect?.y).toBe(3);
});
