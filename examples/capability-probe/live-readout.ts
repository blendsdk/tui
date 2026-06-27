/**
 * Live input/mouse readout (RD-03, plan doc 03-03).
 *
 * Renders decoded input events as readable lines so keyboard/mouse/wheel/paste
 * support is observed directly (AC-2). Keys, mouse, wheel, and focus are shown in
 * full — the readout is on-screen output (not logging), and AC-2 requires the
 * keystroke to be visible — but a paste shows its BYTE LENGTH ONLY, never its
 * contents (AR-17, RT-5). The loop ends when the operator presses `q` (AR-8).
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import type { InputEvent } from '../../src/engine/index.js';

/** Maximum readout lines retained on screen (older lines scroll off). */
const MAX_LINES = 20;

/**
 * Format one decoded input event into a single readout line.
 *
 * Paste is reduced to a byte count so contents never reach the screen (AR-17);
 * mouse coordinates are RD-06's 1-based values shown verbatim (RT-4).
 *
 * @param event Any decoded input event (RD-06).
 * @returns A one-line, content-safe description.
 */
export function formatEventLine(event: InputEvent): string {
  switch (event.type) {
    case 'key': {
      const mods: string[] = [];
      if (event.ctrl) mods.push('ctrl');
      if (event.alt) mods.push('alt');
      if (event.shift) mods.push('shift');
      return `key: ${[...mods, event.key].join('+')}`;
    }
    case 'mouse':
      return `mouse: ${event.kind} button ${event.button} @ ${event.x},${event.y}`;
    case 'wheel':
      return `wheel: ${event.dir} @ ${event.x},${event.y}`;
    case 'paste': {
      const bytes = Buffer.byteLength(event.text, 'utf8');
      return `paste: ${bytes} bytes${event.truncated ? ' (truncated)' : ''}`;
    }
    case 'focus':
      return `focus: ${event.focused ? 'in' : 'out'}`;
  }
}

/** Default quit predicate: the `q` key ends the readout (AR-8). */
function isQuitKey(event: InputEvent): boolean {
  return event.type === 'key' && event.key === 'q';
}

/**
 * Run the live readout until the operator quits.
 *
 * @param deps Injectable `events` (decoded input stream), `render` (display the
 *   current readout lines), and an optional `isQuit` predicate (default: `q`).
 * @returns Resolves when the quit key is seen or the event stream ends.
 */
export async function runLiveReadout(deps: {
  events: AsyncIterable<InputEvent>;
  render: (lines: readonly string[]) => void;
  isQuit?: (event: InputEvent) => boolean;
}): Promise<void> {
  const quit = deps.isQuit ?? isQuitKey;
  const lines: string[] = [];
  for await (const event of deps.events) {
    if (quit(event)) break;
    lines.push(formatEventLine(event));
    if (lines.length > MAX_LINES) lines.shift();
    deps.render(lines);
  }
}
