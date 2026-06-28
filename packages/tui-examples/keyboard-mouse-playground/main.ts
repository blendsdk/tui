/**
 * Keyboard / mouse playground — a runnable demo of @jsvision/core.
 *
 * A full-screen interactive app built ONLY on the foundation: `createHost`
 * (raw mode, alt-screen, input decoding, resize, guaranteed restore) + a
 * hand-drawn `ScreenBuffer` (no layout engine, no widgets, no extra deps). It
 * echoes every decoded input event — keys (with modifiers + codepoint), SGR
 * mouse (down/up/move/drag, incl. beyond column 223), wheel, bracketed paste,
 * and focus — plus a live mouse marker, a clickable hit-zone, and a rolling log.
 *
 * Run: `yarn workspace @jsvision/examples demo:playground`
 * Quit: `q` or Ctrl-C.
 *
 * The `.js`-less bare specifier resolves to the built `@jsvision/core`
 * package (workspace dependency); run via `tsx`.
 */
import { createHost, ScreenBuffer, resolveCapabilities } from '@jsvision/core';
import type { InputEvent, ResizeEvent, Style } from '@jsvision/core';

// --- Turbo-Vision-ish palette ---------------------------------------------
const DESKTOP: Style = { fg: 'cyan', bg: 'blue' };
const PANEL: Style = { fg: 'white', bg: 'blue' };
const LABEL: Style = { fg: 'yellow', bg: 'blue' };
const VALUE: Style = { fg: 'white', bg: 'blue' };
const HINT: Style = { fg: 'cyan', bg: 'blue' };
const ZONE: Style = { fg: 'white', bg: 'magenta' };
const ZONE_HOT: Style = { fg: 'black', bg: 'cyan' };
const MARKER: Style = { fg: 'black', bg: 'yellow' };

// --- live state ------------------------------------------------------------
let cols = process.stdout.columns ?? 80;
let rows = process.stdout.rows ?? 24;
let lastKey = '(press a key)';
let lastMouse = '(move the mouse)';
let lastWheel = '(scroll the wheel)';
let lastPaste = '(paste some text)';
let focused = true;
let mouseX = -1;
let mouseY = -1;
let hits = 0;
const logLines: string[] = [];

/** The clickable hit-zone rectangle (recomputed each render from the size). */
function hitZone(): { x: number; y: number; w: number; h: number } {
  return { x: cols - 24, y: 3, w: 20, h: 5 };
}

/** Whether (x, y) — 1-based terminal coords — falls inside the hit-zone. */
function inZone(x: number, y: number): boolean {
  const z = hitZone();
  return x >= z.x + 1 && x <= z.x + z.w && y >= z.y + 1 && y <= z.y + z.h;
}

/** Prepend a line to the rolling event log (newest first), capped. */
function pushLog(line: string): void {
  logLines.unshift(line);
  if (logLines.length > 12) logLines.pop();
}

const { profile: caps } = resolveCapabilities();

const host = createHost({
  caps,
  onInput: (event) => {
    handle(event);
    render();
  },
  onResize: (event: ResizeEvent) => {
    cols = event.columns;
    rows = event.rows;
    render();
  },
  onResume: () => render(),
});

/** Update state from one decoded input event; quit on `q` / Ctrl-C. */
function handle(event: InputEvent): void {
  switch (event.type) {
    case 'key': {
      const mods = [event.ctrl && 'ctrl', event.alt && 'alt', event.shift && 'shift'].filter(Boolean).join('+');
      const cp = event.codepoint != null ? ` U+${event.codepoint.toString(16).padStart(4, '0')}` : '';
      lastKey = `${mods ? mods + '+' : ''}${event.key}${cp}`;
      pushLog(`key   ${lastKey}`);
      if (event.key === 'q' || (event.ctrl && event.key === 'c')) quit();
      break;
    }
    case 'mouse': {
      mouseX = event.x;
      mouseY = event.y;
      lastMouse = `${event.kind} button=${event.button} @ (${event.x}, ${event.y})`;
      if (event.kind === 'down') {
        pushLog(`mouse ${lastMouse}`);
        if (inZone(event.x, event.y)) hits += 1;
      }
      break;
    }
    case 'wheel': {
      lastWheel = `${event.dir} @ (${event.x}, ${event.y})`;
      pushLog(`wheel ${lastWheel}`);
      break;
    }
    case 'paste': {
      const preview = event.text.replace(/\s+/g, ' ').slice(0, 32);
      lastPaste = `"${preview}"${event.truncated ? ' …(truncated)' : ''} (${event.text.length} chars)`;
      pushLog(`paste ${event.text.length} chars`);
      break;
    }
    case 'focus': {
      focused = event.focused;
      pushLog(`focus ${focused ? 'in' : 'out'}`);
      break;
    }
  }
}

/** Compose and paint one frame from the current state. */
function render(): void {
  const buf = new ScreenBuffer(cols, rows, { fg: DESKTOP.fg, bg: DESKTOP.bg, char: '·' });

  // Title bar.
  buf.fillRect(0, 0, cols, 1, ' ', { fg: 'black', bg: 'cyan' });
  buf.text(2, 0, '@jsvision/core — keyboard & mouse playground', { fg: 'black', bg: 'cyan' });

  // Readout panel.
  buf.box(2, 2, 44, 9, PANEL, 'single', ' events ');
  const row = (y: number, label: string, value: string): void => {
    buf.text(4, y, label.padEnd(8), LABEL);
    buf.text(12, y, value.slice(0, 32), VALUE);
  };
  row(4, 'key', lastKey);
  row(5, 'mouse', lastMouse);
  row(6, 'wheel', lastWheel);
  row(7, 'paste', lastPaste);
  row(8, 'focus', focused ? 'focused' : 'blurred');
  row(9, 'size', `${cols} × ${rows}`);

  // Clickable hit-zone (highlights when the mouse is over it).
  const z = hitZone();
  if (z.x > 46) {
    const hot = mouseX >= 0 && inZone(mouseX, mouseY);
    buf.box(z.x, z.y, z.w, z.h, hot ? ZONE_HOT : ZONE, 'double', ' click me ');
    buf.text(z.x + 2, z.y + 2, `hits: ${hits}`, hot ? ZONE_HOT : ZONE);
  }

  // Rolling event log.
  const logTop = 12;
  if (rows > logTop + 3) {
    buf.box(2, logTop, Math.min(60, cols - 4), rows - logTop - 2, PANEL, 'single', ' log (newest first) ');
    for (let i = 0; i < logLines.length && i < rows - logTop - 4; i += 1) {
      buf.text(4, logTop + 1 + i, logLines[i], i === 0 ? VALUE : HINT);
    }
  }

  // Live mouse marker (drawn last so it sits on top).
  if (mouseX >= 1 && mouseX <= cols && mouseY >= 2 && mouseY <= rows) {
    buf.set(mouseX - 1, mouseY - 1, '✛', MARKER);
  }

  // Footer.
  buf.fillRect(0, rows - 1, cols, 1, ' ', { fg: 'black', bg: 'cyan' });
  buf.text(2, rows - 1, 'move/click the mouse · type keys · scroll · paste   —   q or Ctrl-C to quit', {
    fg: 'black',
    bg: 'cyan',
  });

  host.render(buf);
}

/** Restore the terminal and exit cleanly. */
function quit(): void {
  void host.stop().then(() => process.exit(0));
}

await host.start();
render();
