/**
 * Specification tests (immutable oracles) — 3-phase dispatch + commands + keymap.
 *
 * Source: jsvision-ui RD-04 AC-2, AC-9, AC-10, AC-11 → ST-02, ST-09, ST-10, ST-11
 * (codeops/features/jsvision-ui/plans/event-loop/07-testing-strategy.md).
 * Real `View` subclasses + a real loop-built `RenderRoot` (no mocks). The focused leaf is wired by
 * hand (`Group.current` + `state.focused`) — the focus *manager* lands in Phase 3, but the data
 * fields land in Phase 1 (PF-004). Expectations derive from the acceptance criteria, never the impl.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, createKeymap } from '@jsvision/core';
import type { KeyEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext, DispatchEvent, AppEvent } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import type { EventLoop } from '../src/event/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function keyEvent(key: string, mods: Partial<Pick<KeyEvent, 'ctrl' | 'alt' | 'shift'>> = {}): KeyEvent {
  return { type: 'key', key, ctrl: false, alt: false, shift: false, ...mods };
}

/** Records its label on every event; optionally consumes (sets `ev.handled`). */
class Recorder extends View {
  constructor(
    readonly label: string,
    private readonly order: string[],
    private readonly consume = false,
  ) {
    super();
  }
  draw(_ctx: DrawContext): void {}
  override onEvent(ev: DispatchEvent): void {
    this.order.push(this.label);
    if (this.consume) ev.handled = true;
  }
}

/** Records every event it receives (for command/keymap assertions). */
class Sink extends View {
  readonly seen: AppEvent[] = [];
  draw(_ctx: DrawContext): void {}
  override onEvent(ev: DispatchEvent): void {
    this.seen.push(ev.event);
  }
}

/** Mount a focusable leaf under a root group, with focus pre-wired by hand. */
function mountFocused(loop: EventLoop, leaf: View, root = new Group()): Group {
  leaf.focusable = true;
  root.add(leaf);
  loop.mount(root);
  root.current = leaf;
  leaf.state.focused = true;
  return root;
}

// ST-02 / AC-2 — a key visits pre (root→down) → focused (+chain bubble) → post in that order; a
// handler setting ev.handled in an earlier phase stops all later phases/views.
test('ST-02: 3-phase order is pre → focused → post', () => {
  const order: string[] = [];
  const pre = new Recorder('pre', order);
  pre.preProcess = true;
  const leaf = new Recorder('leaf', order);
  const post = new Recorder('post', order);
  post.postProcess = true;

  const loop = createEventLoop({ width: 20, height: 5 }, { caps });
  const root = new Group();
  root.add(pre);
  root.add(leaf);
  root.add(post);
  leaf.focusable = true;
  loop.mount(root);
  root.current = leaf;
  leaf.state.focused = true;

  loop.dispatch(keyEvent('x'));
  expect(order).toEqual(['pre', 'leaf', 'post']);
});

test('ST-02: handled in the pre phase short-circuits focus + post', () => {
  const order: string[] = [];
  const pre = new Recorder('pre', order, /* consume */ true);
  pre.preProcess = true;
  const leaf = new Recorder('leaf', order);
  const post = new Recorder('post', order);
  post.postProcess = true;

  const loop = createEventLoop({ width: 20, height: 5 }, { caps });
  const root = new Group();
  root.add(pre);
  root.add(leaf);
  root.add(post);
  leaf.focusable = true;
  loop.mount(root);
  root.current = leaf;
  leaf.state.focused = true;

  loop.dispatch(keyEvent('x'));
  expect(order).toEqual(['pre']); // focus + post never ran
});

// ST-09 / AC-9 — emitCommand('ok') raises a CommandEvent routed through the 3-phase machine; the
// focused handler consumes it.
test('ST-09: emitCommand routes a CommandEvent through the 3-phase machine', () => {
  const leaf = new Sink();
  const loop = createEventLoop({ width: 20, height: 5 }, { caps });
  mountFocused(loop, leaf);

  loop.emitCommand('ok');

  expect(leaf.seen).toContainEqual({ type: 'command', command: 'ok' });
});

// ST-10 / AC-10 — enableCommand(name,false) drops emitCommand; re-enabling restores; isCommandEnabled
// reflects state; an unregistered command is enabled by default.
test('ST-10: disabled commands drop; re-enabling restores; unknown is enabled', () => {
  let fired = 0;
  class CommandLeaf extends View {
    draw(_ctx: DrawContext): void {}
    override onEvent(ev: DispatchEvent): void {
      if (ev.event.type === 'command' && ev.event.command === 'save') fired += 1;
    }
  }
  const leaf = new CommandLeaf();
  const loop = createEventLoop({ width: 20, height: 5 }, { caps });
  mountFocused(loop, leaf);

  loop.enableCommand('save', false);
  expect(loop.isCommandEnabled('save')).toBe(false);
  loop.emitCommand('save');
  expect(fired).toBe(0); // dropped

  loop.enableCommand('save', true);
  expect(loop.isCommandEnabled('save')).toBe(true);
  loop.emitCommand('save');
  expect(fired).toBe(1); // restored

  expect(loop.isCommandEnabled('never-registered')).toBe(true); // enabled by default (PA-3)
});

// ST-11 / AC-11 — a keymap-bound chord raises its command and the raw key is NOT also dispatched; an
// unbound key dispatches as a plain key.
test('ST-11: a bound chord consumes the raw key; an unbound key dispatches plainly', () => {
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
  const loop = createEventLoop({ width: 20, height: 5 }, { caps, keymap: createKeymap({ 'ctrl+q': 'quit' }) });
  mountFocused(loop, leaf);

  loop.dispatch(keyEvent('q', { ctrl: true }));
  expect(quitCommands).toBe(1); // bound chord → command
  expect(plainKeys).toBe(0); // raw ctrl+q consumed (not also dispatched)

  loop.dispatch(keyEvent('a'));
  expect(plainKeys).toBe(1); // unbound key → plain dispatch
});
