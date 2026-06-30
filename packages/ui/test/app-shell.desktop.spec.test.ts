/**
 * Specification tests (immutable oracles) — RD-05 Desktop window manager (Phase 3).
 *
 * Source: RD-05 AC-6…AC-13 → ST-06…ST-13 (codeops/features/jsvision-ui/plans/app-shell/
 * 03-02-desktop-wm.md). Real Desktop/Window on a composed app (no mocks); gestures drive the loop's
 * pointer-capture seam via synthetic 1-based mouse events. Min window 10×3, cascade stagger +1row/
 * +2col, near-square tile grid — the documented PA-4/AR-87 WM preset. Expectations derive from the
 * acceptance criteria, never the implementation.
 *
 * Trace: RD-05 03-02 · AR-67/AR-78/AR-87 · PA-4 · ST-06…ST-13.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, defaultTheme } from '@jsvision/core';
import type { MouseEvent } from '@jsvision/core';
import { createApplication } from '../src/app/index.js';
import { Window } from '../src/window/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function shellApp(width: number, height: number) {
  return createApplication({ caps, viewport: { width, height } });
}

/** A 1-based SGR mouse event of the given kind at absolute (x, y). */
function mouse(kind: MouseEvent['kind'], x: number, y: number): MouseEvent {
  return { type: 'mouse', kind, button: 0, x: x + 1, y: y + 1 }; // pass 0-based; convert to 1-based
}

/** Add a window at a rect and return it. */
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

// ST-06 / AC-6 — desktop fills with the role + pattern; windows paint back-to-front in child order.
test('ST-06: desktop fills with its pattern; windows paint back-to-front', () => {
  const app = shellApp(30, 12);
  const a = addWindow(app, 'A', { x: 1, y: 1, width: 12, height: 6 });
  const b = addWindow(app, 'B', { x: 6, y: 3, width: 12, height: 6 });
  app.loop.renderRoot.flush();
  const buf = app.loop.renderRoot.buffer();

  // A desktop cell outside every window shows the desktop pattern glyph.
  expect(buf.get(0, 0)?.char).toBe(defaultTheme.desktop.pattern);
  // z-order: a's right border column (x=12) is covered by b's interior (a space on b's bg).
  expect(app.desktop.children.indexOf(a)).toBeLessThan(app.desktop.children.indexOf(b));
  expect(buf.get(12, 4)?.char).toBe(' ');
  expect(buf.get(12, 4)?.bg).toBe(defaultTheme.window.bg);
});

// ST-07 / AC-7 — a mouse-down in a non-top window raises it (top z) + focuses it; activeWindow() = it.
test('ST-07: mouse-down in a background window raises + focuses it', () => {
  const app = shellApp(30, 12);
  const a = addWindow(app, 'A', { x: 0, y: 0, width: 14, height: 6 });
  const b = addWindow(app, 'B', { x: 16, y: 0, width: 12, height: 6 });
  app.loop.renderRoot.flush();
  expect(app.desktop.activeWindow()).toBe(b); // b added last ⇒ active

  // Click inside a's interior (window-local (3,2) → abs (3,2)).
  app.loop.dispatch(mouse('down', 3, 2));
  expect(app.desktop.children.at(-1)).toBe(a); // a now top z
  expect(app.desktop.activeWindow()).toBe(a);
});

// ST-08 / AC-8 — drag the title by Δ, clamped so the title row stays visible / ≥1 col inside.
test('ST-08: drag the title bar repositions the window, clamped at the edge', () => {
  const app = shellApp(40, 12);
  const w = addWindow(app, 'W', { x: 5, y: 2, width: 12, height: 5 });
  app.loop.renderRoot.flush();

  // Grab the title at window-local (6,0) → abs (11,2); drag to abs (15,5); release.
  app.loop.dispatch(mouse('down', 11, 2));
  app.loop.dispatch(mouse('drag', 15, 5));
  app.loop.dispatch(mouse('up', 15, 5));
  expect(w.layout.rect).toEqual({ x: 9, y: 5, width: 12, height: 5 }); // moved by Δ(4,3)

  // Drag far past the right edge → clamped so ≥1 column stays inside (x ≤ desktopW-1).
  app.loop.dispatch(mouse('down', 9, 5)); // grab at the new top-left corner-ish (local (0,0) → title)
  app.loop.dispatch(mouse('drag', 100, 5));
  app.loop.dispatch(mouse('up', 100, 5));
  expect(w.layout.rect.x).toBe(app.desktop.bounds.width - 1);
});

