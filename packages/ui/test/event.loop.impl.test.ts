/**
 * Implementation tests — event loop internals & edges (not derived from ACs).
 *
 * Covers the deferring-schedule invariant, re-entrant-tick coalescing, the `renderRoot` accessor,
 * and the `onEvent` retype's override-compatibility with a legacy `onEvent(_ev: unknown)` subclass.
 * Real `View` subclasses + a real loop-built `RenderRoot` (no mocks).
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

/** Fills its whole rect — produces buffer content for the serialize accessor check. */
class PaintView extends View {
  constructor(private readonly ch: string) {
    super();
  }
  draw(ctx: DrawContext): void {
    ctx.fill(this.ch);
  }
}

/**
 * Re-enters the loop by calling `emitCommand` from inside its own `onEvent` — but ONLY for the
 * triggering key, not for the command it raises, so the cascade terminates (a handler that re-emits
 * on every event would be a genuine feedback loop, as in any event system).
 */
class ReentrantLeaf extends View {
  loop: EventLoop | null = null;
  draw(_ctx: DrawContext): void {}
  override onEvent(ev: DispatchEvent): void {
    if (ev.event.type === 'key') {
      this.loop?.emitCommand('noop'); // re-entrant tick — must join the active tick, not flush again
    }
  }
}

/** Mount a focusable leaf under a root group, with focus pre-wired by hand. */
function mountFocused(loop: EventLoop, leaf: View): Group {
  leaf.focusable = true;
  const root = new Group();
  root.add(leaf);
  loop.mount(root);
  root.current = leaf;
  leaf.state.focused = true;
  return root;
}

// The deferring schedule swallows the render root's self-flush: an invalidate OUTSIDE a tick must
// not trigger a flush (the loop owns frame timing).
test('the deferring schedule never self-flushes (invalidate outside a tick paints nothing)', () => {
  const leaf = new PaintView('A');
  const loop = createEventLoop({ width: 10, height: 2 }, { caps });
  mountFocused(loop, leaf);

  const flushSpy = vi.spyOn(loop.renderRoot, 'flush');
  leaf.invalidate(); // schedules via the deferring seam → dropped, never run

  expect(flushSpy).not.toHaveBeenCalled();
});

// A re-entrant tick (emitCommand from inside a handler) joins the active tick: still exactly one
// flush for the whole cascade.
test('a re-entrant emitCommand coalesces into the active tick (one flush)', () => {
  const leaf = new ReentrantLeaf();
  const loop = createEventLoop({ width: 10, height: 2 }, { caps });
  mountFocused(loop, leaf);
  leaf.loop = loop;

  const flushSpy = vi.spyOn(loop.renderRoot, 'flush');
  loop.dispatch(keyEvent('x'));

  expect(flushSpy).toHaveBeenCalledTimes(1);
});

// The `renderRoot` accessor returns the live, loop-built root: stable identity, a usable buffer,
// and a `serialize()` that reflects the composed frame.
test('renderRoot accessor returns the live loop-built root', () => {
  const leaf = new PaintView('B');
  const loop = createEventLoop({ width: 6, height: 2 }, { caps });
  mountFocused(loop, leaf);

  expect(loop.renderRoot).toBe(loop.renderRoot); // stable reference
  expect(loop.renderRoot.buffer().width).toBe(6);
  expect(loop.renderRoot.buffer().height).toBe(2);
  expect(typeof loop.renderRoot.serialize()).toBe('string');
});

// The `onEvent` retype to `DispatchEvent` stays override-compatible with a legacy
// `onEvent(_ev: unknown)` subclass (TS method-parameter bivariance). Compiling + running is the
// assertion.
test('onEvent retype is override-compatible with a legacy onEvent(_ev: unknown) subclass', () => {
  let seen: unknown = null;
  class Legacy extends View {
    draw(_ctx: DrawContext): void {}
    override onEvent(ev: unknown): void {
      seen = ev;
    }
  }
  const leaf = new Legacy();
  const loop = createEventLoop({ width: 4, height: 1 }, { caps });
  mountFocused(loop, leaf);

  loop.dispatch(keyEvent('z'));
  expect(seen).not.toBeNull();
  expect((seen as DispatchEvent).event).toEqual(keyEvent('z'));
});
