/**
 * Specification tests (immutable oracle) — RD-06 foundation: the `ev.emit` dispatch-envelope
 * primitive (PA-1).
 *
 * Source: jsvision-ui RD-06 AC-3 → ST-01 (essential-controls/07-testing-strategy.md, 03-01 §A).
 * A focused stub control calls `ev.emit('ok')` from `onEvent`; a `CommandSpy` post-process view must
 * receive the `'ok'` command on the SAME dispatch tick (the command cascades onto the active tick).
 * Real `View` subclasses + a real loop-built `RenderRoot` over a fixed `caps` — no mocks. Expectations
 * derive from the acceptance criteria, never from the implementation.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { KeyEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import type { DispatchEvent } from '../src/event/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

/** A synthetic decoded key event (no terminal needed). */
function keyEvent(key: string): KeyEvent {
  return { type: 'key', key, ctrl: false, alt: false, shift: false };
}

/** A focusable stub control that raises a command via `ev.emit` on Space (PA-1). */
class EmittingLeaf extends View {
  override focusable = true;
  constructor(private readonly command: string) {
    super();
  }
  draw(_ctx: DrawContext): void {}
  override onEvent(ev: DispatchEvent): void {
    const inner = ev.event;
    if (inner.type === 'key' && inner.key === 'space') {
      ev.emit?.(this.command);
      ev.handled = true;
    }
  }
}

/** A post-process view that records every command name it sees on the tick. */
class CommandSpy extends View {
  override postProcess = true;
  readonly commands: string[] = [];
  draw(_ctx: DrawContext): void {}
  override onEvent(ev: DispatchEvent): void {
    if (ev.event.type === 'command') this.commands.push(ev.event.command);
  }
}

// ST-01 / AC-3 — a focused control's `ev.emit('ok')` reaches the command spy on the same tick.
test('ST-01: a focused control ev.emit(cmd) reaches a post-process command spy on the same tick', () => {
  const leaf = new EmittingLeaf('ok');
  const spy = new CommandSpy();
  const root = new Group();
  root.add(leaf);
  root.add(spy);

  const loop = createEventLoop({ width: 80, height: 24 }, { caps });
  loop.mount(root);
  root.current = leaf;
  leaf.state.focused = true;

  loop.dispatch(keyEvent('space'));

  expect(spy.commands).toEqual(['ok']);
});
