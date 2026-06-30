/**
 * Implementation tests — mouse hit-test internals & edges.
 *
 * Covers: reverse-z overlap resolution (3 stacked siblings); a hidden/disabled subtree skipped in
 * the hit-test; focus-on-click climbing past non-focusable ancestors; an off-tree point as a no-op;
 * a wheel event delivered without stealing focus. Real `View` subclasses + a real loop (no mocks).
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { MouseEvent, WheelEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext, DispatchEvent } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function mouseDown(x: number, y: number): MouseEvent {
  return { type: 'mouse', kind: 'down', button: 0, x, y };
}
function wheelUp(x: number, y: number): WheelEvent {
  return { type: 'wheel', dir: 'up', x, y };
}

/** Records the envelopes it receives. */
class HitView extends View {
  readonly events: DispatchEvent[] = [];
  draw(_ctx: DrawContext): void {}
  override onEvent(ev: DispatchEvent): void {
    this.events.push(ev);
  }
}

// Three fully-overlapping siblings resolve to the last-added (top-most) one.
test('reverse-z overlap resolves to the top-most sibling', () => {
  const a = new HitView();
  const b = new HitView();
  const c = new HitView();
  const root = new Group();
  root.add(a);
  root.add(b);
  root.add(c); // c is on top

  const loop = createEventLoop({ width: 20, height: 10 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 10 };
  for (const v of [a, b, c]) v.bounds = { x: 0, y: 0, width: 5, height: 5 };

  loop.dispatch(mouseDown(2, 2));
  expect(c.events.length).toBe(1);
  expect(a.events.length).toBe(0);
  expect(b.events.length).toBe(0);
});

// A hidden front sibling is skipped: the back sibling under it gets the hit.
test('a hidden subtree is skipped in the hit-test', () => {
  const back = new HitView();
  const front = new HitView();
  front.state.visible = false; // hidden — skipped
  const root = new Group();
  root.add(back);
  root.add(front);

  const loop = createEventLoop({ width: 20, height: 10 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 10 };
  back.bounds = { x: 0, y: 0, width: 5, height: 5 };
  front.bounds = { x: 0, y: 0, width: 5, height: 5 };

  loop.dispatch(mouseDown(2, 2));
  expect(front.events.length).toBe(0); // hidden, never tested
  expect(back.events.length).toBe(1); // the back view receives it
});

// A disabled subtree is also skipped.
test('a disabled subtree is skipped in the hit-test', () => {
  const back = new HitView();
  const front = new HitView();
  front.state.disabled = true; // disabled — skipped
  const root = new Group();
  root.add(back);
  root.add(front);

  const loop = createEventLoop({ width: 20, height: 10 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 10 };
  back.bounds = { x: 0, y: 0, width: 5, height: 5 };
  front.bounds = { x: 0, y: 0, width: 5, height: 5 };

  loop.dispatch(mouseDown(2, 2));
  expect(back.events.length).toBe(1);
});

// Focus-on-click climbs PAST non-focusable ancestors to the nearest focusable one.
test('focus-on-click climbs past non-focusable ancestors', () => {
  const leaf = new HitView(); // not focusable
  const mid = new Group(); // not focusable
  mid.add(leaf);
  const panel = new Group();
  panel.focusable = true; // the nearest focusable ancestor
  panel.add(mid);
  const root = new Group();
  root.add(panel);

  const loop = createEventLoop({ width: 20, height: 10 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 10 };
  panel.bounds = { x: 0, y: 0, width: 10, height: 5 };
  mid.bounds = { x: 0, y: 0, width: 8, height: 4 };
  leaf.bounds = { x: 0, y: 0, width: 3, height: 3 };

  loop.dispatch(mouseDown(2, 2)); // 0-based (1,1) inside leaf
  expect(loop.getFocused()).toBe(panel); // climbed to the focusable container
});

// A point off the tree hits nothing: no delivery, no focus change, no throw.
test('an off-tree point is a no-op', () => {
  const leaf = new HitView();
  leaf.focusable = true;
  const root = new Group();
  root.add(leaf);

  const loop = createEventLoop({ width: 20, height: 10 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 10 };
  leaf.bounds = { x: 0, y: 0, width: 5, height: 5 };

  expect(() => loop.dispatch(mouseDown(50, 50))).not.toThrow();
  expect(leaf.events.length).toBe(0);
  expect(loop.getFocused()).toBeNull();
});

// A wheel event is delivered to the hit view but does NOT steal focus (only mouse-down focuses).
test('a wheel event is delivered without stealing focus', () => {
  const leaf = new HitView();
  leaf.focusable = true;
  const root = new Group();
  root.add(leaf);

  const loop = createEventLoop({ width: 20, height: 10 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 10 };
  leaf.bounds = { x: 0, y: 0, width: 5, height: 5 };

  loop.dispatch(wheelUp(2, 2)); // 0-based (1,1) inside leaf
  expect(leaf.events.length).toBe(1); // delivered
  expect(loop.getFocused()).toBeNull(); // wheel does not focus-on-click
});
