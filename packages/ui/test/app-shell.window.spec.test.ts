/**
 * Specification tests (immutable oracles) — RD-05 Window + Frame chrome & theming (Phase 3).
 *
 * Source: RD-05 AC-14/AC-15 → ST-14, ST-15 (codeops/features/jsvision-ui/plans/app-shell/
 * 03-03-window-frame.md). Real Window/Desktop on a composed app (no mocks); the buffer is read
 * before serialize so the original chrome glyphs are asserted. The concrete frame chrome layout
 * (close `[×]` at cols 2–4, zoom `[↑]`/`[↕]` at cols w-5…w-3, number at w-7, grips `└─` at (0,1) and
 * `─┘` at (w-2,w-1) of the bottom row, centered title truncated to ≤ w-10−6−4) is the Turbo Vision
 * `TFrame` chrome (tframe.cpp:35-124 / tvtext1.cpp:77-81), which the project's NON-NEGOTIABLE
 * TV-fidelity directive (CLAUDE.md) makes authoritative: AC-14's earlier `◢` corner was a non-TV
 * invention and is superseded here, and the close/zoom icons render only on the active window.
 *
 * Trace: RD-05 03-03 · AR-67/AR-73/AR-74 · ST-14, ST-15 · TV TFrame.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, defaultTheme } from '@jsvision/core';
import type { MouseEvent } from '@jsvision/core';
import { createApplication } from '../src/app/index.js';
import { Window } from '../src/window/index.js';
import { frameZoneAt } from '../src/window/frame.js';
import type { WindowFlags } from '../src/window/frame.js';

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

// ST-14 / AC-14 — the frame chrome renders: border, centered title, number, close [×], zoom [↑], grips.
test('ST-14: a window renders its full frame chrome', () => {
  // Width 28 so the title still fits after TV's truncation (l = w-10 −6 boxes −4 number = 8 ≥ "Editor").
  const app = shellApp(40, 10);
  const w = new Window('Editor');
  w.number = 1;
  w.layout.rect = { x: 0, y: 0, width: 28, height: 6 };
  app.desktop.addWindow(w);
  app.loop.renderRoot.flush();
  const buf = app.loop.renderRoot.buffer();

  // Close box [×] at cols 2–4 (TV gap at col 1); zoom box [↑] at cols w-5…w-3 (23–25), glyph at w-4=24.
  expect(buf.get(2, 0)?.char).toBe('[');
  expect(buf.get(3, 0)?.char).toBe('×');
  expect(buf.get(24, 0)?.char).toBe('↑'); // restored ⇒ the "maximize" arrow
  // Centered title on the top border.
  expect(row(buf, 0)).toContain('Editor');
  // Window number (1–9) drawn in the top border at col w-7 = 21.
  expect(buf.get(21, 0)?.char).toBe('1');
  // Grips (TV dragLeftIcon `└─` + dragIcon `─┘`) on the active, resizable window: cols (0,1) and
  // (w-2,w-1) = (26,27) of the bottom row (h-1 = 5). Single-line corners stand out on the double border.
  expect(buf.get(0, 5)?.char).toBe('└');
  expect(buf.get(1, 5)?.char).toBe('─');
  expect(buf.get(26, 5)?.char).toBe('─');
  expect(buf.get(27, 5)?.char).toBe('┘');
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

/** A 1-based SGR mouse event of the given kind at absolute 0-based (x, y). */
function mouse(kind: MouseEvent['kind'], x: number, y: number): MouseEvent {
  return { type: 'mouse', kind, button: 0, x: x + 1, y: y + 1 };
}

// RD-10 ST-07 / AC-7 — the bottom-left grip resizes left+bottom edges with the right edge anchored,
// floored at MIN_WIDTH=10 (TV `dmDragGrowLeft`, `tframe.cpp:117-122`/`193`).
test('RD-10 ST-07: bottom-left grip moves left+bottom edges, right anchored, floored at 10×3', () => {
  const app = shellApp(40, 16);
  const w = new Window('W');
  w.layout.rect = { x: 10, y: 2, width: 14, height: 8 };
  app.desktop.addWindow(w);
  app.loop.renderRoot.flush();

  // SW grip at window-local (0, h-1) → abs (10, 9). Right edge anchored at x+width-1 = 23.
  app.loop.dispatch(mouse('down', 10, 9));
  app.loop.dispatch(mouse('drag', 6, 12)); // left to x=6, bottom to y=12
  expect(w.layout.rect).toEqual({ x: 6, y: 2, width: 18, height: 11 }); // right fixed at 23 ⇒ width 23-6+1

  // Drag the left edge right past the minimum → width floored at 10, x clamped to anchorRight-9 = 14.
  app.loop.dispatch(mouse('drag', 20, 5));
  expect(w.layout.rect.x).toBe(14);
  expect(w.layout.rect.width).toBe(10);
  app.loop.dispatch(mouse('up', 20, 5));
});

// RD-10 ST-08 / AC-8 — `frameZoneAt` classifies the SW grip cells as `resize-left` on a resizable
// window, the SE corner as `resize`, and the SW cells as `border` on a non-resizable window.
test('RD-10 ST-08: frameZoneAt — SW grip = resize-left (resizable), SE = resize, border otherwise', () => {
  const size = { width: 20, height: 6 }; // h-1 = 5, w-1 = 19
  const resizable: WindowFlags = { movable: true, resizable: true, zoomable: true, closable: true };
  const fixed: WindowFlags = { movable: true, resizable: false, zoomable: true, closable: true };

  expect(frameZoneAt(size, { x: 0, y: 5 }, resizable)).toBe('resize-left');
  expect(frameZoneAt(size, { x: 1, y: 5 }, resizable)).toBe('resize-left');
  expect(frameZoneAt(size, { x: 19, y: 5 }, resizable)).toBe('resize'); // SE corner
  // A non-resizable window: the SW grip cells fall through to the plain border zone.
  expect(frameZoneAt(size, { x: 0, y: 5 }, fixed)).toBe('border');
  expect(frameZoneAt(size, { x: 1, y: 5 }, fixed)).toBe('border');
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
