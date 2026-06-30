/**
 * Standard shell command-name constants (RD-05 AR-76 / AR-85).
 *
 * Bind shell actions by constant, not by string literal, so a typo is a compile error and the set is
 * discoverable. `Application` passes `Object.values(Commands)` as the loop's `commands` hint and
 * binds `'quit'` to terminate `run()`; the window-manager commands (`close`/`zoom`/`next`/`prev`/
 * `cascade`/`tile`) are handled by the Desktop's post-process `onEvent` (03-02). `resize`/`move` are
 * deliberately omitted until a keyboard window mode exists (AR-85 / PF-004).
 */

/** The standard shell command names. */
export const Commands = {
  /** Quit the application (terminates `run()` with an exit code). */
  quit: 'quit',
  /** Close the active window. */
  close: 'close',
  /** Toggle maximize/restore on the active window. */
  zoom: 'zoom',
  /** Activate the next window in z-order. */
  next: 'next',
  /** Activate the previous window in z-order. */
  prev: 'prev',
  /** Cascade all windows from the top-left. */
  cascade: 'cascade',
  /** Tile all windows into a grid. */
  tile: 'tile',
} as const;

/** A standard shell command name (a value of {@link Commands}). */
export type CommandName = (typeof Commands)[keyof typeof Commands];
