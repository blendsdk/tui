/**
 * The application shell.
 *
 * Rendering and input are handled directly against the terminal rather than
 * through Ink's component tree:
 *  - Output: each frame is composited into a buffer and written in place
 *    (see {@link serialize}), which is flicker-free at full-screen size.
 *  - Input: raw stdin is parsed for both keys and mouse clicks in one path
 *    (see {@link parseInput}), avoiding mouse sequences being read as keys.
 *
 * Ink still owns the React lifecycle (state, effects, resize, clean exit), so
 * this component renders nothing itself and returns `null`.
 */

import { useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import { useApp, useStdin, useStdout } from 'ink';
import { serialize, useScreenSize, type ScreenSize } from '../tui/index.js';
import { CLEAR_SCREEN } from '../tui/ansi.js';
import { paint } from './paint.js';
import { reduce, INITIAL_STATE } from './reducer.js';
import { interpret, parseInput } from './input.js';

/** The top-level shell component. Renders to the terminal as a side effect. */
export function App(): null {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { stdin, setRawMode, isRawModeSupported } = useStdin();
  const size = useScreenSize();
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);

  // The stdin listener is installed once but must always see current values, so
  // we mirror state and size into refs that every render keeps up to date.
  const stateRef = useRef(state);
  stateRef.current = state;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // Install raw-mode input parsing for the lifetime of the component.
  useEffect(() => {
    if (!isRawModeSupported) return undefined;
    setRawMode(true);
    stdin.resume();

    const onData = (data: Buffer): void => {
      for (const event of parseInput(data.toString())) {
        const outcome = interpret(event, stateRef.current, sizeRef.current);
        if (outcome === 'exit') {
          exit();
        } else if (outcome) {
          dispatch(outcome);
        }
      }
    };

    stdin.on('data', onData);
    return () => {
      stdin.off('data', onData);
      setRawMode(false);
    };
    // The stdin stream and Ink helpers are stable for the app's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stdin]);

  // Recompute the ANSI frame only when the state or terminal size changes.
  const frame = useMemo(() => serialize(paint(state, size)), [state, size]);

  // Paint the frame in place. On a resize the grid dimensions change, so clear
  // once first to drop any cells left over from the previous size.
  const prevSize = useRef<ScreenSize | null>(null);
  useLayoutEffect(() => {
    const resized =
      !prevSize.current ||
      prevSize.current.columns !== size.columns ||
      prevSize.current.rows !== size.rows;
    if (resized) {
      stdout.write(CLEAR_SCREEN);
      prevSize.current = size;
    }
    stdout.write(frame);
  }, [frame, size, stdout]);

  return null;
}
