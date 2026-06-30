/**
 * Implementation tests — RD-06 `CheckGroup`/`RadioGroup` edge cases (03-06).
 *
 * Disabled-item skip on ↑/↓, click-to-item mapping, a short/out-of-range bound value, and hotkey
 * select. Driven through the real loop with the cluster under a Group root (focus routing).
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { KeyEvent, MouseEvent as CoreMouseEvent } from '@jsvision/core';
import { Group } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import { signal } from '../src/reactive/index.js';
import { CheckGroup, RadioGroup } from '../src/controls/index.js';
import type { Cluster } from '../src/controls/cluster.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function key(k: string, mods: Partial<Pick<KeyEvent, 'alt' | 'ctrl' | 'shift'>> = {}): KeyEvent {
  return { type: 'key', key: k, ctrl: false, alt: false, shift: false, ...mods };
}
function mouseDown(x: number, y: number): CoreMouseEvent {
  return { type: 'mouse', kind: 'down', button: 0, x, y };
}
function mount(cluster: Cluster, rows: number): ReturnType<typeof createEventLoop> {
  const root = new Group();
  root.layout = { direction: 'col' };
  cluster.layout = { size: { kind: 'fixed', cells: rows } };
  root.add(cluster);
  const loop = createEventLoop({ width: 14, height: rows }, { caps });
  loop.mount(root);
  loop.focusView(cluster);
  return loop;
}

test('↓ skips a disabled item (RadioGroup selects on move)', () => {
  const value = signal(0);
  const rg = new RadioGroup(['~A~', '~B~', '~C~'], value);
  rg.setItemEnabled(1, false); // disable the middle item
  const loop = mount(rg, 3);
  loop.dispatch(key('down')); // from item 0, skip the disabled item 1 → item 2
  expect(value()).toBe(2);
});

test('click-to-item toggles the clicked CheckGroup row', () => {
  const value = signal([false, false]);
  const cg = new CheckGroup(['~A~', '~B~'], value);
  const loop = mount(cg, 2);
  loop.dispatch(mouseDown(1, 2)); // 1-based (1,2) → absolute (0,1) → item 1
  expect(value()).toEqual([false, true]);
});

test('a short CheckGroup value reads missing flags as false and press writes a full-length array', () => {
  const value = signal([true]); // length 1, but two items
  const cg = new CheckGroup(['~A~', '~B~'], value);
  const loop = mount(cg, 2);
  loop.dispatch(mouseDown(1, 2)); // toggle item 1 (currently missing → false → true)
  expect(value()).toEqual([true, true]); // normalized to full length
});

test('an out-of-range RadioGroup index marks nothing until a valid press', () => {
  const value = signal(5); // no item has index 5
  const rg = new RadioGroup(['~A~', '~B~', '~C~'], value);
  const loop = mount(rg, 3);
  const buf = loop.renderRoot.buffer();
  expect(buf.get(2, 0)?.char).toBe(' '); // nothing marked
  expect(buf.get(2, 1)?.char).toBe(' ');
  loop.dispatch(mouseDown(1, 1)); // click row 0 → select index 0
  expect(value()).toBe(0);
});

test('Alt-<hotkey> selects the matching item', () => {
  const value = signal([false, false]);
  const cg = new CheckGroup(['~B~old', '~I~talic'], value);
  const loop = mount(cg, 2);
  loop.dispatch(key('i', { alt: true })); // matches item 1's hotkey
  expect(value()).toEqual([false, true]);
});
