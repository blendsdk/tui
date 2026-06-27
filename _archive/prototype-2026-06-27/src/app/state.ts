/**
 * Application UI state model.
 *
 * The shell is a tiny state machine with three mutually-exclusive interaction
 * modes plus the desktop's focused control. Centralising it here keeps the
 * input handler and the painter in agreement about what is on screen.
 */

/** Which surface currently owns keyboard input. */
export enum Mode {
  /** The desktop and its window/button are interactive. */
  Desktop = 'desktop',
  /** The File menu is dropped down. */
  Menu = 'menu',
  /** The Hello World dialog is modal in front of everything. */
  Dialog = 'dialog',
}

/** A single entry in the File drop-down menu. */
export interface MenuItem {
  /** Stable identifier used by the input handler to dispatch the action. */
  id: 'hello' | 'exit';
  /** Visible label. */
  label: string;
  /** Right-aligned shortcut hint, e.g. "Alt-X". */
  shortcut: string;
  /** Index of the hotkey letter within {@link label} to highlight. */
  hotkeyIndex: number;
}

/** The File menu contents, declared once and shared by painter and handler. */
export const FILE_MENU: MenuItem[] = [
  { id: 'hello', label: 'Hello...', shortcut: 'Enter', hotkeyIndex: 0 },
  { id: 'exit', label: 'Exit', shortcut: 'Alt-X', hotkeyIndex: 1 },
];

/** Complete, serialisable snapshot of what the shell is showing. */
export interface AppState {
  mode: Mode;
  /** Highlighted item while {@link Mode.Menu} is active. */
  menuIndex: number;
}

/** The state the application boots into: bare desktop, nothing focused open. */
export const INITIAL_STATE: AppState = {
  mode: Mode.Desktop,
  menuIndex: 0,
};
