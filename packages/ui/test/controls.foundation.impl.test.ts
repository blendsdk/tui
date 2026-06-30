/**
 * Implementation tests — RD-06 foundation edge cases (03-01 §A / §A2; PF-009).
 *
 * Covers the optional-chain safety of the additive `ev.emit`/`ev.focusView` accessors on a bare
 * unit-constructed envelope, and the lazy per-view focus-change signal: it ticks an observing effect
 * when the focus manager flips the view's focus, and stays `undefined` (zero cost) when unobserved.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { KeyEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import type { DispatchEvent } from '../src/event/index.js';
import { createRoot, effect } from '../src/reactive/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function keyEvent(key: string): KeyEvent {
  return { type: 'key', key, ctrl: false, alt: false, shift: false };
}

/** A minimal focusable leaf for focus-signal observation. */
class Leaf extends View {
  override focusable = true;
  draw(_ctx: DrawContext): void {}
}

/** A control whose `onEvent` always calls the additive accessors (to prove optional-chain safety). */
class AccessorLeaf extends View {
  draw(_ctx: DrawContext): void {}
  override onEvent(ev: DispatchEvent): void {
    ev.emit?.('ok');
    ev.focusView?.(this);
  }
}

test('ev.emit / ev.focusView are undefined on a bare envelope and optional-chain safe', () => {
  const leaf = new AccessorLeaf();
  const bare: DispatchEvent = { event: keyEvent('x'), handled: false };
  expect(bare.emit).toBeUndefined();
  expect(bare.focusView).toBeUndefined();
  // A control that calls both accessors on the bare envelope must not throw (they no-op).
  expect(() => leaf.onEvent(bare)).not.toThrow();
});

test('focusSignal() ticks an observing effect when the focus manager flips the view focus (PF-009)', () => {
  const a = new Leaf();
  const b = new Leaf();
  const root = new Group();
  root.add(a);
  root.add(b);
  const loop = createEventLoop({ width: 80, height: 24 }, { caps });
  loop.mount(root);
  loop.focusView(a);

  let ticks = 0;
  let dispose = (): void => undefined;
  createRoot((d) => {
    dispose = d;
    effect(() => {
      a.focusSignal()(); // subscribe to A's focus changes
      ticks += 1;
    });
  });
  expect(ticks).toBe(1); // the effect ran once on creation

  loop.focusView(b); // flips A's focus false → pokes A.focusTick → the effect re-runs
  expect(ticks).toBe(2);

  loop.focusView(a); // flips A's focus true again → another tick
  expect(ticks).toBe(3);
  dispose();
});

test('an unobserved view keeps focusTick === undefined across focus flips (zero cost)', () => {
  const leaf = new Leaf();
  const root = new Group();
  root.add(leaf);
  const loop = createEventLoop({ width: 80, height: 24 }, { caps });
  loop.mount(root);

  expect(leaf.focusTick).toBeUndefined();
  loop.focusView(leaf); // the manager's `focusTick?.set()` poke is a no-op when nobody observes
  expect(leaf.focusTick).toBeUndefined();
});
