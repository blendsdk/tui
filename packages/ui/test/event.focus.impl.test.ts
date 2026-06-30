/**
 * Implementation tests — focus manager internals & edges.
 *
 * Covers: save/restore on group re-entry; descend-into-group focuses its first focusable child;
 * focusView on a non-focusable view is a no-op (leaving focus unchanged); focusNext with zero
 * focusable views is a no-op; a hidden ancestor blocks a focusable leaf in both focusView and
 * traversal. Real `View` subclasses + a real loop (no mocks).
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

/** A leaf; set `.focusable = true` per test. */
class Leaf extends View {
  draw(_ctx: DrawContext): void {}
}

function focusable(): Leaf {
  const leaf = new Leaf();
  leaf.focusable = true;
  return leaf;
}

// A group keeps its `current` when focus leaves; re-entering restores the saved child, not the first.
test('save/restore: re-entering a group restores its previously focused child', () => {
  const a1 = focusable();
  const a2 = focusable();
  const g1 = new Group();
  g1.add(a1);
  g1.add(a2);
  const sib = focusable();
  const root = new Group();
  root.add(g1);
  root.add(sib);

  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);

  loop.focusNext(); // root → descend into g1 → a1
  loop.focusNext(); // within g1 → a2 (g1.current is now a2)
  expect(loop.getFocused()).toBe(a2);

  loop.focusView(sib); // leave g1; g1.current stays a2 (saved)
  expect(loop.getFocused()).toBe(sib);

  loop.focusNext(); // root level: sib → wrap → g1 → restore the saved a2
  expect(loop.getFocused()).toBe(a2);
});

// Descending into a group with no saved current focuses its FIRST focusable child (skipping
// non-focusable ones).
test('descend into a group focuses its first focusable child', () => {
  const x1 = new Leaf(); // not focusable
  const x2 = focusable();
  const x3 = focusable();
  const g = new Group();
  g.add(x1);
  g.add(x2);
  g.add(x3);
  const root = new Group();
  root.add(g);

  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);

  loop.focusNext(); // root → descend into g → first focusable (x2, x1 skipped)
  expect(loop.getFocused()).toBe(x2);
});

// focusView on a non-focusable view is a no-op: existing focus is left unchanged.
test('focusView on a non-focusable view leaves focus unchanged', () => {
  const a = focusable();
  const decorative = new Leaf(); // not focusable
  const root = new Group();
  root.add(a);
  root.add(decorative);

  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);

  loop.focusView(a);
  expect(loop.getFocused()).toBe(a);

  loop.focusView(decorative); // no-op (PA-5)
  expect(loop.getFocused()).toBe(a);
});

// focusNext / focusPrev with zero focusable views anywhere is a no-op.
test('focusNext with zero focusable views is a no-op', () => {
  const root = new Group();
  root.add(new Leaf()); // not focusable
  root.add(new Leaf());

  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);

  loop.focusNext();
  expect(loop.getFocused()).toBeNull();
  loop.focusPrev();
  expect(loop.getFocused()).toBeNull();
});

// A hidden ancestor blocks a focusable leaf in both focusView and traversal (subtree semantics).
test('a hidden ancestor blocks a focusable leaf', () => {
  const leaf = focusable();
  const parent = new Group();
  parent.add(leaf);
  parent.state.visible = false; // hidden ancestor
  const root = new Group();
  root.add(parent);

  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);

  loop.focusView(leaf);
  expect(loop.getFocused()).toBeNull(); // blocked

  loop.focusNext();
  expect(loop.getFocused()).toBeNull(); // also skipped in traversal
});
