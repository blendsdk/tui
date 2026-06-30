/**
 * Implementation tests — RD-05 loop seams internals (Phase 1).
 *
 * Edge cases beyond ST-22: capture release on modal open/close + on target unmount; onFrame after
 * resize/mount; last-writer-wins `setCapture`; `releaseCapture` no-op.
 *
 * Trace: RD-05 03-05 §Loop seams (Error Handling table) · PA-5/PA-6.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { MouseEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext, DispatchEvent } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function mouse(kind: MouseEvent['kind'], x: number, y: number): MouseEvent {
  return { type: 'mouse', kind, button: 0, x, y };
}

class HitView extends View {
  readonly events: DispatchEvent[] = [];
  draw(ctx: DrawContext): void {
    ctx.fill('x');
  }
  override onEvent(ev: DispatchEvent): void {
    this.events.push(ev);
  }
}

test('setCapture is last-writer-wins', () => {
  const a = new HitView();
  const b = new HitView();
  const root = new Group();
  root.add(a);
  root.add(b);
  const loop = createEventLoop({ width: 20, height: 4 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 4 };
  a.bounds = { x: 0, y: 0, width: 5, height: 2 };
  b.bounds = { x: 6, y: 0, width: 5, height: 2 };

  loop.setCapture(a);
  loop.setCapture(b); // replaces a
  loop.dispatch(mouse('drag', 1, 1));
  expect(b.events.length).toBe(1);
  expect(a.events.length).toBe(0);
});

test('releaseCapture with no capture set is a no-op (normal hit-test still works)', () => {
  const leaf = new HitView();
  leaf.focusable = true;
  const root = new Group();
  root.add(leaf);
  const loop = createEventLoop({ width: 20, height: 4 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 4 };
  leaf.bounds = { x: 0, y: 0, width: 5, height: 2 };

  expect(() => loop.releaseCapture()).not.toThrow();
  loop.dispatch(mouse('down', 2, 1)); // normal hit-test path
  expect(leaf.events.length).toBe(1);
  expect(loop.getFocused()).toBe(leaf);
});

test('capture is released when a modal opens', () => {
  const target = new HitView();
  const dialogLeaf = new HitView();
  const dialog = new Group();
  dialog.add(dialogLeaf);
  const root = new Group();
  root.add(target);
  root.add(dialog);
  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 6 };
  target.bounds = { x: 0, y: 0, width: 20, height: 6 };
  dialog.bounds = { x: 0, y: 0, width: 20, height: 6 };
  dialogLeaf.bounds = { x: 0, y: 0, width: 20, height: 6 };

  loop.setCapture(target);
  void loop.execView(dialog); // opening a modal releases the capture (PA-5)

  loop.dispatch(mouse('down', 2, 1));
  expect(target.events.length).toBe(0); // not routed via a stale capture
  expect(dialogLeaf.events.length).toBe(1); // routed within the modal subtree instead
});

test('capture is released when a modal closes', () => {
  const dialogLeaf = new HitView();
  const dialog = new Group();
  dialog.add(dialogLeaf);
  const outside = new HitView();
  outside.focusable = true;
  const root = new Group();
  root.add(outside);
  root.add(dialog);
  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);
  // `dialog` stays mounted on top but occupies only the right half; the click point (left half) is
  // over `outside` only — so after capture is released the normal hit-test reaches `outside`.
  root.bounds = { x: 0, y: 0, width: 20, height: 6 };
  outside.bounds = { x: 0, y: 0, width: 20, height: 6 };
  dialog.bounds = { x: 10, y: 0, width: 10, height: 6 };
  dialogLeaf.bounds = { x: 0, y: 0, width: 10, height: 6 };

  void loop.execView(dialog);
  loop.setCapture(dialogLeaf);
  loop.endModal(undefined); // closing releases the capture (PA-5)

  loop.dispatch(mouse('down', 2, 1)); // 0-based (1,0): left half — over `outside`, not `dialog`
  expect(dialogLeaf.events.length).toBe(0); // capture cleared — not routed to the captured view
  expect(outside.events.length).toBe(1); // normal hit-test reached the background view
});

test('capture auto-releases when the target unmounts mid-gesture', () => {
  const target = new HitView();
  const other = new HitView();
  other.focusable = true;
  const root = new Group();
  root.add(target);
  root.add(other);
  const loop = createEventLoop({ width: 20, height: 4 }, { caps });
  loop.mount(root);
  root.bounds = { x: 0, y: 0, width: 20, height: 4 };
  target.bounds = { x: 0, y: 0, width: 5, height: 2 };
  other.bounds = { x: 0, y: 0, width: 20, height: 4 };

  loop.setCapture(target);
  root.remove(target); // the captured window is closed mid-gesture

  loop.dispatch(mouse('down', 2, 1));
  expect(target.events.length).toBe(0); // never routed to the detached view
  expect(other.events.length).toBe(1); // normal hit-test resumed
});

test('onFrame fires after mount and after resize', () => {
  const leaf = new HitView();
  const root = new Group();
  root.add(leaf);
  const loop = createEventLoop({ width: 20, height: 4 }, { caps });

  let frames = 0;
  loop.onFrame = (): void => {
    frames += 1;
  };
  loop.mount(root); // first frame
  expect(frames).toBe(1);

  loop.resize({ width: 30, height: 6 }); // resized frame
  expect(frames).toBe(2);
});
