/**
 * Specification tests (immutable oracles) — mouse hit-test + focus-on-click.
 *
 * Source: jsvision-ui RD-04 AC-7, AC-8 → ST-07, ST-08
 * (codeops/features/jsvision-ui/plans/event-loop/07-testing-strategy.md).
 * Real `View` subclasses + a real loop (no mocks). Bounds are set by hand after mount (parent-
 * relative, as the RD-03 render specs do) so the hit-test geometry is deterministic. Synthetic
 * 1-based `MouseEvent`s drive `dispatch()`. Expectations derive from the acceptance criteria.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { MouseEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext, DispatchEvent } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

/** A 1-based SGR mouse-down at (x, y). */
function mouseDown(x: number, y: number): MouseEvent {
  return { type: 'mouse', kind: 'down', button: 0, x, y };
}

/** Records the envelopes it receives (with their view-local coords). */
class HitView extends View {
  readonly events: DispatchEvent[] = [];
  draw(ctx: DrawContext): void {
    ctx.fill('x');
  }
  override onEvent(ev: DispatchEvent): void {
    this.events.push(ev);
  }
}

// ST-07 / AC-7 — a 1-based mouse point (normalized to 0-based) is delivered to the top-most
// front-to-back view containing it; overlapping siblings resolve to the later (on-top) one; the
// handler sees view-local ev.local.
test('ST-07: hit-test delivers to the top-most overlapping view with view-local coords', () => {
  const back = new HitView();
  const front = new HitView();
  const root = new Group();
  root.add(back); // earlier = behind
  root.add(front); // later = on top

  const loop = createEventLoop({ width: 20, height: 10 }, { caps });
  loop.mount(root);

  // Parent-relative bounds; back and front overlap the region x∈[2,4], y∈[2,4].
  root.bounds = { x: 0, y: 0, width: 20, height: 10 };
  back.bounds = { x: 0, y: 0, width: 5, height: 5 };
  front.bounds = { x: 2, y: 2, width: 5, height: 5 };

  // 1-based (4,4) → 0-based (3,3): inside BOTH back and front; front (on top) wins.
  loop.dispatch(mouseDown(4, 4));

  expect(front.events.length).toBe(1);
  expect(back.events.length).toBe(0); // top-most only
  expect(front.events[0]?.local).toEqual({ x: 1, y: 1 }); // (3,3) − front origin (2,2)
});

// ST-08 / AC-8 — a mouse-down on a focusable view moves focus to it; a down on empty space steals
// no focus.
test('ST-08: a mouse-down on a focusable view focuses it', () => {
  const leaf = new HitView();
  leaf.focusable = true;
  const root = new Group();
  root.add(leaf);

  const loop = createEventLoop({ width: 20, height: 10 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 10 };
  leaf.bounds = { x: 0, y: 0, width: 5, height: 5 };

  loop.dispatch(mouseDown(2, 2)); // 0-based (1,1) inside leaf
  expect(loop.getFocused()).toBe(leaf);
});

test('ST-08: a mouse-down on empty space steals no focus', () => {
  const leaf = new HitView();
  leaf.focusable = true;
  const root = new Group();
  root.add(leaf);

  const loop = createEventLoop({ width: 20, height: 10 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 10 };
  leaf.bounds = { x: 0, y: 0, width: 5, height: 5 };

  loop.dispatch(mouseDown(16, 16)); // 0-based (15,15) — outside the leaf
  expect(loop.getFocused()).toBeNull(); // no focus stolen
  expect(leaf.events.length).toBe(0); // nothing delivered
});

// ST-08 / AC-8 — a mouse-down on a descendant of a focusable container focuses the container
// (focus-on-click climbs to the nearest focusable ancestor).
test('ST-08: a mouse-down on a descendant focuses the nearest focusable ancestor', () => {
  const inner = new HitView(); // not focusable
  const panel = new Group();
  panel.focusable = true; // focusable container
  panel.add(inner);
  const root = new Group();
  root.add(panel);

  const loop = createEventLoop({ width: 20, height: 10 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 10 };
  panel.bounds = { x: 0, y: 0, width: 10, height: 5 };
  inner.bounds = { x: 1, y: 1, width: 3, height: 3 };

  loop.dispatch(mouseDown(3, 3)); // 0-based (2,2) inside inner
  expect(loop.getFocused()).toBe(panel); // climbed to the focusable container
});
