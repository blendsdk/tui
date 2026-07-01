/**
 * Implementation tests — RD-11 `Dialog` internals & edges (03-05).
 *
 * Covers children-without-`valid()` treated valid, nested modal LIFO, the frame close-`[×]`-click AND
 * Esc both resolving `execView` to `cancel` (bypassing `valid()`, PF-002 — no hang), a disabled
 * terminating command ignored by the catch (PF-007), and the `dialog` frame showing the close box +
 * NO zoom box (PF-001). Real `View`/`EventLoop`. `.js` per NodeNext.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { KeyEvent, MouseEvent as CoreMouseEvent } from '@jsvision/core';
import { Group, createRenderRoot } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import { signal } from '../src/reactive/index.js';
import { Input, Text, range } from '../src/controls/index.js';
import { Commands } from '../src/status/index.js';
import { Dialog } from '../src/dialog/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function key(k: string): KeyEvent {
  return { type: 'key', key: k, ctrl: false, alt: false, shift: false };
}
function mouse(kind: 'down' | 'up', x: number, y: number): CoreMouseEvent {
  return { type: 'mouse', kind, button: 0, x, y };
}

/** Open `dialog` modally at rect (0,0,`w`×`h`) under a root; return the loop + execView promise. */
function openModal(dialog: Dialog, w = 24, h = 8) {
  dialog.layout = { position: 'absolute', padding: 1, rect: { x: 0, y: 0, width: w, height: h } };
  const root = new Group();
  root.add(dialog);
  const loop = createEventLoop({ width: 40, height: 15 }, { caps });
  loop.mount(root);
  const promise = loop.execView<string>(dialog);
  return { loop, promise };
}

// A child without valid() (a Text) is treated valid — OK resolves (TV firstThat over children).
test('children without valid() are treated valid ⇒ OK resolves', async () => {
  const dlg = new Dialog({ title: 'Info' });
  const text = new Text('Just a label');
  text.layout = { position: 'absolute', rect: { x: 1, y: 1, width: 12, height: 1 } };
  dlg.add(text);
  const { loop, promise } = openModal(dlg);
  loop.emitCommand(Commands.ok);
  await expect(promise).resolves.toBe(Commands.ok);
});

// The frame close-[×]-click resolves the modal to cancel (no hang) and bypasses valid().
test('PF-002: clicking the frame close box resolves execView to cancel, bypassing valid()', async () => {
  const value = signal('999'); // invalid, but cancel bypasses the gate
  const input = new Input({ value, validator: range(0, 100) });
  input.layout = { position: 'absolute', rect: { x: 1, y: 1, width: 12, height: 1 } };
  const dlg = new Dialog({ title: 'X' });
  dlg.add(input);
  const { loop, promise } = openModal(dlg);
  // Close box is at cols 2–4 of row 0 (1-based dispatch x=4,y=1 ⇒ local (3,0)).
  loop.dispatch(mouse('down', 4, 1));
  loop.dispatch(mouse('up', 4, 1));
  await expect(promise).resolves.toBe(Commands.cancel);
});

// Esc resolves the modal to cancel (no hang), bypassing valid().
test('PF-002: Esc resolves execView to cancel, bypassing valid()', async () => {
  const value = signal('999');
  const input = new Input({ value, validator: range(0, 100) });
  input.layout = { position: 'absolute', rect: { x: 1, y: 1, width: 12, height: 1 } };
  const dlg = new Dialog({ title: 'X' });
  dlg.add(input);
  const { loop, promise } = openModal(dlg);
  loop.focusView(input);
  loop.dispatch(key('escape'));
  await expect(promise).resolves.toBe(Commands.cancel);
});

// A disabled terminating command is ignored by the catch (PF-007) — the dialog does not end.
test('PF-007: a disabled OK command is ignored (dialog stays open)', async () => {
  const dlg = new Dialog({ title: 'X' });
  const text = new Text('body');
  text.layout = { position: 'absolute', rect: { x: 1, y: 1, width: 8, height: 1 } };
  dlg.add(text);
  const { loop, promise } = openModal(dlg);
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  loop.enableCommand(Commands.ok, false);
  loop.emitCommand(Commands.ok);
  await Promise.resolve();
  expect(settled).toBe(false);
  // Re-enabling + emitting resolves it (so the dialog wasn't broken, just gated).
  loop.enableCommand(Commands.ok, true);
  loop.emitCommand(Commands.ok);
  await expect(promise).resolves.toBe(Commands.ok);
});

// Nested modal LIFO: a second dialog opened over the first resolves first (Esc ⇒ cancel), then the first.
test('nested modal dialogs resolve LIFO', async () => {
  const a = new Dialog({ title: 'A' });
  a.add(textAt('a-body'));
  const { loop, promise: pa } = openModal(a);

  const b = new Dialog({ title: 'B' });
  b.add(textAt('b-body'));
  b.layout = { position: 'absolute', padding: 1, rect: { x: 2, y: 2, width: 20, height: 6 } };
  // The caller adds the nested modal to the tree before execView (the RD-04 contract).
  a.add(b);
  const pb = loop.execView<string>(b);

  let aSettled = false;
  void pa.then(() => {
    aSettled = true;
  });

  loop.dispatch(key('escape')); // top modal (B) cancels first
  await expect(pb).resolves.toBe(Commands.cancel);
  expect(aSettled).toBe(false);

  loop.dispatch(key('escape')); // now A cancels
  await expect(pa).resolves.toBe(Commands.cancel);
});

// The dialog frame shows the close box + NO zoom box (PF-001 / PA-6 gating).
test('PF-001: the dialog frame shows the close box and no zoom box', () => {
  const dlg = new Dialog({ title: 'Z' });
  dlg.layout = { position: 'absolute', padding: 1, rect: { x: 0, y: 0, width: 20, height: 6 } };
  const root = new Group();
  root.add(dlg);
  const rr = createRenderRoot({ width: 24, height: 8 }, { caps });
  rr.mount(root);
  const buf = rr.buffer();
  // Close box [×] at cols 2–4.
  expect(buf.get(2, 0)?.char).toBe('[');
  expect(buf.get(3, 0)?.char).toBe('×');
  expect(buf.get(4, 0)?.char).toBe(']');
  // No zoom box at cols w-5..w-3 (w=20 ⇒ cols 15–17): no '↑'/'↕' glyph.
  for (let x = 0; x < 20; x += 1) {
    const ch = buf.get(x, 0)?.char;
    expect(ch).not.toBe('↑');
    expect(ch).not.toBe('↕');
  }
});

/** A small absolute Text content child. */
function textAt(s: string): Text {
  const t = new Text(s);
  t.layout = { position: 'absolute', rect: { x: 1, y: 1, width: 8, height: 1 } };
  return t;
}
