/**
 * Specification tests (immutable oracles) — focus manager (current chain, traversal, predicate).
 *
 * Source: jsvision-ui RD-04 AC-3, AC-4, AC-5, AC-6 → ST-03, ST-04, ST-05, ST-06
 * (codeops/features/jsvision-ui/plans/event-loop/07-testing-strategy.md).
 * Real `View` subclasses + a real loop-built `RenderRoot` (no mocks). Focus is driven through the
 * PUBLIC loop surface (`focusView`/`focusNext`/`focusPrev`/`getFocused` + dispatched Tab keys).
 * Expectations derive from the acceptance criteria, never the implementation.
 */
import { test, expect, vi } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { KeyEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext, DispatchEvent } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function keyEvent(key: string, mods: Partial<Pick<KeyEvent, 'ctrl' | 'alt' | 'shift'>> = {}): KeyEvent {
  return { type: 'key', key, ctrl: false, alt: false, shift: false, ...mods };
}

/** A focusable leaf (set `.focusable = true` per test). */
class Leaf extends View {
  draw(_ctx: DrawContext): void {}
}

/** A leaf that counts its draw() calls and records key events it receives. */
class CountLeaf extends View {
  draws = 0;
  keys = 0;
  draw(ctx: DrawContext): void {
    this.draws += 1;
    ctx.fill(' ');
  }
  override onEvent(ev: DispatchEvent): void {
    if (ev.event.type === 'key') this.keys += 1;
  }
}

// ST-03 / AC-3 — focusView sets `current` at every ancestor (root→…→leaf), getFocused()===leaf, and
// exactly that leaf's `focused` flag is true.
test('ST-03: focusView sets the full current chain and exactly one focused view', () => {
  const leaf = new Leaf();
  leaf.focusable = true;
  const mid = new Group();
  mid.add(leaf);
  const other = new Leaf();
  other.focusable = true;
  const root = new Group();
  root.add(mid);
  root.add(other);

  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);

  loop.focusView(leaf);

  expect(loop.getFocused()).toBe(leaf);
  expect(root.current).toBe(mid);
  expect(mid.current).toBe(leaf);
  expect(leaf.state.focused).toBe(true);
  expect(other.state.focused).toBe(false);
});

// ST-04 / AC-4 — focusNext/focusPrev advance/retreat across focusable siblings, wrapping at the ends
// and skipping non-focusable ones.
test('ST-04: focusNext/focusPrev wrap and skip non-focusable siblings', () => {
  const a = new Leaf();
  a.focusable = true;
  const b = new Leaf(); // not focusable — skipped
  const c = new Leaf();
  c.focusable = true;
  const root = new Group();
  root.add(a);
  root.add(b);
  root.add(c);

  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);

  loop.focusNext();
  expect(loop.getFocused()).toBe(a); // first focusable
  loop.focusNext();
  expect(loop.getFocused()).toBe(c); // b skipped
  loop.focusNext();
  expect(loop.getFocused()).toBe(a); // wrap at end
  loop.focusPrev();
  expect(loop.getFocused()).toBe(c); // wrap back at start
});

// ST-04 / AC-4 (PA-10) — a dispatched unbound Tab key moves focus like focusNext, Shift-Tab like
// focusPrev, and the raw key is NOT also delivered to a key handler.
test('ST-04: built-in Tab / Shift-Tab move focus and are consumed (not plain-dispatched)', () => {
  const a = new CountLeaf();
  a.focusable = true;
  const c = new CountLeaf();
  c.focusable = true;
  const root = new Group();
  root.add(a);
  root.add(c);

  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);
  loop.focusView(a);

  loop.dispatch(keyEvent('tab'));
  expect(loop.getFocused()).toBe(c); // Tab advanced focus
  loop.dispatch(keyEvent('tab', { shift: true }));
  expect(loop.getFocused()).toBe(a); // Shift-Tab retreated focus

  expect(a.keys).toBe(0); // the Tab keys were consumed, never delivered as plain keys
  expect(c.keys).toBe(0);
});

// ST-05 / AC-5 — focus eligibility is `visible && !disabled && focusable` AND no !visible/disabled
// ancestor; toggling any factor flips eligibility (observed via focusView being a no-op).
test('ST-05: focus eligibility honours visible, disabled, focusable, and ancestors', () => {
  function freshLeaf(): { loop: ReturnType<typeof createEventLoop>; leaf: Leaf; parent: Group } {
    const leaf = new Leaf();
    const parent = new Group();
    parent.add(leaf);
    const root = new Group();
    root.add(parent);
    const loop = createEventLoop({ width: 20, height: 6 }, { caps });
    loop.mount(root);
    return { loop, leaf, parent };
  }

  // focusable=false (default) → no-op
  {
    const { loop, leaf } = freshLeaf();
    loop.focusView(leaf);
    expect(loop.getFocused()).toBeNull();
    leaf.focusable = true;
    loop.focusView(leaf);
    expect(loop.getFocused()).toBe(leaf); // now eligible
  }
  // visible=false → no-op
  {
    const { loop, leaf } = freshLeaf();
    leaf.focusable = true;
    leaf.state.visible = false;
    loop.focusView(leaf);
    expect(loop.getFocused()).toBeNull();
  }
  // disabled=true → no-op
  {
    const { loop, leaf } = freshLeaf();
    leaf.focusable = true;
    leaf.state.disabled = true;
    loop.focusView(leaf);
    expect(loop.getFocused()).toBeNull();
  }
  // a disabled ancestor makes the leaf ineligible (subtree semantics)
  {
    const { loop, leaf, parent } = freshLeaf();
    leaf.focusable = true;
    parent.state.disabled = true;
    loop.focusView(leaf);
    expect(loop.getFocused()).toBeNull();
  }
});

// ST-05 / AC-5 — a Group is focusable iff it has a focusable descendant: traversal descends into a
// container with a focusable child and skips one without.
test('ST-05: a Group is a focus target iff it has a focusable descendant', () => {
  const inner = new Leaf();
  inner.focusable = true;
  const full = new Group();
  full.add(inner);
  const empty = new Group();
  empty.add(new Leaf()); // child not focusable → empty container
  const root = new Group();
  root.add(full);
  root.add(empty);

  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);

  loop.focusNext();
  expect(loop.getFocused()).toBe(inner); // descended into the focusable container
  loop.focusNext();
  expect(loop.getFocused()).toBe(inner); // the empty container is not a target → stays
});

// ST-06 / AC-6 — moving focus invalidates exactly the old + new focused views (and no bystander),
// coalescing into exactly one flush.
test('ST-06: a focus flip repaints exactly old + new in one frame', () => {
  const a = new CountLeaf();
  a.focusable = true;
  const b = new CountLeaf();
  b.focusable = true;
  const bystander = new CountLeaf();
  bystander.focusable = true;
  const root = new Group();
  root.add(a);
  root.add(b);
  root.add(bystander);

  const loop = createEventLoop({ width: 20, height: 6 }, { caps });
  loop.mount(root);
  loop.focusView(a); // initial focus on a

  a.draws = 0;
  b.draws = 0;
  bystander.draws = 0;
  const flushSpy = vi.spyOn(loop.renderRoot, 'flush');

  loop.focusView(b);

  expect(flushSpy).toHaveBeenCalledTimes(1); // one coalesced frame
  expect(a.draws).toBe(1); // old focus repainted
  expect(b.draws).toBe(1); // new focus repainted
  expect(bystander.draws).toBe(0); // untouched
});
