/**
 * Specification test (immutable oracle) — RD-04 packaging & security.
 *
 * Source: jsvision-ui RD-04 AC-20 → ST-20
 * (codeops/features/jsvision-ui/plans/event-loop/07-testing-strategy.md).
 * Imports the public API **by name** from `@jsvision/ui` (the published surface). `check:deps` is
 * asserted separately by the gate (T5.6). Expectations derive from the acceptance criteria.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import {
  createEventLoop,
  View,
  Group,
  type EventLoop,
  type EventLoopOptions,
  type CommandEvent,
  type AppEvent,
  type DispatchEvent,
  type DrawContext,
} from '@jsvision/ui';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

// ST-20 / AC-20 — the RD-04 public surface is importable from `@jsvision/ui`.
test('ST-20: RD-04 public symbols import from @jsvision/ui', () => {
  expect(createEventLoop).toBeTypeOf('function');

  // Type-only usage — fails to typecheck if a contract type is missing from the public surface.
  const cmd: CommandEvent = { type: 'command', command: 'ok' };
  const envelope: DispatchEvent = { event: cmd, handled: false };
  const appEvent: AppEvent = cmd;
  expect(cmd.command).toBe('ok');
  expect(envelope.handled).toBe(false);
  expect(appEvent).toBe(cmd);

  const opts: EventLoopOptions = { caps };
  const loop: EventLoop = createEventLoop({ width: 10, height: 3 }, opts);
  expect(typeof loop.dispatch).toBe('function');
  expect(typeof loop.execView).toBe('function');
  expect(typeof loop.emitCommand).toBe('function');
});

// ST-20 / AC-20 — a dispatch + command route is a bounded single pass over a finite tree, and
// command names are opaque keys compared by equality (no eval/SQL/shell/fs injection surface).
test('ST-20: routing is a bounded pass; command names are opaque (no injection)', () => {
  let received = '';
  class CommandSink extends View {
    constructor() {
      super();
      this.focusable = true;
    }
    draw(_ctx: DrawContext): void {}
    override onEvent(ev: DispatchEvent): void {
      if (ev.event.type === 'command') received = ev.event.command;
    }
  }

  const sink = new CommandSink();
  const root = new Group();
  root.add(sink);
  const loop = createEventLoop({ width: 10, height: 3 }, { caps });
  loop.mount(root);
  loop.focusView(sink);

  // A command name laden with shell/SQL metacharacters is treated as an opaque key — routed by
  // equality, never interpreted. The dispatch completes (a bounded single pass, no hang).
  const dangerous = "'; rm -rf / --";
  loop.emitCommand(dangerous);
  expect(received).toBe(dangerous);
});
