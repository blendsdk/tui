/**
 * Specification tests (immutable oracles) — RD-05 Window + Frame chrome & theming (Phase 3).
 *
 * Source: RD-05 AC-14/AC-15 → ST-14, ST-15 (codeops/features/jsvision-ui/plans/app-shell/
 * 03-03-window-frame.md). Real Window/Desktop on a composed app (no mocks); the buffer is read
 * before serialize so the original chrome glyphs are asserted. The concrete frame chrome layout
 * (close `[×]` at cols 1–3, zoom `[↑]`/`[↓]` at cols w-4…w-2, SE corner at w-1,h-1, centered title)
 * is the documented 03-03 chrome — both the oracle and the impl derive from it.
 *
 * Trace: RD-05 03-03 · AR-67/AR-73/AR-74 · ST-14, ST-15.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, defaultTheme } from '@jsvision/core';
import { createApplication } from '../src/app/index.js';
import { Window } from '../src/window/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

/** Build a composed, chrome-less app (desktop fills the viewport at origin). */
function shellApp(width: number, height: number) {
  return createApplication({ caps, viewport: { width, height } });
}

/** The text of one buffer row, joined. */
function row(buf: ReturnType<ReturnType<typeof shellApp>['loop']['renderRoot']['buffer']>, y: number): string {
  let s = '';
  for (let x = 0; x < buf.width; x += 1) s += buf.get(x, y)?.char ?? ' ';
  return s;
}

// ST-14 / AC-14 — the frame chrome renders: border, centered title, number, close [×], zoom [↑], SE corner.
test('ST-14: a window renders its full frame chrome', () => {
  const app = shellApp(30, 10);
  const w = new Window('Editor');
  w.number = 1;
  w.layout.rect = { x: 0, y: 0, width: 20, height: 6 };
  app.desktop.addWindow(w);
  app.loop.renderRoot.flush();
  const buf = app.loop.renderRoot.buffer();

  // Close box [×] at the top-left (cols 1–3), zoom box [↑] at the top-right (cols w-4…w-2 = 16–18).
  expect(buf.get(2, 0)?.char).toBe('×');
  expect(buf.get(17, 0)?.char).toBe('↑'); // restored ⇒ the "maximize" arrow
  // Centered title on the top border.
  expect(row(buf, 0)).toContain('Editor');
  // Window number (1–9) drawn in the top border.
  expect(row(buf, 0)).toContain('1');
  // SE resize corner at (w-1, h-1) = (19, 5).
  expect(buf.get(19, 5)?.char).toBe('◢');
});

// ST-14 — a click on the close box closes the window (removed from the desktop).
test('ST-14: a close-box click closes the window', () => {
  const app = shellApp(30, 10);
  const w = new Window('A');
  w.layout.rect = { x: 0, y: 0, width: 20, height: 6 };
  app.desktop.addWindow(w);
  app.loop.renderRoot.flush();

  // 1-based mouse-down on the close box (window-local (2,0) → abs (2,0) → 1-based (3,1)).
  app.loop.dispatch({ type: 'mouse', kind: 'down', button: 0, x: 3, y: 1 });
  expect(app.desktop.children.includes(w)).toBe(false);
});

// ST-14 — a click on the zoom box toggles zoom (maximize to the desktop rect).
test('ST-14: a zoom-box click maximizes the window to the desktop', () => {
  const app = shellApp(30, 10);
  const w = new Window('A');
  w.layout.rect = { x: 2, y: 1, width: 20, height: 6 };
  app.desktop.addWindow(w);
  app.loop.renderRoot.flush();

  // Zoom box at window-local (17,0) → abs (2+17, 1+0) = (19,1) → 1-based (20,2).
  app.loop.dispatch({ type: 'mouse', kind: 'down', button: 0, x: 20, y: 2 });
  expect(w.layout.rect).toEqual({ x: 0, y: 0, width: app.desktop.bounds.width, height: app.desktop.bounds.height });
});

// ST-15 / AC-15 — the active (top, focused) window themes via the `window` role; the background one
// via `windowInactive`. Raising flips the two.
test('ST-15: active/inactive theming flips on raise', () => {
  const app = shellApp(40, 10);
  const a = new Window('A');
  a.layout.rect = { x: 0, y: 0, width: 12, height: 5 };
  const b = new Window('B');
  b.layout.rect = { x: 20, y: 0, width: 12, height: 5 };
  app.desktop.addWindow(a);
  app.desktop.addWindow(b); // b added last ⇒ active
  app.loop.renderRoot.flush();
  const buf = app.loop.renderRoot.buffer();

  // b is active (window role border), a is inactive (windowInactive role border).
  expect(buf.get(20, 0)?.fg).toBe(defaultTheme.window.border);
  expect(buf.get(0, 0)?.fg).toBe(defaultTheme.windowInactive.border);

  // Raise a → a active, b inactive; the two frames flip roles.
  app.desktop.raise(a);
  app.loop.renderRoot.flush();
  const buf2 = app.loop.renderRoot.buffer();
  expect(buf2.get(0, 0)?.fg).toBe(defaultTheme.window.border);
  expect(buf2.get(20, 0)?.fg).toBe(defaultTheme.windowInactive.border);
});
