/**
 * Specification tests (immutable oracles) — modality (execView/endModal, capture, save/restore, LIFO).
 *
 * Source: jsvision-ui RD-04 AC-12, AC-13, AC-14, AC-15 → ST-12, ST-13, ST-14, ST-15
 * (codeops/features/jsvision-ui/plans/event-loop/07-testing-strategy.md).
 * Real `View` subclasses + a real loop (no mocks). Synthetic events drive `dispatch()`; the modal
 * view is added to the tree by the caller (the RD-04 contract). Expectations derive from the ACs.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { KeyEvent, MouseEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext, DispatchEvent } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function keyEvent(key: string): KeyEvent {
  return { type: 'key', key, ctrl: false, alt: false, shift: false };
}
function mouseDown(x: number, y: number): MouseEvent {
  return { type: 'mouse', kind: 'down', button: 0, x, y };
}

/** A focusable leaf that counts the events it receives. */
class FocusLeaf extends View {
  events = 0;
  constructor() {
    super();
    this.focusable = true;
  }
  draw(_ctx: DrawContext): void {}
  override onEvent(_ev: DispatchEvent): void {
    this.events += 1;
  }
}

/** Build `root > [outer, dialog>[dialogLeaf]]` and focus `outer`. */
function modalScene(): {
  loop: ReturnType<typeof createEventLoop>;
  outer: FocusLeaf;
  dialog: Group;
  dialogLeaf: FocusLeaf;
  root: Group;
} {
  const outer = new FocusLeaf();
  const dialogLeaf = new FocusLeaf();
  const dialog = new Group();
  dialog.add(dialogLeaf);
  const root = new Group();
  root.add(outer);
  root.add(dialog);
  const loop = createEventLoop({ width: 30, height: 10 }, { caps });
  loop.mount(root);
  loop.focusView(outer);
  return { loop, outer, dialog, dialogLeaf, root };
}

// ST-12 / AC-12 — `await execView(dialog)` resolves with the value passed to `endModal`.
test('ST-12: execView resolves with the endModal result', async () => {
  const { loop, dialog } = modalScene();

  const promise = loop.execView<string>(dialog);
  loop.endModal('ok');

  await expect(promise).resolves.toBe('ok');
});

// ST-13 / AC-13 — while a modal is active, input dispatches ONLY within the modal subtree; the outer
// tree is inert; a click outside the modal is ignored.
test('ST-13: a modal captures input; the outer tree is inert', () => {
  const { loop, outer, dialog, dialogLeaf } = modalScene();
  void loop.execView<string>(dialog); // capture (focus moves into the dialog)

  const outerBefore = outer.events;
  loop.dispatch(keyEvent('x'));
  expect(dialogLeaf.events).toBeGreaterThanOrEqual(1); // delivered inside the modal
  expect(outer.events).toBe(outerBefore); // outer received nothing

  // A click outside the modal subtree is ignored (PA-6).
  outer.bounds = { x: 0, y: 0, width: 5, height: 5 };
  dialog.bounds = { x: 10, y: 0, width: 5, height: 5 };
  const outerBefore2 = outer.events;
  loop.dispatch(mouseDown(2, 2)); // 0-based (1,1) — over `outer`, outside the modal
  expect(outer.events).toBe(outerBefore2); // still inert
});

// ST-14 / AC-14 — the outer focused view is restored when the modal closes.
test('ST-14: closing a modal restores the outer focus', () => {
  const { loop, outer, dialog, dialogLeaf } = modalScene();
  expect(loop.getFocused()).toBe(outer);

  void loop.execView<string>(dialog);
  expect(loop.getFocused()).toBe(dialogLeaf); // focus moved into the dialog

  loop.endModal('done');
  expect(loop.getFocused()).toBe(outer); // restored to the outer focus (not reset)
});

// ST-15 / AC-15 — nested execView stacks; each endModal resolves the matching promise in LIFO order,
// restoring each saved focus.
test('ST-15: nested modals resolve LIFO with per-frame focus restore', async () => {
  const outer = new FocusLeaf();
  const leaf1 = new FocusLeaf();
  const d1 = new Group();
  d1.add(leaf1);
  const leaf2 = new FocusLeaf();
  const d2 = new Group();
  d2.add(leaf2);
  const root = new Group();
  root.add(outer);
  root.add(d1);
  root.add(d2);

  const loop = createEventLoop({ width: 30, height: 10 }, { caps });
  loop.mount(root);
  loop.focusView(outer);

  const p1 = loop.execView<string>(d1);
  expect(loop.getFocused()).toBe(leaf1);
  const p2 = loop.execView<string>(d2);
  expect(loop.getFocused()).toBe(leaf2);

  loop.endModal('r2'); // pop d2 → restore leaf1
  expect(loop.getFocused()).toBe(leaf1);
  loop.endModal('r1'); // pop d1 → restore outer
  expect(loop.getFocused()).toBe(outer);

  await expect(p2).resolves.toBe('r2');
  await expect(p1).resolves.toBe('r1');
});
