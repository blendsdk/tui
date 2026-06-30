/**
 * Implementation tests — 3-phase dispatch + commands + keymap internals & edges.
 *
 * Covers: a both-flag view visited in both sweeps; a both-flag view consuming in pre skips its post
 * visit + the focus chain; a command consumed in the post phase; `opts.commands` seeding; a disabled
 * bound key dropping with no plain-key fall-through. Real `View` subclasses + a real loop (no mocks).
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, createKeymap } from '@jsvision/core';
import type { KeyEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext, DispatchEvent } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import type { EventLoop } from '../src/event/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function keyEvent(key: string, mods: Partial<Pick<KeyEvent, 'ctrl' | 'alt' | 'shift'>> = {}): KeyEvent {
  return { type: 'key', key, ctrl: false, alt: false, shift: false, ...mods };
}

/** Counts visits, records its tag, optionally consumes the event. */
class Visitor extends View {
  visits = 0;
  constructor(
    readonly tag: string,
    private readonly order: string[] = [],
    private readonly consume = false,
  ) {
    super();
  }
  draw(_ctx: DrawContext): void {}
  override onEvent(ev: DispatchEvent): void {
    this.visits += 1;
    this.order.push(this.tag);
    if (this.consume) ev.handled = true;
  }
}

/** Mount `children` under a root group and focus `focused` (by hand). */
function mountWith(loop: EventLoop, children: View[], focused: View): Group {
  const root = new Group();
  for (const child of children) root.add(child);
  focused.focusable = true;
  loop.mount(root);
  root.current = focused;
  focused.state.focused = true;
  return root;
}

// A view flagged BOTH preProcess + postProcess is visited in BOTH sweeps (pre then post), with the
// focused leaf in between.
test('a both-flag view is visited in both the pre and post sweeps', () => {
  const order: string[] = [];
  const both = new Visitor('both', order);
  both.preProcess = true;
  both.postProcess = true;
  const leaf = new Visitor('leaf', order);

  const loop = createEventLoop({ width: 20, height: 5 }, { caps });
  mountWith(loop, [both, leaf], leaf);

  loop.dispatch(keyEvent('x'));
  expect(both.visits).toBe(2);
  expect(leaf.visits).toBe(1);
  expect(order).toEqual(['both', 'leaf', 'both']);
});

// A both-flag view that consumes in the pre sweep is not visited again in post, and the focus chain
// never runs (handled short-circuit spans all later phases).
test('handled in the pre sweep skips the focus chain and the post sweep', () => {
  const order: string[] = [];
  const both = new Visitor('both', order, /* consume */ true);
  both.preProcess = true;
  both.postProcess = true;
  const leaf = new Visitor('leaf', order);

  const loop = createEventLoop({ width: 20, height: 5 }, { caps });
  mountWith(loop, [both, leaf], leaf);

  loop.dispatch(keyEvent('x'));
  expect(both.visits).toBe(1); // consumed in pre; never reached the post sweep
  expect(leaf.visits).toBe(0); // focus chain short-circuited
  expect(order).toEqual(['both']);
});

// A command not consumed by the focused chain can be handled in the post phase.
test('a command can be handled in the post phase', () => {
  let postHandled = 0;
  class PostHandler extends View {
    draw(_ctx: DrawContext): void {}
    override onEvent(ev: DispatchEvent): void {
      if (ev.event.type === 'command') {
        postHandled += 1;
        ev.handled = true;
      }
    }
  }
  const post = new PostHandler();
  post.postProcess = true;
  const leaf = new Visitor('leaf'); // focused, but ignores commands (does not consume)

  const loop = createEventLoop({ width: 20, height: 5 }, { caps });
  mountWith(loop, [leaf, post], leaf);

  loop.emitCommand('go');
  expect(postHandled).toBe(1);
});

// opts.commands seeds the registry as enabled (introspection hint); a seeded command still
// dispatches normally.
test('opts.commands seeds enabled commands that still dispatch', () => {
  let fired = 0;
  class CommandLeaf extends View {
    draw(_ctx: DrawContext): void {}
    override onEvent(ev: DispatchEvent): void {
      if (ev.event.type === 'command' && ev.event.command === 'save') fired += 1;
    }
  }
  const leaf = new CommandLeaf();
  const loop = createEventLoop({ width: 10, height: 3 }, { caps, commands: ['save', 'quit'] });
  mountWith(loop, [leaf], leaf);

  expect(loop.isCommandEnabled('save')).toBe(true);
  expect(loop.isCommandEnabled('quit')).toBe(true);

  loop.emitCommand('save');
  expect(fired).toBe(1);
});

// A bound chord whose command is disabled drops the key entirely — no command AND no plain-key
// fall-through (PA-1/PA-3).
test('a disabled bound key drops with no plain-key fall-through', () => {
  let plainKeys = 0;
  let quitCommands = 0;
  class MixedLeaf extends View {
    draw(_ctx: DrawContext): void {}
    override onEvent(ev: DispatchEvent): void {
      if (ev.event.type === 'key') plainKeys += 1;
      if (ev.event.type === 'command' && ev.event.command === 'quit') quitCommands += 1;
    }
  }
  const leaf = new MixedLeaf();
  const loop = createEventLoop({ width: 10, height: 3 }, { caps, keymap: createKeymap({ 'ctrl+q': 'quit' }) });
  mountWith(loop, [leaf], leaf);

  loop.enableCommand('quit', false);
  loop.dispatch(keyEvent('q', { ctrl: true }));

  expect(quitCommands).toBe(0); // disabled command dropped
  expect(plainKeys).toBe(0); // raw key consumed — no fall-through
});
