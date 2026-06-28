/**
 * Specification tests — host orchestrator lifecycle & dispatch (RD-07).
 *
 * Immutable oracle: expectations derive from ST-7, ST-13, ST-14, ST-15, ST-16 in
 * plan doc 07-testing-strategy and the 03-01 orchestration spec — never from
 * reading the implementation. If a test here fails after implementation, the
 * implementation is wrong.
 *
 * Drives the host headlessly via the injectable FakeRuntimeAdapter + CaptureStream
 * + FakeInput (AR-13); `decode`/`serialize`/`enterMode`/`leaveMode` run for real.
 */
import { test, expect } from 'vitest';

import { createHost } from '../src/engine/host/host.js';
import { enterMode, leaveMode } from '../src/engine/host/modes.js';
import { ScreenBuffer } from '../src/engine/render/buffer.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { CapabilityProfile, DeepPartial } from '../src/engine/capability/index.js';
import type { InputEvent } from '../src/engine/input/events.js';
import { CaptureStream, FakeInput, FakeRuntimeAdapter } from './host-doubles.js';

/** Deterministic capability profile with the given fields overridden. */
function caps(override: DeepPartial<CapabilityProfile> = {}): CapabilityProfile {
  return resolveCapabilities({ env: {}, platform: 'linux', override }).profile;
}

/** Rich caps so enter/leave bracket the frame with the ?1049 alt-screen pair. */
const RICH = caps({ mouse: { sgr: true, drag: true, wheel: true }, altScreen: true, bracketedPaste: true });

/** A small frame with a single visible glyph. */
function frame(): ScreenBuffer {
  const buf = new ScreenBuffer(10, 3, { fg: 'default', bg: 'default' });
  buf.set(1, 1, 'X', { fg: 'default', bg: 'default' });
  return buf;
}

// ---------------------------------------------------------------------------
// ST-7 — start → render → stop writes enter … frame … leave; raw on then off
// ---------------------------------------------------------------------------

test('ST-7: start → render → stop emits enter-mode, frame ANSI, then leave-mode', async () => {
  const adapter = new FakeRuntimeAdapter();
  const output = new CaptureStream();
  const input = new FakeInput(true);
  const host = createHost({ caps: RICH, runtime: adapter, input: input.asInput(), output: output.asOutput() });

  await host.start();
  host.render(frame());
  await host.stop();

  const enter = enterMode(RICH);
  const leave = leaveMode(RICH);
  const iEnter = output.data.indexOf(enter);
  const iGlyph = output.data.indexOf('X');
  const iLeave = output.data.indexOf(leave);

  expect(iEnter >= 0).toBeTruthy();
  expect(iGlyph > iEnter).toBeTruthy();
  expect(iLeave > iGlyph).toBeTruthy();
  expect(adapter.rawModeCalls).toStrictEqual([true, false]);
});

// ---------------------------------------------------------------------------
// ST-13 — idempotent start/stop (enter/leave written once)
// ---------------------------------------------------------------------------

test('ST-13: double start and double stop are no-ops', async () => {
  const adapter = new FakeRuntimeAdapter();
  const output = new CaptureStream();
  const input = new FakeInput(true);
  const host = createHost({ caps: RICH, runtime: adapter, input: input.asInput(), output: output.asOutput() });

  await host.start();
  await host.start();
  await host.stop();
  await host.stop();

  const enter = enterMode(RICH);
  const leave = leaveMode(RICH);
  expect(occurrences(output.data, enter)).toBe(1);
  expect(occurrences(output.data, leave)).toBe(1);
  expect(adapter.rawModeCalls).toStrictEqual([true, false]);
});

// ---------------------------------------------------------------------------
// ST-14 — a complete key sequence dispatches one event, no query leak
// ---------------------------------------------------------------------------

test('ST-14: ESC [ A dispatches a single "up" key to onInput', async () => {
  const events: InputEvent[] = [];
  const adapter = new FakeRuntimeAdapter();
  const input = new FakeInput(true);
  const host = createHost({
    caps: RICH,
    runtime: adapter,
    input: input.asInput(),
    output: new CaptureStream().asOutput(),
    onInput: (e) => events.push(e),
  });

  await host.start();
  input.feed(Uint8Array.from([0x1b, 0x5b, 0x41]));
  await host.stop();

  expect(events.length).toBe(1);
  expect(events[0]).toStrictEqual({ type: 'key', key: 'up', ctrl: false, alt: false, shift: false });
});

// ---------------------------------------------------------------------------
// ST-15 — a query reply is routed away from onInput
// ---------------------------------------------------------------------------

test('ST-15: a DA query reply never reaches onInput', async () => {
  const events: InputEvent[] = [];
  const adapter = new FakeRuntimeAdapter();
  const input = new FakeInput(true);
  const host = createHost({
    caps: RICH,
    runtime: adapter,
    input: input.asInput(),
    output: new CaptureStream().asOutput(),
    onInput: (e) => events.push(e),
  });

  await host.start();
  input.feed(Uint8Array.from([0x1b, 0x5b, 0x3f, 0x31, 0x3b, 0x32, 0x63])); // ESC [ ? 1 ; 2 c (DA1)
  await host.stop();

  expect(events.length).toBe(0);
});

// ---------------------------------------------------------------------------
// ST-16 — a lone trailing ESC flushes to an Escape key after the timeout
// ---------------------------------------------------------------------------

test('ST-16: a lone ESC flushes to an Escape key once the 50ms timer fires', async () => {
  const events: InputEvent[] = [];
  const adapter = new FakeRuntimeAdapter();
  const input = new FakeInput(true);
  const host = createHost({
    caps: RICH,
    runtime: adapter,
    input: input.asInput(),
    output: new CaptureStream().asOutput(),
    onInput: (e) => events.push(e),
  });

  await host.start();
  input.feed(Uint8Array.from([0x1b])); // lone ESC → host arms the flush timer
  expect(events.length).toBe(0);
  adapter.advanceTimer(60); // past ESC_TIMEOUT_MS (50ms)
  await host.stop();

  expect(events.length).toBe(1);
  expect(events[0]).toStrictEqual({ type: 'key', key: 'escape', ctrl: false, alt: false, shift: false });
});

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function occurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}
