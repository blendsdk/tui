/**
 * Implementation tests — RD-11 `Scroller` internals & edges (03-03).
 *
 * Covers content-smaller-than-viewport ⇒ a disabled (`max==min`) bar, `'both'` bars reserving two
 * edges, `pageStep = viewport − 1`, clamp at `extent − viewport`, thumb-drag scrolling the content,
 * wheel-over-content, and horizontal scroll. Real `View`/`RenderRoot`/`EventLoop`. `.js` per NodeNext.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { KeyEvent, MouseEvent as CoreMouseEvent, WheelEvent as CoreWheelEvent } from '@jsvision/core';
import { View, Group, createRenderRoot } from '../src/view/index.js';
import type { DrawContext } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import { Scroller } from '../src/scroll/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;
const DISABLED = '▓';
const V_UP = '▲';
const H_LEFT = '◄';

function key(k: string): KeyEvent {
  return { type: 'key', key: k, ctrl: false, alt: false, shift: false };
}
function mouse(kind: 'down' | 'move' | 'up', x: number, y: number): CoreMouseEvent {
  return { type: 'mouse', kind, button: 0, x, y };
}
function wheel(dir: 'up' | 'down', x: number, y: number): CoreWheelEvent {
  return { type: 'wheel', dir, x, y };
}

/** Content whose row `y` (or column `x` for the wide case) is the letter A+index. */
class LetterRows extends View {
  constructor(
    readonly rows: number,
    readonly byColumn = false,
  ) {
    super();
  }
  draw(ctx: DrawContext): void {
    const style = ctx.color('listNormal');
    if (this.byColumn) {
      for (let x = 0; x < this.rows; x += 1) ctx.text(x, 0, String.fromCharCode(65 + (x % 26)), style);
    } else {
      for (let y = 0; y < this.rows; y += 1) ctx.text(0, y, String.fromCharCode(65 + (y % 26)), style);
    }
  }
}

/** Mount a Scroller filling `w×h` under a root Group and focus it; returns the loop + scroller. */
function hosted(scroller: Scroller, w: number, h: number): ReturnType<typeof createEventLoop> {
  scroller.layout = { position: 'absolute', rect: { x: 0, y: 0, width: w, height: h } };
  const root = new Group();
  root.add(scroller);
  const loop = createEventLoop({ width: w, height: h }, { caps });
  loop.mount(root);
  loop.focusView(scroller);
  return loop;
}

// Content smaller than the viewport ⇒ the owned bar is disabled (max==min): its track draws all ▓.
test('content smaller than the viewport ⇒ a disabled ▓ bar', () => {
  const scroller = new Scroller({
    content: new LetterRows(3),
    extent: { width: 10, height: 3 },
    scrollbars: 'vertical',
  });
  const rr = createRenderRoot({ width: 10, height: 5 }, { caps });
  rr.mount(scroller);
  // vbar in the rightmost column (x=9), height 5: arrows @ rows 0/4, disabled ▓ track @ rows 1..3.
  expect(rr.buffer().get(9, 1)?.char).toBe(DISABLED);
  expect(rr.buffer().get(9, 3)?.char).toBe(DISABLED);
});

// 'both' reserves two edges: vertical bar in the rightmost column, horizontal bar in the bottom row.
test("'both' reserves the right column + bottom row for the two bars", () => {
  const scroller = new Scroller({ content: new LetterRows(20), extent: { width: 30, height: 20 }, scrollbars: 'both' });
  const rr = createRenderRoot({ width: 10, height: 5 }, { caps });
  rr.mount(scroller);
  expect(rr.buffer().get(9, 0)?.char).toBe(V_UP); // vertical bar start arrow, rightmost col
  expect(rr.buffer().get(0, 4)?.char).toBe(H_LEFT); // horizontal bar start arrow, bottom row
});

// pageStep = viewport − 1 (TV setLimit): PgDn on a height-6 viewport moves 5.
test('PgDn steps by viewport − 1', () => {
  const scroller = new Scroller({
    content: new LetterRows(30),
    extent: { width: 10, height: 30 },
    scrollbars: 'vertical',
  });
  const loop = hosted(scroller, 10, 6);
  loop.dispatch(key('pagedown'));
  expect(scroller.delta.y).toBe(5); // viewport 6 − 1
});

// Thumb-drag maps the axis position to a proportional delta, scrolling the content.
test('dragging the owned bar scrolls the content', () => {
  const scroller = new Scroller({
    content: new LetterRows(20),
    extent: { width: 10, height: 20 },
    scrollbars: 'vertical',
  });
  const loop = hosted(scroller, 10, 10);
  // vbar in col 9 (0-based), thumb at row 1 for value 0. Grab (1-based x=10,y=2) → drag to row 4 (y=5).
  loop.dispatch(mouse('down', 10, 2));
  loop.dispatch(mouse('move', 10, 5));
  // s=getSize(10)-1=9; value = ((4-1)*(20-10) + ((9-2)>>1)) / (9-2) = (30+3)/7 = 4.
  expect(scroller.delta.y).toBe(4);
  expect(loop.renderRoot.buffer().get(0, 0)?.char).toBe('E'); // content row 4
  loop.dispatch(mouse('up', 10, 5));
});

// Wheel over the owned bar scrolls (TV's wheel lives on the scrollbar; PF-007 keeps wheel top-most,
// so it must be over the bar column, not the content) and clamps at 0 / max.
test('wheel over the bar scrolls the content and clamps', () => {
  const scroller = new Scroller({
    content: new LetterRows(20),
    extent: { width: 10, height: 20 },
    scrollbars: 'vertical',
  });
  const loop = hosted(scroller, 10, 5);
  const barX = 10; // 1-based x of the rightmost column (col 9)
  loop.dispatch(wheel('down', barX, 3)); // +3·arrowStep
  expect(scroller.delta.y).toBe(3);
  loop.dispatch(wheel('up', barX, 3)); // −3 → 0
  expect(scroller.delta.y).toBe(0);
  loop.dispatch(wheel('up', barX, 3)); // clamps at 0
  expect(scroller.delta.y).toBe(0);
});

// Horizontal scroll on a horizontal-only Scroller (wide content).
test('horizontal Scroller scrolls on the x axis', () => {
  const scroller = new Scroller({
    content: new LetterRows(20, true),
    extent: { width: 20, height: 5 },
    scrollbars: 'horizontal',
  });
  const loop = hosted(scroller, 10, 5);
  expect(loop.renderRoot.buffer().get(0, 0)?.char).toBe('A');
  loop.dispatch(key('right'));
  expect(scroller.delta.x).toBe(1);
  expect(loop.renderRoot.buffer().get(0, 0)?.char).toBe('B'); // column 1 now at the left
});
