/**
 * Implementation tests for the input layer: decoding raw stdin into events and
 * interpreting both keys and mouse clicks against the UI state.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { interpret, parseInput, type MouseEvent } from './input.js';
import { Mode } from './state.js';
import { helloButtonRect, dialogOkRect, dropdownItemRect, FILE_MENU_RECT } from './geometry.js';
import type { ScreenSize } from '../tui/useScreenSize.js';

const SIZE: ScreenSize = { columns: 80, rows: 24 };

/** Build a left-button press event at the centre of a rectangle. */
function clickCentre(rect: { x: number; y: number; w: number; h: number }): MouseEvent {
  return {
    kind: 'mouse',
    button: 0,
    press: true,
    x: rect.x + Math.floor(rect.w / 2),
    y: rect.y + Math.floor(rect.h / 2),
  };
}

test('parseInput decodes arrows, enter, escape and space', () => {
  assert.deepEqual(parseInput('\x1b[A'), [{ kind: 'key', name: 'up' }]);
  assert.deepEqual(parseInput('\x1b[B'), [{ kind: 'key', name: 'down' }]);
  assert.deepEqual(parseInput('\r'), [{ kind: 'key', name: 'enter' }]);
  assert.deepEqual(parseInput('\x1b'), [{ kind: 'key', name: 'escape' }]);
  assert.deepEqual(parseInput(' '), [{ kind: 'key', name: 'space' }]);
});

test('parseInput decodes Alt+letter as a meta char', () => {
  assert.deepEqual(parseInput('\x1bf'), [{ kind: 'key', name: 'char', char: 'f', meta: true }]);
});

test('parseInput decodes an SGR mouse press into 0-based coordinates', () => {
  // ESC [ < button ; col ; row M  — column 10, row 3, 1-based.
  assert.deepEqual(parseInput('\x1b[<0;10;3M'), [
    { kind: 'mouse', button: 0, x: 9, y: 2, press: true },
  ]);
});

test('Alt-X exits from any mode', () => {
  const event = parseInput('\x1bx')[0];
  assert.equal(interpret(event, { mode: Mode.Desktop, menuIndex: 0 }, SIZE), 'exit');
  assert.equal(interpret(event, { mode: Mode.Dialog, menuIndex: 0 }, SIZE), 'exit');
});

test('clicking the Hello button on the desktop opens the dialog', () => {
  const event = clickCentre(helloButtonRect(SIZE));
  assert.deepEqual(interpret(event, { mode: Mode.Desktop, menuIndex: 0 }, SIZE), { type: 'open-dialog' });
});

test('clicking File on the desktop opens the menu', () => {
  const event = clickCentre(FILE_MENU_RECT);
  assert.deepEqual(interpret(event, { mode: Mode.Desktop, menuIndex: 0 }, SIZE), { type: 'menu-open' });
});

test('clicking the Exit item in the open menu exits', () => {
  const event = clickCentre(dropdownItemRect(1)); // index 1 == Exit
  assert.equal(interpret(event, { mode: Mode.Menu, menuIndex: 0 }, SIZE), 'exit');
});

test('clicking outside the open menu closes it', () => {
  const event: MouseEvent = { kind: 'mouse', button: 0, press: true, x: 70, y: 20 };
  assert.deepEqual(interpret(event, { mode: Mode.Menu, menuIndex: 0 }, SIZE), { type: 'menu-close' });
});

test('clicking OK in the dialog closes it', () => {
  const event = clickCentre(dialogOkRect(SIZE));
  assert.deepEqual(interpret(event, { mode: Mode.Dialog, menuIndex: 0 }, SIZE), { type: 'close-dialog' });
});

test('a mouse release (not press) is ignored', () => {
  const rect = helloButtonRect(SIZE);
  const release: MouseEvent = { kind: 'mouse', button: 0, press: false, x: rect.x, y: rect.y };
  assert.equal(interpret(release, { mode: Mode.Desktop, menuIndex: 0 }, SIZE), null);
});
