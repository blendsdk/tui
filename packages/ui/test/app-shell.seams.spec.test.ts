/**
 * Specification tests (immutable oracles) — RD-05 loop seams: pointer capture + onFrame (Phase 1).
 *
 * Source: RD-05 AC-22 (capture) + AC-20 (one frame per interaction) → ST-22, plus the onFrame
 * frame-sink contract (codeops/features/jsvision-ui/plans/app-shell/03-05-…-theme-seams.md §Loop
 * seams; PA-5/PA-6/PA-18). Real `View` subclasses + a real loop (no mocks); synthetic 1-based mouse
 * events drive `dispatch()`. Expectations derive from the acceptance criteria, never the impl.
 *
 * Trace: RD-05 03-05 §Loop seams · AR-82/AR-84 · PA-5/PA-6 · ST-22 / AC-22 / AC-20.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, ScreenBuffer } from '@jsvision/core';
import type { MouseEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext, DispatchEvent } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

/** A 1-based SGR mouse event of the given kind at (x, y). */
function mouse(kind: MouseEvent['kind'], x: number, y: number): MouseEvent {
  return { type: 'mouse', kind, button: 0, x, y };
}

/** Records the envelopes it receives. */
class HitView extends View {
  readonly events: DispatchEvent[] = [];
  draw(ctx: DrawContext): void {
    ctx.fill('x');
  }
  override onEvent(ev: DispatchEvent): void {
    this.events.push(ev);
  }
}

// ST-22 / AC-22 — with a capture target set, a mouse event over a DIFFERENT view still routes to the
// capture target (target-local coords); focus-on-click is suppressed while captured.
test('ST-22: a captured target receives mouse events even when the cursor is over another view', () => {
  const target = new HitView();
  const other = new HitView();
  other.focusable = true; // would normally take focus on a down
  const root = new Group();
  root.add(target);
  root.add(other);

  const loop = createEventLoop({ width: 20, height: 4 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 4 };
  target.bounds = { x: 0, y: 0, width: 5, height: 2 };
  other.bounds = { x: 10, y: 0, width: 5, height: 2 };

  loop.setCapture(target);

  // A drag at 1-based (12,1) → 0-based (11,0): geometrically over `other`, but capture routes it to
  // `target` with target-local coords (relative to target's (0,0) origin).
  loop.dispatch(mouse('drag', 12, 1));
  expect(target.events.length).toBe(1);
  expect(other.events.length).toBe(0);
  expect(target.events[0]?.local).toEqual({ x: 11, y: 0 });

  // A mouse-down over `other` while captured must NOT focus `other` (focus-on-click suppressed).
  loop.dispatch(mouse('down', 12, 1));
  expect(loop.getFocused()).not.toBe(other);
  expect(target.events.length).toBe(2); // still delivered to the capture target

  // Releasing capture restores the normal top-most hit-test path.
  loop.releaseCapture();
  loop.dispatch(mouse('down', 12, 1)); // 0-based (11,0) over `other`
  expect(other.events.length).toBe(1);
  expect(loop.getFocused()).toBe(other);
});

// onFrame fires exactly once per coalesced flush (one dispatch tick → one frame → one onFrame).
test('onFrame fires exactly once per dispatch tick', () => {
  const leaf = new HitView();
  const root = new Group();
  root.add(leaf);

  const loop = createEventLoop({ width: 20, height: 4 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 4 };
  leaf.bounds = { x: 0, y: 0, width: 5, height: 2 };

  let frames = 0;
  let lastBuffer: ScreenBuffer | null = null;
  loop.onFrame = (buffer): void => {
    frames += 1;
    lastBuffer = buffer;
  };

  loop.dispatch(mouse('down', 2, 1));
  expect(frames).toBe(1); // exactly one frame for the tick
  expect(lastBuffer).toBeInstanceOf(ScreenBuffer); // the live composed buffer is handed to the sink
});
