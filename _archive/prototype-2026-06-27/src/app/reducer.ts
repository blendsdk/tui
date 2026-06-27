/**
 * The shell's state transitions, expressed as a pure reducer so that input
 * handling stays declarative and every mode change is in one auditable place.
 */

import { FILE_MENU, INITIAL_STATE, Mode, type AppState } from './state.js';

/** Everything the UI can be told to do, except quitting (handled by the host). */
export type Action =
  | { type: 'menu-open' }
  | { type: 'menu-close' }
  | { type: 'menu-move'; delta: number }
  | { type: 'menu-select'; index: number }
  | { type: 'open-dialog' }
  | { type: 'close-dialog' };

/** Wrap an index into the menu's bounds so navigation is cyclic. */
function wrapMenuIndex(index: number): number {
  const len = FILE_MENU.length;
  return ((index % len) + len) % len;
}

/**
 * Compute the next state for an action. Unknown transitions (e.g. moving the
 * menu while it is closed) collapse to "no change" by returning the input state.
 */
export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'menu-open':
      return { ...state, mode: Mode.Menu, menuIndex: 0 };
    case 'menu-close':
      return { ...state, mode: Mode.Desktop };
    case 'menu-move':
      if (state.mode !== Mode.Menu) return state;
      return { ...state, menuIndex: wrapMenuIndex(state.menuIndex + action.delta) };
    case 'menu-select':
      return { ...state, menuIndex: wrapMenuIndex(action.index) };
    case 'open-dialog':
      return { ...state, mode: Mode.Dialog };
    case 'close-dialog':
      return { ...state, mode: Mode.Desktop };
    default:
      return state;
  }
}

export { INITIAL_STATE };
