/**
 * Implementation tests — modality internals & edges.
 *
 * Covers: endModal empty-stack no-op; the Phase-2 bubble + sweeps clamped to the modal scope (an
 * outer ancestor never receives captured input, PA-12); savedFocus no-longer-focusable on close
 * (restore skipped, no throw); execView paints exactly one frame on open (flush-spy == 1) — even a
 * modal with no focusable child (PF-009). Real `View` subclasses + a real loop (no mocks).
 */
import { test, expect, vi } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { KeyEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext, DispatchEvent } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import type { EventLoop } from '../src/event/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function keyEvent(key: string): KeyEvent {
  return { type: 'key', key, ctrl: false, alt: false, shift: false };
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

/** A Group that counts the events it receives (to assert it stays inert under a modal). */
class CountGroup extends Group {
  events = 0;
  override onEvent(_ev: DispatchEvent): void {
    this.events += 1;
  }
}

/** A non-focusable leaf (for the no-focusable-modal case). */
class InertLeaf extends View {
  draw(_ctx: DrawContext): void {}
}

// endModal with no active modal is a no-op (no throw, focus unchanged).
test('endModal on an empty stack is a no-op', () => {
  const leaf = new FocusLeaf();
  const root = new Group();
  root.add(leaf);
  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);
  loop.focusView(leaf);

  expect(() => loop.endModal('x')).not.toThrow();
  expect(loop.getFocused()).toBe(leaf); // unchanged
});

// While a modal is active, the Phase-2 bubble + sweeps are clamped to the modal scope: neither an
// outer ancestor (the root group) nor an outer sibling receives the captured key (PA-12, AR-53).
test('a modal clamps dispatch to its scope — outer ancestor + sibling stay inert', () => {
  const outer = new FocusLeaf();
  const dialogLeaf = new FocusLeaf();
  const dialog = new Group();
  dialog.add(dialogLeaf);
  const root = new CountGroup(); // an outer ancestor that would catch a bubble if not clamped
  root.add(outer);
  root.add(dialog);

  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);
  loop.focusView(outer);

  void loop.execView<string>(dialog); // capture
  const rootBefore = root.events;
  const outerBefore = outer.events;
  loop.dispatch(keyEvent('x'));

  expect(dialogLeaf.events).toBeGreaterThanOrEqual(1); // delivered inside the modal
  expect(root.events).toBe(rootBefore); // ancestor never reached (bubble clamped at scope, PA-12)
  expect(outer.events).toBe(outerBefore); // outer sibling inert
});

// If the saved outer focus is no longer focusable on close, the restore is skipped (no throw).
test('endModal skips restore when the saved focus is no longer focusable', () => {
  const outer = new FocusLeaf();
  const dialogLeaf = new FocusLeaf();
  const dialog = new Group();
  dialog.add(dialogLeaf);
  const root = new Group();
  root.add(outer);
  root.add(dialog);

  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);
  loop.focusView(outer);
  void loop.execView<string>(dialog);
  expect(loop.getFocused()).toBe(dialogLeaf);

  outer.focusable = false; // the saved focus is no longer eligible

  expect(() => loop.endModal('done')).not.toThrow();
  expect(loop.getFocused()).not.toBe(outer); // restore skipped (focus left where the modal had it)
});

// execView paints exactly ONE coalesced frame on open (read from the flush spy, not serialize()).
test('execView paints exactly one frame on open', () => {
  const dialogLeaf = new FocusLeaf();
  const dialog = new Group();
  dialog.add(dialogLeaf);
  const root = new Group();
  root.add(dialog);
  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);

  const flushSpy = vi.spyOn(loop.renderRoot, 'flush');
  void loop.execView<string>(dialog);
  expect(flushSpy).toHaveBeenCalledTimes(1);
});

// PF-009 — even a modal with NO focusable child paints exactly one frame on open (the empty-queue
// tick still flushes; it does not lean on serialize()'s force-flush).
test('execView paints one frame even when the modal has no focusable child (PF-009)', () => {
  const inert = new InertLeaf(); // a non-focusable leaf
  const dialog = new Group();
  dialog.add(inert);
  const root = new Group();
  root.add(dialog);
  const loop: EventLoop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);

  const flushSpy = vi.spyOn(loop.renderRoot, 'flush');
  void loop.execView<string>(dialog);
  expect(flushSpy).toHaveBeenCalledTimes(1);
  expect(loop.getFocused()).toBeNull(); // nothing focusable to focus into
});
