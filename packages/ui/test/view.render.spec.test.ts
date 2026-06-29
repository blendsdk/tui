/**
 * Specification tests (immutable oracles) — render root + compose walker.
 *
 * Source: RD-03 AC-5, AC-6, AC-14, AC-19 → ST-05, ST-06, ST-14, ST-19
 * (codeops/features/jsvision-ui/plans/view-group-spine/07-testing-strategy.md).
 * Real ScreenBuffer + serialize + a ring logger (no mocks). Expectations derive from the
 * acceptance criteria, never from the implementation.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, defaultTheme, createLogger } from '@jsvision/core';
import { View, Group, createRenderRoot, themeRoleToStyle } from '../src/view/index.js';
import type { DrawContext } from '../src/view/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

/** Fills its whole rect with one glyph. */
class PaintView extends View {
  constructor(private readonly ch: string) {
    super();
  }
  draw(ctx: DrawContext): void {
    ctx.fill(this.ch);
  }
}

/** Throws from draw() — used to assert error isolation. */
class ThrowView extends View {
  draw(): void {
    throw new Error('boom');
  }
}

// ST-05 / AC-5 — two overlapping siblings render back-to-front: the later child overpaints the
// earlier one in the overlap region (no cover-detection needed).
test('ST-05: overlapping siblings render back-to-front (later overpaints earlier)', () => {
  const back = new PaintView('A');
  const front = new PaintView('B');
  const root = new Group();
  root.layout = { direction: 'row' };
  root.add(back);
  root.add(front);

  const rr = createRenderRoot({ width: 10, height: 3 }, { caps });
  rr.mount(root);

  // Force the two siblings to overlap the same region, then recompose the subtree from the root
  // (the compose walker positions children from their current bounds).
  back.bounds = { x: 0, y: 0, width: 4, height: 3 };
  front.bounds = { x: 0, y: 0, width: 4, height: 3 };
  root.invalidate();
  rr.flush();

  const buf = rr.buffer();
  expect(buf.get(0, 0)?.char).toBe('B'); // front (added last) wins the overlap
  expect(buf.get(3, 2)?.char).toBe('B');
});

// ST-06 / AC-6 — a Group with a background role fills its rect before compositing children, so no
// stale cells show through.
test('ST-06: a Group background fills its rect before children draw', () => {
  const child = new PaintView('X');
  child.layout = { size: { kind: 'fixed', cells: 2 } };
  const root = new Group();
  root.layout = { direction: 'row' };
  root.background = 'window';
  root.add(child);

  const rr = createRenderRoot({ width: 8, height: 1 }, { caps });
  rr.mount(root);

  const buf = rr.buffer();
  const windowBg = themeRoleToStyle(defaultTheme.window).bg;
  expect(buf.get(0, 0)?.char).toBe('X'); // child painted over the background
  expect(buf.get(5, 0)?.char).toBe(' '); // outside the child: background fill (a space cell)
  expect(buf.get(5, 0)?.bg).toBe(windowBg); // carrying the window role's background
});

// ST-14 / AC-14 — a view whose draw() throws is logged and its subtree skipped; sibling views
// still render (the rest of the frame composes).
test('ST-14: a throwing draw() is logged and isolated; siblings still render', () => {
  const bad = new ThrowView();
  bad.layout = { size: { kind: 'fixed', cells: 3 } };
  const good = new PaintView('G');
  good.layout = { size: { kind: 'fixed', cells: 3 } };
  const root = new Group();
  root.layout = { direction: 'row' };
  root.add(bad);
  root.add(good);

  const logger = createLogger({ sink: 'ring' });
  const rr = createRenderRoot({ width: 6, height: 1 }, { caps, logger });
  rr.mount(root);

  expect(logger.entries().length).toBeGreaterThanOrEqual(1); // the throw was logged
  const buf = rr.buffer();
  expect(buf.get(3, 0)?.char).toBe('G'); // the sibling still rendered (cols 3..5)
  expect(buf.get(0, 0)?.char).toBe(' '); // the crashing view's area stayed blank
});

// ST-19 / AC-19 — a render root mounts a small tree, reflows it, and produces a non-empty
// serialized frame without RD-04 (the Phase-0 standalone spine).
test('ST-19: a render root produces a non-empty serialized frame standalone', () => {
  const child = new PaintView('Z');
  child.layout = { size: { kind: 'fixed', cells: 1 } };
  const root = new Group();
  root.layout = { direction: 'col' };
  root.background = 'desktop';
  root.add(child);

  const rr = createRenderRoot({ width: 5, height: 3 }, { caps });
  rr.mount(root);

  expect(rr.serialize().length).toBeGreaterThan(0);
});
