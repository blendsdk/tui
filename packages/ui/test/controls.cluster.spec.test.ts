/**
 * Specification tests (immutable oracles) — RD-06 `CheckGroup` + `RadioGroup` (03-06).
 *
 * Source: jsvision-ui RD-06 AC-6/AC-7 → ST-10/ST-11 (essential-controls/07-testing-strategy.md).
 * TV source: `tcluster.cpp:87-129` (the 5-cell box: icon at col, mark at col+2, label at col+5),
 * `tcheckbo.cpp` (`button=" [ ] "`, marker `" X"`), `tradiobu.cpp` (`button=" ( ) "`, marker `" \x7"`
 * → the unambiguous-narrow `•`, PA-9). Real `View`/`EventLoop` over fixed `caps`; buffers read
 * pre-serialize. Cluster roles share a cyan bg, so the fg distinguishes selected/normal. Expectations
 * derive from the TV geometry + theme roles, never from the implementation.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, defaultTheme } from '@jsvision/core';
import type { KeyEvent, MouseEvent as CoreMouseEvent } from '@jsvision/core';
import { Group } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import { signal } from '../src/reactive/index.js';
import { CheckGroup, RadioGroup } from '../src/controls/index.js';
import type { Cluster } from '../src/controls/cluster.js';

/** Mount a cluster as a child of a Group root (focus routing needs a Group-rooted current chain). */
function mountCluster(cluster: Cluster, width: number, rows: number): ReturnType<typeof createEventLoop> {
  const root = new Group();
  root.layout = { direction: 'col' };
  cluster.layout = { size: { kind: 'fixed', cells: rows } };
  root.add(cluster);
  const loop = createEventLoop({ width, height: rows }, { caps });
  loop.mount(root);
  loop.focusView(cluster);
  return loop;
}

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function key(k: string, mods: Partial<Pick<KeyEvent, 'alt' | 'ctrl' | 'shift'>> = {}): KeyEvent {
  return { type: 'key', key: k, ctrl: false, alt: false, shift: false, ...mods };
}
function mouseDown(x: number, y: number): CoreMouseEvent {
  return { type: 'mouse', kind: 'down', button: 0, x, y };
}

// ST-10 / AC-6 — CheckGroup renders ` [ ] `/` [X] ` per the bound boolean[]; Space/click toggles.
test('ST-10: CheckGroup draws the [ ]/[X] box, toggles on Space/click, writes the bound array', () => {
  const value = signal([false, false]);
  const cg = new CheckGroup(['~B~old', '~I~talic'], value);
  const loop = mountCluster(cg, 12, 2);

  const buf = loop.renderRoot.buffer();
  // Row 0: " [ ] Bold" — box at cols 0..4 (mark at col 2), label from col 5.
  expect(buf.get(1, 0)?.char).toBe('[');
  expect(buf.get(2, 0)?.char).toBe(' '); // unchecked
  expect(buf.get(3, 0)?.char).toBe(']');
  expect(buf.get(5, 0)?.char).toBe('B'); // label + hotkey
  expect(buf.get(5, 0)?.fg).toBe(defaultTheme.clusterShortcut.fg);
  expect(buf.get(6, 0)?.fg).toBe(defaultTheme.clusterSelected.fg); // item 0 is the focused item
  expect(buf.get(6, 1)?.fg).toBe(defaultTheme.clusterNormal.fg); // item 1 unfocused

  // Space toggles the focused item 0.
  loop.dispatch(key('space'));
  expect(value()).toEqual([true, false]);
  expect(loop.renderRoot.buffer().get(2, 0)?.char).toBe('X');

  // A click on row 1 toggles + focuses item 1.
  loop.dispatch(mouseDown(1, 2)); // 1-based (1,2) → absolute (0,1) → item 1
  expect(value()).toEqual([true, true]);
  const buf2 = loop.renderRoot.buffer();
  expect(buf2.get(2, 1)?.char).toBe('X');
  expect(buf2.get(6, 1)?.fg).toBe(defaultTheme.clusterSelected.fg); // focus moved to item 1
});

// ST-11 / AC-7 — RadioGroup renders ` ( ) `/` (•) `; ↓ moves selection (exclusive), writes the index.
test('ST-11: RadioGroup draws the ( )/(•) box, ↓ moves the exclusive selection, writes the index', () => {
  const value = signal(0);
  const rg = new RadioGroup(['~L~eft', '~C~enter', '~R~ight'], value);
  const loop = mountCluster(rg, 12, 3);

  const buf = loop.renderRoot.buffer();
  // Row 0 selected (value 0): " (•) Left".
  expect(buf.get(1, 0)?.char).toBe('(');
  expect(buf.get(2, 0)?.char).toBe('•'); // narrow filled marker (PA-9)
  expect(buf.get(3, 0)?.char).toBe(')');
  expect(buf.get(2, 1)?.char).toBe(' '); // item 1 not selected
  expect(buf.get(5, 0)?.char).toBe('L');
  expect(buf.get(5, 0)?.fg).toBe(defaultTheme.clusterShortcut.fg);

  // ↓ moves the selection to item 1 (radio: moving selects), clearing item 0.
  loop.dispatch(key('down'));
  expect(value()).toBe(1);
  const buf2 = loop.renderRoot.buffer();
  expect(buf2.get(2, 1)?.char).toBe('•'); // item 1 now filled
  expect(buf2.get(2, 0)?.char).toBe(' '); // item 0 cleared (exclusive)
  expect(buf2.get(6, 1)?.fg).toBe(defaultTheme.clusterSelected.fg); // focus on item 1
});
