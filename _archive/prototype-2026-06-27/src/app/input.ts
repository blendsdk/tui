/**
 * Terminal input: parse raw stdin bytes into structured events, then interpret
 * those events against the current state. Both halves are pure functions so the
 * key map and the mouse hit-testing can be unit-tested without a terminal.
 *
 * We handle input ourselves (rather than via Ink's `useInput`) so that mouse
 * escape sequences are not misread as keystrokes, and so keys and clicks flow
 * through one consistent path.
 */

import { FILE_MENU, Mode, type AppState } from './state.js';
import { type Action } from './reducer.js';
import {
  FILE_MENU_RECT,
  contains,
  dialogOkRect,
  dropdownItemRect,
  helloButtonRect,
} from './geometry.js';
import type { ScreenSize } from '../tui/useScreenSize.js';

/** A decoded keyboard event. `char` is set for printable/meta keys. */
export interface KeyEvent {
  kind: 'key';
  name: 'up' | 'down' | 'enter' | 'escape' | 'space' | 'ctrl-c' | 'char';
  char?: string;
  meta?: boolean;
}

/** A decoded mouse event in 0-based buffer coordinates. */
export interface MouseEvent {
  kind: 'mouse';
  x: number;
  y: number;
  button: number;
  press: boolean;
}

/** Any decoded terminal input event. */
export type InputEvent = KeyEvent | MouseEvent;

/** The result of interpreting an event: an action, the exit sentinel, or none. */
export type Outcome = Action | 'exit' | null;

/** SGR mouse reports look like `ESC [ < b ; x ; y (M|m)`. */
const MOUSE_PATTERN = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

/**
 * Parse a chunk of raw stdin into events. Mouse reports take priority; when
 * none are present the chunk is decoded as a single keyboard event.
 */
export function parseInput(data: string): InputEvent[] {
  const mice = parseMouse(data);
  if (mice.length > 0) return mice;
  const key = parseKey(data);
  return key ? [key] : [];
}

/** Extract every SGR mouse report from a chunk. */
function parseMouse(data: string): MouseEvent[] {
  const events: MouseEvent[] = [];
  for (const match of data.matchAll(MOUSE_PATTERN)) {
    events.push({
      kind: 'mouse',
      button: Number(match[1]),
      // Terminal coordinates are 1-based; the buffer is 0-based.
      x: Number(match[2]) - 1,
      y: Number(match[3]) - 1,
      press: match[4] === 'M',
    });
  }
  return events;
}

/** Decode a chunk that is not a mouse report into one keyboard event. */
function parseKey(data: string): KeyEvent | null {
  switch (data) {
    case '\x03':
      return { kind: 'key', name: 'ctrl-c' };
    case '\r':
    case '\n':
      return { kind: 'key', name: 'enter' };
    case ' ':
      return { kind: 'key', name: 'space' };
    case '\x1b':
      return { kind: 'key', name: 'escape' };
    case '\x1b[A':
      return { kind: 'key', name: 'up' };
    case '\x1b[B':
      return { kind: 'key', name: 'down' };
    default:
      break;
  }

  // Alt+<letter> arrives as ESC followed by the letter.
  if (data.length === 2 && data[0] === '\x1b') {
    return { kind: 'key', name: 'char', char: data[1], meta: true };
  }
  // A lone printable character.
  if (data.length === 1 && data >= ' ') {
    return { kind: 'key', name: 'char', char: data };
  }
  return null;
}

/** Interpret an event against the current state and screen size. */
export function interpret(event: InputEvent, state: AppState, size: ScreenSize): Outcome {
  return event.kind === 'mouse'
    ? interpretMouse(event, state, size)
    : interpretKey(event, state);
}

/** The action for activating a menu item by id. */
function activateItem(id: (typeof FILE_MENU)[number]['id']): Outcome {
  return id === 'exit' ? 'exit' : { type: 'open-dialog' };
}

/** Map a keyboard event to an outcome, honouring the active mode. */
function interpretKey(event: KeyEvent, state: AppState): Outcome {
  if (event.name === 'ctrl-c') return 'exit';
  if (event.meta && event.char?.toLowerCase() === 'x') return 'exit';

  if (state.mode === Mode.Dialog) {
    const dismiss = event.name === 'enter' || event.name === 'escape' || event.name === 'space';
    return dismiss ? { type: 'close-dialog' } : null;
  }

  if (state.mode === Mode.Menu) return interpretMenuKey(event, state);

  // Desktop.
  if (event.meta && event.char?.toLowerCase() === 'f') return { type: 'menu-open' };
  if (event.name === 'enter' || event.name === 'space') return { type: 'open-dialog' };
  return null;
}

/** Keyboard handling specific to the open File menu. */
function interpretMenuKey(event: KeyEvent, state: AppState): Outcome {
  if (event.name === 'escape') return { type: 'menu-close' };
  if (event.name === 'up') return { type: 'menu-move', delta: -1 };
  if (event.name === 'down') return { type: 'menu-move', delta: 1 };
  if (event.name === 'enter') return activateItem(FILE_MENU[state.menuIndex].id);

  // Direct hotkey letters (e.g. 'h' for Hello, 'x' for Exit).
  if (event.name === 'char' && event.char) {
    const lower = event.char.toLowerCase();
    for (const item of FILE_MENU) {
      const hotkey = [...item.label][item.hotkeyIndex]?.toLowerCase();
      if (hotkey === lower) return activateItem(item.id);
    }
  }
  return null;
}

/** Map a left-button press to an outcome based on what it landed on. */
function interpretMouse(event: MouseEvent, state: AppState, size: ScreenSize): Outcome {
  // Only react to the left button being pressed (low two button bits == 0).
  if (!event.press || (event.button & 3) !== 0) return null;
  const { x, y } = event;

  if (state.mode === Mode.Dialog) {
    return contains(dialogOkRect(size), x, y) ? { type: 'close-dialog' } : null;
  }

  if (state.mode === Mode.Menu) {
    for (let i = 0; i < FILE_MENU.length; i += 1) {
      if (contains(dropdownItemRect(i), x, y)) return activateItem(FILE_MENU[i].id);
    }
    // A click on the File label or anywhere else closes the menu.
    return { type: 'menu-close' };
  }

  // Desktop.
  if (contains(FILE_MENU_RECT, x, y)) return { type: 'menu-open' };
  if (contains(helloButtonRect(size), x, y)) return { type: 'open-dialog' };
  return null;
}
