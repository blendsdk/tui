/**
 * React hook exposing the current terminal size and tracking resizes.
 *
 * Falls back to a sensible 80x24 when the stream does not report a size
 * (e.g. when output is piped rather than attached to a TTY).
 */

import { useEffect, useState } from 'react';
import { useStdout } from 'ink';

/** Terminal dimensions in character cells. */
export interface ScreenSize {
  columns: number;
  rows: number;
}

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

/** Return the live terminal size, updating on every resize event. */
export function useScreenSize(): ScreenSize {
  const { stdout } = useStdout();

  const read = (): ScreenSize => ({
    columns: stdout.columns || DEFAULT_COLUMNS,
    rows: stdout.rows || DEFAULT_ROWS,
  });

  const [size, setSize] = useState<ScreenSize>(read);

  useEffect(() => {
    const onResize = (): void => setSize(read());
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
    // `stdout` is stable for the life of the app; re-subscribing is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stdout]);

  return size;
}
