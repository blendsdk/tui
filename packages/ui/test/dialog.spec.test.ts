/**
 * Specification tests (immutable oracles) — RD-11 `Dialog` + standard buttons (03-05).
 *
 * Source: jsvision-ui/RD-11 AC-8/AC-9/AC-10/AC-11 → ST-09/ST-10/ST-11/ST-12 (containers-scrolling-lists/
 * 07-testing-strategy.md). TV source: `TDialog` (`tdialog.cpp:25` is-a TWindow, `:95` `valid` =
 * cmCancel-bypass else `TGroup::valid` child sweep, `:57-89` Esc/close ⇒ cmCancel, endModal on
 * ok/cancel/yes/no while modal) + `TGroup::valid` (`tgroup.cpp:566`) + `cmOK=10…cmNo=13` (`views.h:44`).
 * Realizes DEF-16. Expectations derive from the decode + the ACs, NEVER from the implementation.
 * `.js` per NodeNext.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, defaultTheme } from '@jsvision/core';
import type { KeyEvent, MouseEvent as CoreMouseEvent } from '@jsvision/core';
import { Group, createRenderRoot } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import { signal } from '../src/reactive/index.js';
import { Input, range } from '../src/controls/index.js';
import { Commands } from '../src/status/index.js';
import { Dialog, okButton, cancelButton, yesButton, noButton } from '../src/dialog/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function key(k: string): KeyEvent {
  return { type: 'key', key: k, ctrl: false, alt: false, shift: false };
}
function mouse(kind: 'down' | 'up', x: number, y: number): CoreMouseEvent {
  return { type: 'mouse', kind, button: 0, x, y };
}

/** Mount a dialog under a root, open it modally, and return the loop + the execView promise. */
function openModal(dialog: Dialog, w = 40, h = 15) {
  dialog.layout = { position: 'absolute', padding: 1, rect: { x: 0, y: 0, width: 24, height: 8 } };
  const root = new Group();
  root.add(dialog);
  const loop = createEventLoop({ width: w, height: h }, { caps });
  loop.mount(root);
  const promise = loop.execView<string>(dialog);
  return { loop, promise };
}

// ST-09 / AC-8 — execView(dialog) resolves the terminating command; the hosted Input's signal holds data.
test('ST-09: execView resolves the terminating command; hosted Input holds the typed data', async () => {
  const value = signal('');
  const input = new Input({ value });
  input.layout = { position: 'absolute', rect: { x: 1, y: 1, width: 12, height: 1 } };
  const dlg = new Dialog({ title: 'Name' });
  dlg.add(input);
  const { loop, promise } = openModal(dlg);

  loop.focusView(input);
  loop.dispatch(key('h'));
  loop.dispatch(key('i'));
  expect(value()).toBe('hi');

  loop.emitCommand(Commands.ok);
  await expect(promise).resolves.toBe(Commands.ok);
  expect(value()).toBe('hi');
});

// ST-10 / AC-9 (DEF-16) — an out-of-range Input vetoes OK (dialog stays open, focus → the Input);
// correcting it lets OK resolve; Cancel/Esc resolve regardless of validity.
test('ST-10: valid() gate vetoes OK on an invalid Input, then passes; Cancel bypasses', async () => {
  const value = signal('150'); // out of range(0,100)
  const input = new Input({ value, validator: range(0, 100) });
  input.layout = { position: 'absolute', rect: { x: 1, y: 1, width: 12, height: 1 } };
  const dlg = new Dialog({ title: 'Age' });
  dlg.add(input);
  const { loop, promise } = openModal(dlg);

  let settled = false;
  void promise.then(() => {
    settled = true;
  });

  // OK with '150' ⇒ vetoed: not settled, focus moved to the Input.
  loop.emitCommand(Commands.ok);
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(loop.getFocused()).toBe(input);

  // Correct to '50' ⇒ OK resolves ok.
  value.set('50');
  loop.emitCommand(Commands.ok);
  await expect(promise).resolves.toBe(Commands.ok);
});

test('ST-10: Cancel resolves cancel regardless of an invalid hosted Input', async () => {
  const value = signal('999');
  const input = new Input({ value, validator: range(0, 100) });
  input.layout = { position: 'absolute', rect: { x: 1, y: 1, width: 12, height: 1 } };
  const dlg = new Dialog({ title: 'Age' });
  dlg.add(input);
  const { loop, promise } = openModal(dlg);
  loop.emitCommand(Commands.cancel);
  await expect(promise).resolves.toBe(Commands.cancel);
});

// ST-11 / AC-10 — a Dialog added to the tree (modeless, no execView) is an ordinary window: it renders
// its frame and is not blocking (no modal host attached ⇒ terminating commands don't end anything).
test('ST-11: a modeless Dialog is an ordinary non-blocking window', () => {
  const dlg = new Dialog({ title: 'Modeless' });
  dlg.layout = { position: 'absolute', padding: 1, rect: { x: 0, y: 0, width: 20, height: 6 } };
  const root = new Group();
  root.add(dlg);
  const rr = createRenderRoot({ width: 30, height: 10 }, { caps });
  rr.mount(root);
  // The dialog frame renders (title-bar row 0 is the gray-dialog border, white-on-lightGray).
  const buf = rr.buffer();
  expect(buf.get(0, 0)?.char).toBe('╔'); // active double-line border (modal-or-not, active when unmanaged)
  expect(buf.get(0, 0)?.fg).toBe(defaultTheme.dialog.border); // white
});

// ST-12 / AC-11 — the standard buttons render TV faces and emit the matching commands; Commands has them.
test('ST-12: standard buttons render + emit ok/cancel/yes/no', () => {
  expect(Commands.ok).toBe('ok');
  expect(Commands.cancel).toBe('cancel');
  expect(Commands.yes).toBe('yes');
  expect(Commands.no).toBe('no');

  const ok = okButton();
  ok.layout = { position: 'absolute', rect: { x: 0, y: 0, width: 8, height: 2 } };
  const root = new Group();
  root.add(ok);
  const rr = createRenderRoot({ width: 10, height: 2 }, { caps });
  rr.mount(root);
  // The TV button face draws the label (no brackets on a colour palette; RD-06 fidelity).
  const row = [0, 1, 2, 3, 4, 5, 6, 7].map((x) => rr.buffer().get(x, 0)?.char).join('');
  expect(row).toContain('OK');

  // Each helper carries its command.
  for (const [btn, cmd] of [
    [okButton(), Commands.ok],
    [cancelButton(), Commands.cancel],
    [yesButton(), Commands.yes],
    [noButton(), Commands.no],
  ] as const) {
    const spy: string[] = [];
    const g = new Group();
    g.add(btn);
    const loop = createEventLoop({ width: 12, height: 3 }, { caps });
    // A post-process sink records emitted commands.
    const sink = new (class extends Group {
      override postProcess = true;
      override onEvent(ev: import('../src/view/index.js').DispatchEvent): void {
        if (ev.event.type === 'command') spy.push(ev.event.command);
      }
    })();
    g.add(sink);
    loop.mount(g);
    loop.focusView(btn);
    loop.dispatch(key('space')); // activate the focused button
    expect(spy).toContain(cmd);
  }
});
