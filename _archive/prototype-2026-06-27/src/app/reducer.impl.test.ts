/**
 * Implementation tests for the shell reducer: every mode transition and the
 * cyclic, bounds-safe menu navigation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from './reducer.js';
import { INITIAL_STATE, Mode } from './state.js';

test('opens the menu and resets the highlight to the first item', () => {
  const next = reduce({ mode: Mode.Desktop, menuIndex: 5 }, { type: 'menu-open' });
  assert.equal(next.mode, Mode.Menu);
  assert.equal(next.menuIndex, 0);
});

test('menu navigation wraps cyclically in both directions', () => {
  const open = reduce(INITIAL_STATE, { type: 'menu-open' });
  const up = reduce(open, { type: 'menu-move', delta: -1 });
  assert.equal(up.menuIndex, 1, 'moving up from the first item wraps to the last');

  const downPastEnd = reduce({ mode: Mode.Menu, menuIndex: 1 }, { type: 'menu-move', delta: 1 });
  assert.equal(downPastEnd.menuIndex, 0, 'moving down from the last item wraps to the first');
});

test('menu-move is a no-op when the menu is closed', () => {
  const state = { mode: Mode.Desktop, menuIndex: 0 };
  assert.deepEqual(reduce(state, { type: 'menu-move', delta: 1 }), state);
});

test('opening and closing the dialog toggles only the mode', () => {
  const opened = reduce(INITIAL_STATE, { type: 'open-dialog' });
  assert.equal(opened.mode, Mode.Dialog);
  const closed = reduce(opened, { type: 'close-dialog' });
  assert.equal(closed.mode, Mode.Desktop);
});

test('closing the menu returns to the desktop', () => {
  const open = reduce(INITIAL_STATE, { type: 'menu-open' });
  assert.equal(reduce(open, { type: 'menu-close' }).mode, Mode.Desktop);
});
