/**
 * Implementation tests — RD-05 Desktop window-manager internals (Phase 3).
 *
 * Edge cases beyond ST-06…ST-13: drag clamp boundaries; TV tile grid math (no-remainder split +
 * leftOver extra-row); TV cascade offset; un-zoom before arrange; capture released when a modal opens.
 *
 * Trace: RD-05 03-02 (Error Handling table) · AR-67/AR-87 · PA-4/PA-5.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, defaultTheme } from '@jsvision/core';
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

test('Desktop.shadow (opt-in) darkens the backdrop just below/right of a window', () => {
  const app = shellApp(40, 12);
  app.desktop.shadow = true;
  addWindow(app, 'W', { x: 2, y: 2, width: 10, height: 4 }); // covers x 2..11, y 2..5
  app.loop.renderRoot.flush();
  const buf = app.loop.renderRoot.buffer();

  // The cell one column right of the window (x = 2+10 = 12, y = 3) is bare backdrop → shadowed.
  expect(buf.get(12, 3)?.bg).toBe(defaultTheme.shadow.bg);
  expect(buf.get(12, 3)?.fg).toBe(defaultTheme.shadow.fg);
});

test('Desktop shadows are off by default (the backdrop keeps the desktop role)', () => {
  const app = shellApp(40, 12);
  addWindow(app, 'W', { x: 2, y: 2, width: 10, height: 4 });
  app.loop.renderRoot.flush();
  expect(app.loop.renderRoot.buffer().get(12, 3)?.bg).toBe(defaultTheme.desktop.bg);
});

test('a front window casts its shadow ON TOP of the window behind it (z-order layering)', () => {
  const app = shellApp(40, 12);
  app.desktop.shadow = true;
  // Back window A (cols 10..34, rows 4..10), then a front window B (cols 2..13, rows 1..6) whose
  // 1-cell shadow falls to its right — landing on A's interior at (14, 5).
  addWindow(app, 'A', { x: 10, y: 4, width: 25, height: 7 });
  addWindow(app, 'B', { x: 2, y: 1, width: 12, height: 6 }); // added last ⇒ front, painted over A
  app.loop.renderRoot.flush();
  const buf = app.loop.renderRoot.buffer();

  // (14,5) is inside back window A but outside front window B. With correct z-ordered shadows, B's
  // shadow is drawn AFTER A composes, so the cell is the shadow color — not A's interior background
  // (which is what the old draw-all-shadows-first approach left there).
  expect(buf.get(14, 5)?.bg).toBe(defaultTheme.shadow.bg);
  expect(buf.get(14, 5)?.bg).not.toBe(defaultTheme.windowInactive.bg);
});

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

test('tile grid math: n=3 stacks into 1 col × 3 rows, dividing the desktop with no remainder', () => {
  const app = shellApp(40, 20);
  const a = addWindow(app, 'A', { x: 0, y: 0, width: 12, height: 5 });
  const b = addWindow(app, 'B', { x: 1, y: 1, width: 12, height: 5 });
  const c = addWindow(app, 'C', { x: 2, y: 2, width: 12, height: 5 });
  app.loop.renderRoot.flush();

  // TV mostEqualDivisors(3) favorY ⇒ 1 col × 3 rows; dividerLoc splits 20 → 0,6,13,20 (no leftover strip).
  app.desktop.tile();
  expect(a.layout.rect).toEqual({ x: 0, y: 0, width: 40, height: 6 });
  expect(b.layout.rect).toEqual({ x: 0, y: 6, width: 40, height: 7 });
  expect(c.layout.rect).toEqual({ x: 0, y: 13, width: 40, height: 7 });
});

test('tile leftOver: n=5 → 2 cols, the trailing column taking the extra row (rows+1)', () => {
  const app = shellApp(40, 20);
  // n=5: mostEqualDivisors ⇒ cols=2, rows=2, leftOver=1; col 0 holds 2 cells, col 1 holds 3 cells.
  const ws = [0, 1, 2, 3, 4].map((i) => addWindow(app, `W${i}`, { x: i, y: i, width: 12, height: 5 }));
  app.loop.renderRoot.flush();

  app.desktop.tile();
  expect(ws[0].layout.rect).toEqual({ x: 0, y: 0, width: 20, height: 10 }); // col 0, top
  expect(ws[1].layout.rect).toEqual({ x: 0, y: 10, width: 20, height: 10 }); // col 0, bottom
  expect(ws[2].layout.rect).toEqual({ x: 20, y: 0, width: 20, height: 6 }); // col 1, 3 rows
  expect(ws[3].layout.rect).toEqual({ x: 20, y: 6, width: 20, height: 7 });
  expect(ws[4].layout.rect).toEqual({ x: 20, y: 13, width: 20, height: 7 });
});

test('cascade offsets window i to (i,i) sized (W−i,H−i), bottom-right pinned to the corner', () => {
  const app = shellApp(40, 20);
  const a = addWindow(app, 'A', { x: 9, y: 9, width: 12, height: 5 });
  const b = addWindow(app, 'B', { x: 9, y: 9, width: 12, height: 5 });
  const c = addWindow(app, 'C', { x: 9, y: 9, width: 12, height: 5 });
  app.loop.renderRoot.flush();

  app.desktop.cascade();
  expect(a.layout.rect).toEqual({ x: 0, y: 0, width: 40, height: 20 }); // back fills
  expect(b.layout.rect).toEqual({ x: 1, y: 1, width: 39, height: 19 });
  expect(c.layout.rect).toEqual({ x: 2, y: 2, width: 38, height: 18 }); // front, smallest
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
