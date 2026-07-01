/**
 * Specification tests (immutable oracles) — RD-11 `Scroller` (03-03).
 *
 * Source: jsvision-ui/RD-11 AC-2/AC-3 → ST-03/ST-04 (containers-scrolling-lists/07-testing-strategy.md).
 * TV source of truth: `TScroller` — `source/tvision/tscrolle.cpp` (`scrollDraw:95` mirrors
 * `delta ← {h,v}ScrollBar.value`; `setLimit:131` sets each bar range `[0, limit−size]`, `pageStep =
 * size−1`). Expectations derive from that decode + the ACs, NEVER from the implementation.
 *
 * The Scroller clips an oversized content child and offsets it by `-delta` (PA-8/PA-17: the offset is
 * applied in `Scroller.draw()` because the layout engine clamps absolute rects to ≥0). Real
 * `View`/`RenderRoot`/`EventLoop`, buffers read pre-`serialize`. `.js` specifiers per NodeNext.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { KeyEvent } from '@jsvision/core';
import { View, Group, createRenderRoot } from '../src/view/index.js';
import type { DrawContext } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import { ScrollBar, Scroller } from '../src/scroll/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function key(k: string): KeyEvent {
  return { type: 'key', key: k, ctrl: false, alt: false, shift: false };
}

/** Oversized content: each row `y` is filled with the letter A+y, so the visible top row reveals delta.y. */
class LetterRows extends View {
  constructor(readonly rows: number) {
    super();
  }
  draw(ctx: DrawContext): void {
    const style = ctx.color('listNormal');
    for (let y = 0; y < this.rows; y += 1) {
      ctx.text(0, y, String.fromCharCode(65 + (y % 26)), style);
    }
  }
}

// ST-03 / AC-2 — a 10×5 viewport over 10×20 content shows rows 0–4; ↓/PgDn reveal lower rows, the
// owned vertical bar's value tracks delta.y, and it clamps at extent − viewport.
test('ST-03: Scroller clips oversized content and reveals lower rows on scroll, clamped', () => {
  const content = new LetterRows(20);
  const scroller = new Scroller({ content, extent: { width: 10, height: 20 }, scrollbars: 'vertical' });
  // The host places the Scroller (a Window would); fill the 10×5 viewport absolutely.
  scroller.layout = { position: 'absolute', rect: { x: 0, y: 0, width: 10, height: 5 } };
  // A focusable container needs a parent to be the focused leaf (in real apps: the Desktop/Window).
  const root = new Group();
  root.add(scroller);
  const loop = createEventLoop({ width: 10, height: 5 }, { caps });
  loop.mount(root);
  loop.focusView(scroller);
  const buf = () => loop.renderRoot.buffer();

  // Initially delta=0 ⇒ content row 0 ('A') at the top.
  expect(buf().get(0, 0)?.char).toBe('A');
  expect(buf().get(0, 4)?.char).toBe('E'); // viewport height 5 ⇒ rows A..E

  // ↓ scrolls one row: top becomes 'B'.
  loop.dispatch(key('down'));
  expect(buf().get(0, 0)?.char).toBe('B');

  // The owned vertical bar's value now tracks delta.y = 1.
  const bar = scroller.children.find((c): c is ScrollBar => c instanceof ScrollBar);
  expect(bar).toBeDefined();
  expect(scroller.delta.y).toBe(1);

  // PgDn pages down (pageStep = viewport − 1 = 4) ⇒ delta.y = 5 ⇒ top 'F'.
  loop.dispatch(key('pagedown'));
  expect(scroller.delta.y).toBe(5);
  expect(buf().get(0, 0)?.char).toBe('F');

  // End clamps to extent − viewport = 20 − 5 = 15 (top row 'P'); further ↓ does not over-scroll.
  loop.dispatch(key('end'));
  expect(scroller.delta.y).toBe(15);
  loop.dispatch(key('down'));
  expect(scroller.delta.y).toBe(15);
  expect(buf().get(0, 0)?.char).toBe('P');
});

// ST-04 / AC-3 — the scrollbars mode auto-creates + wires the owned bars, no manual construction.
test('ST-04: scrollbars mode auto-owns the right bars', () => {
  const bars = (s: Scroller): ScrollBar[] => s.children.filter((c): c is ScrollBar => c instanceof ScrollBar);

  const vertical = new Scroller({
    content: new LetterRows(20),
    extent: { width: 10, height: 20 },
    scrollbars: 'vertical',
  });
  const none = new Scroller({ content: new LetterRows(20), extent: { width: 10, height: 20 }, scrollbars: 'none' });
  const both = new Scroller({ content: new LetterRows(20), extent: { width: 30, height: 20 }, scrollbars: 'both' });
  for (const s of [vertical, none, both]) {
    const rr = createRenderRoot({ width: 10, height: 5 }, { caps });
    rr.mount(s);
  }

  expect(bars(vertical).length).toBe(1);
  expect(bars(none).length).toBe(0);
  expect(bars(both).length).toBe(2);
});

// ST-04 — 'vertical' defaults when scrollbars is omitted (AR-105).
test('ST-04: scrollbars defaults to vertical', () => {
  const s = new Scroller({ content: new LetterRows(20), extent: { width: 10, height: 20 } });
  const rr = createRenderRoot({ width: 10, height: 5 }, { caps });
  rr.mount(s);
  const bars = s.children.filter((c): c is ScrollBar => c instanceof ScrollBar);
  expect(bars.length).toBe(1);
});
