/**
 * Manual resize verification demo (RD-09 DEF-3).
 *
 * Run in a REAL terminal — works on Linux, macOS, and Windows:
 *
 *   npx tsx examples/resize-demo/main.ts
 *
 * Drag the window edge to resize: the reported size and the resize counter update
 * live, proving the real OS resize notification (SIGWINCH on POSIX, the stdout
 * `'resize'` event on Windows) reaches the host's `onResize`. Press `q` or Ctrl-C
 * to quit — the terminal is restored on every exit path.
 *
 * Dev-only example — not part of the published package. The `.js` import specifier
 * is required by NodeNext ESM resolution (it resolves to the `.ts` source via tsx).
 */
import { createHost, resolveCapabilities, ScreenBuffer } from '@jsvision/core';
import type { InputEvent, ResizeEvent, Style } from '@jsvision/core';

const caps = resolveCapabilities().profile;
const border: Style = { fg: 'brightWhite', bg: 'blue' };
const label: Style = { fg: 'brightYellow', bg: 'blue' };

let resizeCount = 0;

/** Repaint the whole screen at the given size, showing the live resize counter. */
function draw(columns: number, rows: number): void {
  const w = Math.max(1, columns);
  const h = Math.max(1, rows);
  const buf = new ScreenBuffer(w, h, { fg: 'default', bg: 'default' });
  if (w >= 2 && h >= 2) buf.box(0, 0, w, h, border, 'single', 'resize demo');
  const lines = [
    `Terminal size: ${w} x ${h}`,
    `Resize events seen: ${resizeCount}`,
    '',
    'Drag the window edge — the size above should update live.',
    'Press q or Ctrl-C to quit (the terminal will be restored).',
  ];
  for (let i = 0; i < lines.length; i += 1) {
    const y = i + 2;
    if (y < h - 1) buf.text(2, y, lines[i].slice(0, Math.max(0, w - 4)), label);
  }
  host.render(buf);
}

/** Restore the terminal and exit cleanly. */
function quit(): void {
  void host.stop().then(() => process.exit(0));
}

const host = createHost({
  caps,
  input: process.stdin,
  output: process.stdout,
  onInput: (event: InputEvent): void => {
    if (event.type === 'key' && (event.key === 'q' || (event.key === 'c' && event.ctrl))) quit();
  },
  onResize: (event: ResizeEvent): void => {
    resizeCount += 1;
    draw(event.columns, event.rows);
  },
});

if (!process.stdout.isTTY) {
  process.stderr.write('resize-demo: needs a real interactive terminal (TTY). Run it directly, not piped.\n');
  process.exit(1);
}

await host.start();
draw(process.stdout.columns ?? 80, process.stdout.rows ?? 24);
