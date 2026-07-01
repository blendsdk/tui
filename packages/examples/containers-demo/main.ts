/**
 * Containers/scrolling/lists walkthrough (RD-11) — a narrated, headless console demo of `@jsvision/ui`'s
 * container tier: a `ScrollBar` stepped by mouse, a `Scroller` revealing lower content by keyboard, a
 * `ListView` navigated by ↑↓ + type-ahead + select, and a modal `Dialog` whose `valid()` gate vetoes
 * OK on an out-of-range field, then resolves once corrected. All driven by synthetic `dispatch()` /
 * `emitCommand()` (no TTY), printing a composed ASCII frame after each step.
 *
 * Run it:
 *
 *   yarn workspace @jsvision/examples demo:containers
 *
 * Dev-only example — not part of the published package. Imported by name (`@jsvision/ui`), exactly as
 * a consumer would. `.js` per NodeNext.
 */
import { resolveCapabilities } from '@jsvision/core';
import type { KeyEvent, MouseEvent as CoreMouseEvent } from '@jsvision/core';
import {
  Group,
  Text,
  ScrollBar,
  Scroller,
  ListBox,
  Dialog,
  Input,
  Label,
  okButton,
  cancelButton,
  createEventLoop,
  signal,
  range,
  Commands,
} from '@jsvision/ui';

/** A synthetic decoded key (no terminal needed). */
function key(name: string): KeyEvent {
  return { type: 'key', key: name, ctrl: false, alt: false, shift: false };
}
/** A synthetic mouse click (1-based screen coords, as the decoder emits). */
function mouse(kind: 'down' | 'up', x: number, y: number): CoreMouseEvent {
  return { type: 'mouse', kind, button: 0, x, y };
}

/** Print a render root's composed buffer as an ASCII grid framed by a ruler. */
function printFrame(title: string, rows: readonly { char: string }[][]): void {
  const width = rows[0]?.length ?? 0;
  console.log(`\n${title}`);
  console.log(`+${'-'.repeat(width)}+`);
  for (const row of rows) console.log(`|${row.map((cell) => cell.char).join('')}|`);
  console.log(`+${'-'.repeat(width)}+`);
}

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

/** Step 1 — a vertical `ScrollBar` stepped by clicking its ▼ arrow + the page track. */
function stepScrollBar(): void {
  const pos = signal(0);
  const bar = new ScrollBar({ value: pos, min: 0, max: 100, orientation: 'vertical', pageStep: 10 });
  bar.layout = { position: 'absolute', rect: { x: 0, y: 0, width: 1, height: 8 } };
  const root = new Group();
  root.add(bar);
  const loop = createEventLoop({ width: 1, height: 8 }, { caps });
  loop.mount(root);
  printFrame('Frame 1a — ScrollBar at 0 (▲ track ▼)', loop.renderRoot.buffer().rows());

  // Click the ▼ arrow (bottom cell, 1-based y=8) three times → +3.
  for (let i = 0; i < 3; i += 1) {
    loop.dispatch(mouse('down', 1, 8));
    loop.dispatch(mouse('up', 1, 8));
  }
  // Click the page track just above the ▼ arrow → +pageStep (10).
  loop.dispatch(mouse('down', 1, 7));
  loop.dispatch(mouse('up', 1, 7));
  printFrame('Frame 1b — after 3× ▼ arrow + one page click', loop.renderRoot.buffer().rows());
  console.log(`  ScrollBar value: ${pos()} (arrow ±1, page ±10)`);
}

/** Step 2 — a `Scroller` over oversized content, scrolled down by keyboard. */
function stepScroller(): void {
  const content = new Group();
  for (let i = 0; i < 20; i += 1) {
    const line = new Text(`Line ${String(i + 1).padStart(2, '0')} of oversized content`);
    line.layout = { position: 'absolute', rect: { x: 0, y: i, width: 30, height: 1 } };
    content.add(line);
  }
  const scroller = new Scroller({ content, extent: { width: 30, height: 20 }, scrollbars: 'vertical' });
  scroller.layout = { position: 'absolute', rect: { x: 0, y: 0, width: 24, height: 8 } };
  const root = new Group();
  root.add(scroller);
  const loop = createEventLoop({ width: 24, height: 8 }, { caps });
  loop.mount(root);
  loop.focusView(scroller);
  printFrame('Frame 2a — Scroller at top (Line 01 …)', loop.renderRoot.buffer().rows());

  loop.dispatch(key('pagedown'));
  loop.dispatch(key('down'));
  printFrame('Frame 2b — PgDn + ↓ reveals lower lines', loop.renderRoot.buffer().rows());
}

