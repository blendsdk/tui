/**
 * Implementation tests — RD-05 Desktop window-manager internals (Phase 3).
 *
 * Edge cases beyond ST-06…ST-13: drag clamp boundaries; tile grid math + cell-clamp; cascade
 * stagger; un-zoom before arrange; capture released when a modal opens.
 *
 * Trace: RD-05 03-02 (Error Handling table) · AR-67/AR-87 · PA-4/PA-5.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { MouseEvent } from '@jsvision/core';
import { Group } from '../src/view/index.js';
import { createApplication } from '../src/app/index.js';
import { Window } from '../src/window/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function shellApp(width: number, height: number) {
  return createApplication({ caps, viewport: { width, height } });
}
function mouse(kind: MouseEvent['kind'], x: number, y: number): MouseEvent {
  return { type: 'mouse', kind, button: 0, x: x + 1, y: y + 1 };
}
function addWindow(
  app: ReturnType<typeof shellApp>,
  title: string,
  rect: { x: number; y: number; width: number; height: number },
): Window {
  const w = new Window(title);
  w.layout.rect = rect;
  app.desktop.addWindow(w);
  return w;
}

test('drag-move clamps the title row to the top edge', () => {
  const app = shellApp(40, 12);
  const w = addWindow(app, 'W', { x: 5, y: 5, width: 12, height: 5 });
  app.loop.renderRoot.flush();

  // Grab the title (local (5,0) → abs (10,5); x=5 is title, not the close/zoom box); drag far above
  // the top → y clamps to 0.
  app.loop.dispatch(mouse('down', 10, 5));
  app.loop.dispatch(mouse('drag', 10, -50));
  app.loop.dispatch(mouse('up', 10, -50));
  expect(w.layout.rect.y).toBe(0);
});

test('tile grid math: 3 windows → 2×2 grid; cells clamp to the minimum on a tiny desktop', () => {
  const app = shellApp(40, 20);
  const a = addWindow(app, 'A', { x: 0, y: 0, width: 12, height: 5 });
  const b = addWindow(app, 'B', { x: 1, y: 1, width: 12, height: 5 });
  const c = addWindow(app, 'C', { x: 2, y: 2, width: 12, height: 5 });
  app.loop.renderRoot.flush();

  app.desktop.tile(); // n=3 → cols=2, rows=2; cell = floor(40/2)×floor(20/2) = 20×10
  expect(a.layout.rect).toEqual({ x: 0, y: 0, width: 20, height: 10 });
  expect(b.layout.rect).toEqual({ x: 20, y: 0, width: 20, height: 10 });
  expect(c.layout.rect).toEqual({ x: 0, y: 10, width: 20, height: 10 });

  // A tiny desktop floors the cells at 10×3 (cells may overflow the edge — RD-02 AR-28). 3 windows
  // on an 8×4 desktop → cols=2, rows=2 ⇒ cell floor(8/2)=4→10 wide, floor(4/2)=2→3 tall.
  const tiny = shellApp(8, 4);
  const t1 = addWindow(tiny, 'T1', { x: 0, y: 0, width: 5, height: 3 });
  addWindow(tiny, 'T2', { x: 0, y: 0, width: 5, height: 3 });
  addWindow(tiny, 'T3', { x: 0, y: 0, width: 5, height: 3 });
  tiny.loop.renderRoot.flush();
  tiny.desktop.tile();
  expect(t1.layout.rect.width).toBe(10); // floored at MIN_WIDTH
  expect(t1.layout.rect.height).toBe(3); // floored at MIN_HEIGHT
});

test('cascade staggers +1 row / +2 col per window', () => {
  const app = shellApp(40, 20);
  const a = addWindow(app, 'A', { x: 9, y: 9, width: 12, height: 5 });
  const b = addWindow(app, 'B', { x: 9, y: 9, width: 12, height: 5 });
  const c = addWindow(app, 'C', { x: 9, y: 9, width: 12, height: 5 });
  app.loop.renderRoot.flush();

  app.desktop.cascade();
  expect({ x: a.layout.rect.x, y: a.layout.rect.y }).toEqual({ x: 0, y: 0 });
  expect({ x: b.layout.rect.x, y: b.layout.rect.y }).toEqual({ x: 2, y: 1 });
  expect({ x: c.layout.rect.x, y: c.layout.rect.y }).toEqual({ x: 4, y: 2 });
});

test('arrange un-zooms a window before positioning it', () => {
  const app = shellApp(40, 20);
  const w = addWindow(app, 'W', { x: 5, y: 5, width: 12, height: 6 });
  app.loop.renderRoot.flush();

  w.zoom();
  expect(w.isZoomed()).toBe(true);
  app.desktop.tile(); // un-zooms first (AR-87)
  expect(w.isZoomed()).toBe(false);
  expect(w.layout.rect).toEqual({ x: 0, y: 0, width: 40, height: 20 }); // n=1 fills
});

test('capture is released when a modal opens — a drag no longer moves the window', () => {
  const app = shellApp(40, 12);
  const w = addWindow(app, 'W', { x: 5, y: 5, width: 12, height: 5 });
  app.loop.renderRoot.flush();

  // Begin a move gesture (the loop captures the pointer to the desktop).
  app.loop.dispatch(mouse('down', 8, 5)); // title grab
  const before = { ...w.layout.rect };

  // Open a modal: the loop releases the capture (PA-5).
  const dialog = new Group();
  app.desktop.add(dialog);
  void app.loop.execView(dialog);

  // A subsequent drag is no longer captured by the desktop, so the window does not move.
  app.loop.dispatch(mouse('drag', 20, 9));
  expect(w.layout.rect).toEqual(before);
});
