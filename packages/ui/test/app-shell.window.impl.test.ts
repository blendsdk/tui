/**
 * Implementation tests — RD-05 Window + Frame internals (Phase 3).
 *
 * Edge cases beyond ST-14/ST-15: frameZoneAt boundaries; flag gating; reactive title repaint;
 * content inset = window minus the 1-cell border; close disposes the scope (onCleanup spy).
 *
 * Trace: RD-05 03-03 (Error Handling table) · AR-67/AR-74.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import { Group } from '../src/view/index.js';
import type { DrawContext } from '../src/view/index.js';
import { createApplication } from '../src/app/index.js';
import { Window, frameZoneAt } from '../src/window/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;
const ALL = { movable: true, resizable: true, zoomable: true, closable: true };
const size = { width: 20, height: 6 };

test('the active window draws a double-line border; the inactive a single-line one (Turbo Vision)', () => {
  const app = createApplication({ caps, viewport: { width: 40, height: 10 } });
  const a = new Window('A');
  a.layout.rect = { x: 0, y: 0, width: 12, height: 5 };
  const b = new Window('B');
  b.layout.rect = { x: 20, y: 0, width: 12, height: 5 };
  app.desktop.addWindow(a);
  app.desktop.addWindow(b); // added last ⇒ active
  app.loop.renderRoot.flush();
  const buf = app.loop.renderRoot.buffer();

  expect(buf.get(20, 0)?.char).toBe('╔'); // active: double-line corner
  expect(buf.get(20, 2)?.char).toBe('║'); // active: double-line vertical edge
  expect(buf.get(0, 0)?.char).toBe('┌'); // inactive: single-line corner
  expect(buf.get(0, 2)?.char).toBe('│'); // inactive: single-line vertical edge

  app.desktop.raise(a); // flip which window is active
  app.loop.renderRoot.flush();
  const flipped = app.loop.renderRoot.buffer();
  expect(flipped.get(0, 0)?.char).toBe('╔'); // a now active → double
  expect(flipped.get(20, 0)?.char).toBe('┌'); // b now inactive → single
});

test('frameZoneAt classifies each chrome zone', () => {
  expect(frameZoneAt(size, { x: 2, y: 0 }, ALL)).toBe('close'); // [×] cols 1–3
  expect(frameZoneAt(size, { x: 17, y: 0 }, ALL)).toBe('zoom'); // [↑] cols w-4…w-2 = 16–18
  expect(frameZoneAt(size, { x: 19, y: 5 }, ALL)).toBe('resize'); // SE corner (w-1,h-1)
  expect(frameZoneAt(size, { x: 8, y: 0 }, ALL)).toBe('title'); // top row, not a box
  expect(frameZoneAt(size, { x: 0, y: 3 }, ALL)).toBe('border'); // left edge
  expect(frameZoneAt(size, { x: 5, y: 3 }, ALL)).toBe('interior'); // inside
});

test('frameZoneAt gates zones behind the window flags', () => {
  expect(frameZoneAt(size, { x: 2, y: 0 }, { ...ALL, closable: false })).toBe('title'); // no close box
  expect(frameZoneAt(size, { x: 17, y: 0 }, { ...ALL, zoomable: false })).toBe('title'); // no zoom box
  expect(frameZoneAt(size, { x: 19, y: 5 }, { ...ALL, resizable: false })).toBe('border'); // no resize corner
});

test('the window content child is inset by the 1-cell border (padding:1)', () => {
  const app = createApplication({ caps, viewport: { width: 30, height: 12 } });
  const w = new Window('W');
  w.layout.rect = { x: 0, y: 0, width: 20, height: 8 };
  const content = new Group();
  content.layout = { size: { kind: 'fr', weight: 1 } };
  w.add(content);
  app.desktop.addWindow(w);
  app.loop.renderRoot.flush();

  // The content fills the interior inset by the 1-cell frame on every side: 18×6 at (1,1).
  expect(content.bounds).toEqual({ x: 1, y: 1, width: 18, height: 6 });
});

test('a reactive title change repaints the new title', () => {
  const app = createApplication({ caps, viewport: { width: 30, height: 12 } });
  const w = new Window('Old');
  w.layout.rect = { x: 0, y: 0, width: 20, height: 6 };
  app.desktop.addWindow(w);
  app.loop.renderRoot.flush();

  w.title.set('New');
  app.loop.renderRoot.flush();
  const buf = app.loop.renderRoot.buffer();
  let topRow = '';
  for (let x = 0; x < 20; x += 1) topRow += buf.get(x, 0)?.char ?? ' ';
  expect(topRow).toContain('New');
  expect(topRow).not.toContain('Old');
});

test('close disposes the window scope (onCleanup fires) and is a no-op when !closable', () => {
  const app = createApplication({ caps, viewport: { width: 30, height: 12 } });
  const w = new Window('W');
  w.layout.rect = { x: 0, y: 0, width: 20, height: 6 };
  app.desktop.addWindow(w);
  app.loop.renderRoot.flush();

  let cleaned = false;
  w.onCleanup(() => (cleaned = true));
  w.close();
  expect(cleaned).toBe(true);
  expect(app.desktop.children.includes(w)).toBe(false);

  // A !closable window ignores close().
  const w2 = new Window('W2');
  w2.closable = false;
  w2.layout.rect = { x: 0, y: 0, width: 12, height: 5 };
  app.desktop.addWindow(w2);
  app.loop.renderRoot.flush();
  w2.close();
  expect(app.desktop.children.includes(w2)).toBe(true);
});

test('a content child draws over the interior, never the border', () => {
  // A window whose only child paints a glyph fill; the border cells stay frame glyphs.
  class Filler extends Group {
    override draw(ctx: DrawContext): void {
      ctx.fill('#');
    }
  }
  const app = createApplication({ caps, viewport: { width: 30, height: 12 } });
  const w = new Window('W');
  w.layout.rect = { x: 0, y: 0, width: 20, height: 6 };
  const filler = new Filler();
  filler.layout = { size: { kind: 'fr', weight: 1 } };
  w.add(filler);
  app.desktop.addWindow(w);
  app.loop.renderRoot.flush();
  const buf = app.loop.renderRoot.buffer();

  expect(buf.get(5, 3)?.char).toBe('#'); // interior filled by the content child
  expect(buf.get(0, 0)?.char).not.toBe('#'); // the border corner is untouched
});