/** Step 3 — a `ListBox` navigated by ↑↓ then jumped by type-ahead + selected. */
function stepListView(): void {
  const items = signal([
    'Apple',
    'Apricot',
    'Banana',
    'Grape',
    'Grapefruit',
    'Kiwi',
    'Mango',
    'Orange',
    'Pear',
    'Plum',
  ]);
  const focused = signal(0);
  const selected = signal(-1);
  const list = new ListBox({ items, focused, selected, typeAhead: true });
  list.layout = { position: 'absolute', rect: { x: 0, y: 0, width: 20, height: 8 } };
  const root = new Group();
  root.add(list);
  const loop = createEventLoop({ width: 20, height: 8 }, { caps });
  loop.mount(root);
  loop.focusView(list.rows);
  printFrame('Frame 3a — ListBox, focus on Apple', loop.renderRoot.buffer().rows());

  loop.dispatch(key('down'));
  loop.dispatch(key('down'));
  printFrame('Frame 3b — ↓↓ moves focus to Banana', loop.renderRoot.buffer().rows());
  console.log(`  focused index: ${focused()} = ${items()[focused()]}`);

  // Type-ahead: "gr" jumps to Grape.
  loop.dispatch(key('g'));
  loop.dispatch(key('r'));
  printFrame('Frame 3c — type "gr" jumps to Grape (type-ahead)', loop.renderRoot.buffer().rows());
  console.log(`  type-ahead landed on: ${items()[focused()]}`);

  loop.dispatch(key('enter'));
  console.log(`  Enter selected index: ${selected()} = ${items()[selected()]}`);
}

/** Step 4 — a modal `Dialog` whose `valid()` gate vetoes OK on an out-of-range Age, then resolves. */
async function stepDialog(): Promise<void> {
  const age = signal('200'); // out of range(0,120)
  const dlg = new Dialog({ title: ' Person ' });
  dlg.layout = { position: 'absolute', padding: 1, rect: { x: 0, y: 0, width: 34, height: 9 } };
  const ageInput = new Input({ value: age, validator: range(0, 120) });
  const label = new Label('~A~ge (0–120)', ageInput);
  label.layout = { position: 'absolute', rect: { x: 1, y: 1, width: 14, height: 1 } };
  ageInput.layout = { position: 'absolute', rect: { x: 16, y: 1, width: 14, height: 1 } };
  const ok = okButton();
  ok.layout = { position: 'absolute', rect: { x: 6, y: 4, width: 10, height: 2 } };
  const cancel = cancelButton();
  cancel.layout = { position: 'absolute', rect: { x: 18, y: 4, width: 12, height: 2 } };
  dlg.add(label);
  dlg.add(ageInput);
  dlg.add(ok);
  dlg.add(cancel);

  const root = new Group();
  root.add(dlg);
  const loop = createEventLoop({ width: 40, height: 12 }, { caps });
  loop.mount(root);
  const result = loop.execView<string>(dlg);

  let settled = false;
  void result.then(() => (settled = true));

  printFrame('Frame 4a — modal Dialog, Age="200" (invalid)', loop.renderRoot.buffer().rows());

  // OK with an out-of-range Age ⇒ vetoed by valid(); the dialog stays open.
  loop.emitCommand(Commands.ok);
  await Promise.resolve();
  console.log(`  OK with Age="200" → settled? ${settled} (vetoed by valid(); focus → Age)`);

  // Correct the Age, then OK resolves. A direct signal write outside a dispatch tick marks the
  // Input dirty but the loop only flushes inside a tick, so force one recompose for the frame.
  age.set('42');
  loop.renderRoot.flush();
  printFrame('Frame 4b — Age corrected to "42"', loop.renderRoot.buffer().rows());
  loop.emitCommand(Commands.ok);
  const cmd = await result;
  console.log(`  OK with Age="42" → resolved: ${cmd} (age = "${age()}")`);
}

/** Run the walkthrough. */
async function main(): Promise<void> {
  stepScrollBar();
  stepScroller();
  stepListView();
  await stepDialog();
  console.log('\nDone — a ScrollBar, a Scroller, a ListView (type-ahead + select), and a modal Dialog valid()-gate.');
}

void main();
