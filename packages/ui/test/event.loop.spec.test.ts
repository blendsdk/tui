/**
 * Specification tests (immutable oracles) — event loop assembly & frame ownership.
 *
 * Source: jsvision-ui RD-04 AC-1, AC-16, AC-17, AC-18, AC-19 → ST-01, ST-16, ST-17, ST-18, ST-19
 * (codeops/features/jsvision-ui/plans/event-loop/07-testing-strategy.md).
 * Real `View` subclasses + a real loop-built `RenderRoot` over a fixed `caps` (no mocks). Synthetic
 * `InputEvent`s drive `dispatch()`. Per the flush-counter caveat (PF-006), the flush spy is installed
 * AFTER `loop.mount(root)` (mount flushes once internally) and counts are read from the spy — never
 * from `serialize()` (which would itself force a flush). Expectations derive from the acceptance
 * criteria, never from the implementation.
 *
 * The focused leaf is established **by hand** here (`Group.current` + `leaf.state.focused`): the
 * focus *manager* lands in Phase 3, but the data fields land in Phase 1, so a Phase-1 dispatch can
 * reach a handler (PF-004 mirrors this for ST-02).
 */
import { test, expect, vi } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { KeyEvent, Logger } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import type { DispatchEvent } from '../src/event/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

/** A synthetic decoded key event (no terminal needed). */
function keyEvent(key: string, mods: Partial<Pick<KeyEvent, 'ctrl' | 'alt' | 'shift'>> = {}): KeyEvent {
  return { type: 'key', key, ctrl: false, alt: false, shift: false, ...mods };
}

/** A logger whose `error` calls are captured for the error-isolation oracle (ST-19). */
function spyLogger(): { logger: Logger; errors: Array<{ component: string; msg: string }> } {
  const errors: Array<{ component: string; msg: string }> = [];
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: (component, msg) => {
      errors.push({ component, msg });
    },
  };
  return { logger, errors };
}

/** Records every dispatched event it receives. */
class RecordingLeaf extends View {
  readonly events: DispatchEvent[] = [];
  draw(_ctx: DrawContext): void {}
  override onEvent(ev: DispatchEvent): void {
    this.events.push(ev);
  }
}

/** Calls `invalidate()` several times within one tick (to exercise flush coalescing). */
class InvalidatingLeaf extends View {
  draw(_ctx: DrawContext): void {}
  override onEvent(_ev: DispatchEvent): void {
    this.invalidate();
    this.invalidate();
    this.invalidate();
  }
}

/** Throws from `onEvent` — used to assert handler-error isolation. */
class ThrowingLeaf extends View {
  draw(_ctx: DrawContext): void {}
  override onEvent(_ev: DispatchEvent): void {
    throw new Error('handler boom');
  }
}

/** Mount a single focusable leaf under a root group, with focus pre-wired by hand. */
function mountFocused(loop: ReturnType<typeof createEventLoop>, leaf: View): Group {
  leaf.focusable = true;
  const root = new Group();
  root.add(leaf);
  loop.mount(root);
  root.current = leaf;
  leaf.state.focused = true;
  return root;
}

// ST-01 / AC-1 — the loop constructs and dispatches with NO createHost / TTY: a synthetic
// dispatch(keyEvent) is delivered to the (hand-wired) focused view, proving the loop drives
// behavior from dispatch alone.
test('ST-01: createEventLoop + mount + dispatch run headlessly (no host)', () => {
  const leaf = new RecordingLeaf();
  const loop = createEventLoop({ width: 80, height: 24 }, { caps });
  mountFocused(loop, leaf);

  expect(loop.renderRoot).toBeDefined();
  loop.dispatch(keyEvent('x'));

  expect(leaf.events.length).toBe(1);
  expect(leaf.events[0]?.event).toEqual(keyEvent('x'));
  expect(leaf.events[0]?.handled).toBe(false);
});

// ST-16 / AC-16 — one dispatch tick causing M invalidate()s produces EXACTLY ONE flush.
test('ST-16: one dispatch tick with M invalidates → exactly one flush', () => {
  const leaf = new InvalidatingLeaf();
  const loop = createEventLoop({ width: 80, height: 24 }, { caps });
  mountFocused(loop, leaf);

  const flushSpy = vi.spyOn(loop.renderRoot, 'flush');
  loop.dispatch(keyEvent('x')); // handler calls invalidate() x3 within the tick

  expect(flushSpy).toHaveBeenCalledTimes(1);
});

// ST-17 / AC-17 — resize triggers a RenderRoot reflow and EXACTLY ONE subsequent frame.
test('ST-17: resize triggers a reflow + exactly one frame', () => {
  const leaf = new RecordingLeaf();
  const loop = createEventLoop({ width: 80, height: 24 }, { caps });
  mountFocused(loop, leaf);

  const flushSpy = vi.spyOn(loop.renderRoot, 'flush');
  loop.resize({ width: 100, height: 40 });

  expect(flushSpy).toHaveBeenCalledTimes(1);
  expect(loop.renderRoot.buffer().width).toBe(100); // reflow ran against the new viewport
  expect(loop.renderRoot.buffer().height).toBe(40);
});

// ST-18 / AC-18 — after a dispatch tick's cascade queue drains, the onIdle hook fires ONCE.
test('ST-18: onIdle fires once per drained tick', () => {
  let idle = 0;
  const leaf = new RecordingLeaf();
  const loop = createEventLoop(
    { width: 80, height: 24 },
    {
      caps,
      onIdle: () => {
        idle += 1;
      },
    },
  );
  mountFocused(loop, leaf);

  loop.dispatch(keyEvent('x'));
  expect(idle).toBe(1);
});

// ST-19 / AC-19 — a View whose onEvent throws is logged via the injected logger and the loop
// CONTINUES dispatching/rendering (the per-tick flush still runs).
test('ST-19: a throwing onEvent is logged and the loop survives', () => {
  const { logger, errors } = spyLogger();
  const leaf = new ThrowingLeaf();
  const loop = createEventLoop({ width: 80, height: 24 }, { caps, logger });
  mountFocused(loop, leaf);

  const flushSpy = vi.spyOn(loop.renderRoot, 'flush');
  expect(() => loop.dispatch(keyEvent('x'))).not.toThrow();

  expect(errors.length).toBeGreaterThanOrEqual(1);
  expect(errors[0]?.component).toBe('event');
  expect(flushSpy).toHaveBeenCalledTimes(1); // the loop continued → the frame still flushed
});