// ST-09 / AC-9 — drag the SE corner to resize, floored at 10×3.
test('ST-09: drag the SE corner resizes the window, floored at 10×3', () => {
  const app = shellApp(40, 16);
  const w = addWindow(app, 'W', { x: 0, y: 0, width: 14, height: 8 });
  app.loop.renderRoot.flush();

  // SE corner at window-local (13,7) → abs (13,7). Drag to abs (24,12): new size = pointer - origin + 1.
  app.loop.dispatch(mouse('down', 13, 7));
  app.loop.dispatch(mouse('drag', 24, 12));
  app.loop.dispatch(mouse('up', 24, 12));
  expect(w.layout.rect.width).toBe(25); // 24 - 0 + 1
  expect(w.layout.rect.height).toBe(13); // 12 - 0 + 1

  // Drag the corner inward below the minimum → floored at 10×3.
  app.loop.dispatch(mouse('down', 24, 12));
  app.loop.dispatch(mouse('drag', 0, 0));
  app.loop.dispatch(mouse('up', 0, 0));
  expect(w.layout.rect.width).toBe(10);
  expect(w.layout.rect.height).toBe(3);
});

// ST-10 / AC-10 — zoom toggles: first maximizes to the desktop; second restores the exact geometry.
test('ST-10: zoom maximizes then restores the exact prior geometry', () => {
  const app = shellApp(30, 12);
  const w = addWindow(app, 'W', { x: 3, y: 2, width: 12, height: 6 });
  app.loop.renderRoot.flush();
  const original = { ...w.layout.rect };

  w.zoom();
  expect(w.layout.rect).toEqual({ x: 0, y: 0, width: app.desktop.bounds.width, height: app.desktop.bounds.height });
  w.zoom();
  expect(w.layout.rect).toEqual(original);
});

// ST-11 / AC-11 — cascade staggers +1row/+2col from top-left; tile packs a near-square grid; N=0/1.
test('ST-11: cascade staggers; tile packs a grid; un-zoom first; N=0/1 edge cases', () => {
  const app = shellApp(40, 20);
  const a = addWindow(app, 'A', { x: 5, y: 5, width: 12, height: 6 });
  const b = addWindow(app, 'B', { x: 8, y: 8, width: 12, height: 6 });
  app.loop.renderRoot.flush();

  a.zoom(); // a is zoomed; cascade must un-zoom first
  app.desktop.cascade();
  expect(a.layout.rect.x).toBe(0); // window 0 at top-left
  expect(a.layout.rect.y).toBe(0);
  expect(b.layout.rect.x).toBe(2); // window 1 staggered +2 col / +1 row
  expect(b.layout.rect.y).toBe(1);

  app.desktop.tile(); // 2 windows ⇒ cols=2, rows=1; cell = floor(40/2) × floor(20/1)
  expect(a.layout.rect).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  expect(b.layout.rect).toEqual({ x: 20, y: 0, width: 20, height: 20 });

  // N=1 fills; N=0 is a no-op (no throw).
  app.desktop.removeWindow(b);
  app.desktop.tile();
  expect(a.layout.rect).toEqual({ x: 0, y: 0, width: 40, height: 20 });
  app.desktop.removeWindow(a);
  expect(() => app.desktop.tile()).not.toThrow();
});

// ST-12 / AC-12 — next/prev cycle focus raising the newly-active; Alt-N focuses+raises window N.
test('ST-12: next/prev cycle + raise; Alt-N focuses the numbered window', () => {
  const app = shellApp(40, 12);
  const a = addWindow(app, 'A', { x: 0, y: 0, width: 12, height: 5 });
  a.number = 1;
  const b = addWindow(app, 'B', { x: 13, y: 0, width: 12, height: 5 });
  b.number = 2;
  const c = addWindow(app, 'C', { x: 26, y: 0, width: 12, height: 5 });
  c.number = 3;
  app.loop.renderRoot.flush();
  expect(app.desktop.activeWindow()).toBe(c); // last added

  app.loop.emitCommand('next'); // cycle to the next window, raising it
  const afterNext = app.desktop.activeWindow();
  expect(afterNext).not.toBe(c);
  expect(app.desktop.children.at(-1)).toBe(afterNext); // raised to the top

  app.loop.emitCommand('prev');
  expect(app.desktop.activeWindow()).toBe(c); // back to c

  // Alt-2 focuses + raises window number 2 (b).
  app.loop.dispatch({ type: 'key', key: '2', ctrl: false, alt: true, shift: false });
  expect(app.desktop.activeWindow()).toBe(b);
  expect(app.desktop.children.at(-1)).toBe(b);
});

// ST-13 / AC-13 — close the active window: removed, its onCleanup fires, next top-most becomes active.
test('ST-13: closing the active window activates the next top-most', () => {
  const app = shellApp(40, 12);
  const a = addWindow(app, 'A', { x: 0, y: 0, width: 12, height: 5 });
  const b = addWindow(app, 'B', { x: 13, y: 0, width: 12, height: 5 });
  app.loop.renderRoot.flush();
  expect(app.desktop.activeWindow()).toBe(b);

  let cleaned = false;
  b.onCleanup(() => (cleaned = true)); // b is mounted (added + reflowed)

  b.close();
  expect(app.desktop.children.includes(b)).toBe(false);
  expect(cleaned).toBe(true); // scope disposed
  expect(app.desktop.activeWindow()).toBe(a); // next top-most active
});
