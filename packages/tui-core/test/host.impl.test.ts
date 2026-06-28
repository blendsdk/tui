/**
 * Implementation tests — host internals & edges (RD-07).
 *
 * Unlike the spec suites, these probe internals and edge cases: per-capability
 * mode gating, the deferred keyboard protocol (DEF-2), and the strict-inverse
 * property under partial profiles. Later phases append orchestrator/lifecycle
 * sections to this file.
 *
 * Capabilities come from RD-02's `resolveCapabilities({ override })` with a clean
 * env so no real terminal is needed.
 */
import { test, expect } from 'vitest';

import { enterMode, leaveMode } from '../src/engine/host/modes.js';
import { createHost } from '../src/engine/host/host.js';
import { bindStreams } from '../src/engine/host/streams.js';
import { ScreenBuffer } from '../src/engine/render/buffer.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { CapabilityProfile, DeepPartial } from '../src/engine/capability/index.js';
import type { InputEvent } from '../src/engine/input/events.js';
import { CaptureStream, FakeInput, FakeRuntimeAdapter, expectExit } from './host-doubles.js';

/** Deterministic capability profile with the given fields overridden. */
function caps(override: DeepPartial<CapabilityProfile> = {}): CapabilityProfile {
  return resolveCapabilities({ env: {}, platform: 'linux', override }).profile;
}

// ---------------------------------------------------------------------------
// Mode gating — each capability gate independently
// ---------------------------------------------------------------------------

test('modes: altScreen off omits ?1049', () => {
  const out = enterMode(caps({ altScreen: false }));
  expect(out.includes('?1049')).toBe(false);
});

test('modes: mouse.sgr false omits all mouse modes', () => {
  const out = enterMode(caps({ mouse: { sgr: false, drag: true, wheel: true } }));
  expect(out.includes('?1006')).toBe(false);
  expect(out.includes('?1000')).toBe(false);
  expect(out.includes('?1002')).toBe(false);
});

test('modes: drag off keeps SGR+basic mouse but omits ?1002 (PF-003)', () => {
  const out = enterMode(caps({ mouse: { sgr: true, drag: false, wheel: true } }));
  expect(out.includes('?1006h')).toBeTruthy();
  expect(out.includes('?1000h')).toBeTruthy();
  expect(out.includes('?1002')).toBe(false);
});

test('modes: any-motion tracking ?1003 is never emitted (PF-003)', () => {
  const full = caps({ mouse: { sgr: true, drag: true, wheel: true } });
  expect(enterMode(full).includes('?1003')).toBe(false);
  expect(leaveMode(full).includes('?1003')).toBe(false);
});

test('modes: bracketedPaste false omits ?2004', () => {
  const out = enterMode(caps({ bracketedPaste: false }));
  expect(out.includes('?2004')).toBe(false);
});

test('modes: colorDepth does not affect mode sequences', () => {
  const mono = enterMode(caps({ colorDepth: 'mono' }));
  const truecolor = enterMode(caps({ colorDepth: 'truecolor' }));
  expect(mono).toBe(truecolor);
});

// ---------------------------------------------------------------------------
// Focus is host policy (PF-006), not caps-gated
// ---------------------------------------------------------------------------

test('modes: focus defaults on (?1004h present)', () => {
  expect(enterMode(caps()).includes('?1004h')).toBeTruthy();
});

test('modes: focus:false omits ?1004h on enter and ?1004l on leave (PF-006)', () => {
  const profile = caps({ altScreen: true, bracketedPaste: true });
  expect(enterMode(profile, { focus: false }).includes('?1004')).toBe(false);
  expect(leaveMode(profile, { focus: false }).includes('?1004')).toBe(false);
});

// ---------------------------------------------------------------------------
// Keyboard protocol is deferred (DEF-2 / RT-1) — no CSI-u / modifyOtherKeys
// ---------------------------------------------------------------------------

test('modes: keyboard caps enabled still emit no keyboard-protocol bytes (DEF-2)', () => {
  const kb = caps({ keyboard: { kittyFlags: true, modifyOtherKeys: true } });
  const enter = enterMode(kb);
  const leave = leaveMode(kb);
  // No Kitty push/pop (CSI > … u / CSI < … u) and no modifyOtherKeys (CSI > 4 ; … m).
  expect(/\x1b\[>\d*u/.test(enter)).toBe(false);
  expect(/\x1b\[<\d*u/.test(leave)).toBe(false);
  expect(/\x1b\[>4;\d+m/.test(enter)).toBe(false);
  expect(/\x1b\[>4;\d+m/.test(leave)).toBe(false);
});

// ---------------------------------------------------------------------------
// Strict-inverse property holds under partial profiles
// ---------------------------------------------------------------------------

test('modes: leave disables exactly the modes enter enabled (drag-off profile)', () => {
  const profile = caps({ mouse: { sgr: true, drag: false, wheel: true }, altScreen: true, bracketedPaste: true });
  const enter = enterMode(profile);
  const leave = leaveMode(profile);
  const enabled = [...enter.matchAll(/\?(\d+)h/g)].map((m) => m[1]);
  for (const mode of enabled) {
    expect(leave.includes(`?${mode}l`)).toBeTruthy();
  }
  expect(enabled.includes('1002')).toBe(false);
});

// ---------------------------------------------------------------------------
// Orchestrator — input pump, lifecycle, render edges (Phase 3)
// ---------------------------------------------------------------------------

/** A host wired to fresh doubles; returns the host plus its doubles for driving. */
function harness(overrides: Partial<Parameters<typeof createHost>[0]> = {}): {
  host: ReturnType<typeof createHost>;
  adapter: FakeRuntimeAdapter;
  input: FakeInput;
  output: CaptureStream;
  events: InputEvent[];
} {
  const adapter = new FakeRuntimeAdapter();
  const input = new FakeInput(true);
  const output = new CaptureStream();
  const events: InputEvent[] = [];
  const host = createHost({
    caps: caps({ altScreen: true }),
    runtime: adapter,
    input: input.asInput(),
    output: output.asOutput(),
    onInput: (e) => events.push(e),
    ...overrides,
  });
  return { host, adapter, input, output, events };
}

test('orchestrator: new bytes cancel the armed ESC timer (no spurious Escape)', async () => {
  const { host, adapter, input, events } = harness();
  await host.start();
  input.feed(Uint8Array.from([0x1b])); // arm the timer
  input.feed(Uint8Array.from([0x5b, 0x41])); // completes ESC [ A → up; cancels the timer
  adapter.advanceTimer(100); // timer was cleared — must fire nothing
  await host.stop();
  expect(events).toStrictEqual([{ type: 'key', key: 'up', ctrl: false, alt: false, shift: false }]);
});

test('orchestrator: stop removes the data listener; later bytes are ignored', async () => {
  const { host, input, events } = harness();
  await host.start();
  expect(input.listenerCount('data')).toBe(1);
  await host.stop();
  expect(input.listenerCount('data')).toBe(0);
  input.feed(Uint8Array.from([0x1b, 0x5b, 0x41]));
  expect(events.length).toBe(0);
});

test('orchestrator: restart re-attaches exactly one listener (no leak across cycles)', async () => {
  const { host, input, events } = harness();
  await host.start();
  await host.stop();
  await host.start();
  expect(input.listenerCount('data')).toBe(1);
  input.feed(Uint8Array.from([0x1b, 0x5b, 0x41]));
  await host.stop();
  expect(events).toStrictEqual([{ type: 'key', key: 'up', ctrl: false, alt: false, shift: false }]);
});

test('orchestrator: an unchanged frame re-render writes nothing (empty diff)', async () => {
  const { host, output } = harness();
  await host.start();
  const a = new ScreenBuffer(8, 2, { fg: 'default', bg: 'default' });
  a.set(1, 0, 'Z', { fg: 'default', bg: 'default' });
  host.render(a);
  const afterFirst = output.data.length;
  const b = new ScreenBuffer(8, 2, { fg: 'default', bg: 'default' });
  b.set(1, 0, 'Z', { fg: 'default', bg: 'default' });
  host.render(b); // identical content → empty diff → no write
  await host.stop();
  expect(output.data.length).toBe(afterFirst + leaveMode(caps({ altScreen: true })).length);
});

test('orchestrator: render before start is a no-op (no throw, no write)', () => {
  const { host, output } = harness();
  const buf = new ScreenBuffer(4, 1, { fg: 'default', bg: 'default' });
  expect(() => host.render(buf)).not.toThrow();
  expect(output.data).toBe('');
});

// ---------------------------------------------------------------------------
// Signals, restore & EPIPE hardening (Phase 4)
// ---------------------------------------------------------------------------

test('hardening: restore runs once across the async signal and the sync exit backstop', async () => {
  const { host, adapter, output } = harness();
  await host.start();
  expectExit(() => adapter.emit('interrupt')); // async restore + exit 130
  adapter.emitProcessExit(); // sync backstop — must be a no-op (done guard)
  expect(occurrences(output.data, leaveMode(caps({ altScreen: true })))).toBe(1);
  expect(adapter.writeSyncCalls.length).toBe(0);
  expect(adapter.exits).toStrictEqual([130]);
});

test('hardening: a non-EPIPE output error routes through handleFatal (exit 1, no throw leak)', async () => {
  const codes: number[] = [];
  const { host, adapter, output } = harness({ onBeforeExit: (c) => codes.push(c) });
  await host.start();
  const err = Object.assign(new Error('disk gone'), { code: 'EACCES' });
  expectExit(() => output.emit('error', err));
  expect(adapter.errorOutput.includes('disk gone')).toBeTruthy();
  expect(codes).toStrictEqual([1]);
  expect(adapter.exits).toStrictEqual([1]);
  expect(output.data.includes(leaveMode(caps({ altScreen: true })))).toBeTruthy();
});

test('hardening: exitOnSignal:false restores and notifies but never exits', async () => {
  const codes: number[] = [];
  const { host, adapter, output } = harness({ exitOnSignal: false, onBeforeExit: (c) => codes.push(c) });
  await host.start();
  adapter.emit('interrupt'); // no exit → no ProcessExitError to catch
  expect(adapter.exits).toStrictEqual([]);
  expect(codes).toStrictEqual([130]);
  expect(output.data.includes(leaveMode(caps({ altScreen: true })))).toBeTruthy();
  await host.stop();
});

test('hardening: resize reads the final size once at immediate-drain time', async () => {
  const sizes: { columns: number; rows: number }[] = [];
  const { host, adapter, output } = harness({ onResize: (e) => sizes.push({ columns: e.columns, rows: e.rows }) });
  await host.start();
  output.columns = 50;
  output.rows = 20;
  adapter.emit('resize');
  output.columns = 120; // size settles after the burst …
  output.rows = 30;
  adapter.emit('resize');
  adapter.flushImmediates(); // … and is read once, here
  await host.stop();
  expect(sizes).toStrictEqual([{ columns: 120, rows: 30 }]);
});

test('hardening: no signal/exit handler leaks across start/stop cycles', async () => {
  const { host, adapter, input, output } = harness();
  for (let i = 0; i < 3; i += 1) {
    await host.start();
    await host.stop();
  }
  expect(input.listenerCount('data')).toBe(0);
  expect(output.listenerCount('error')).toBe(0);
  expect(adapter.pendingSignalHandlers).toBe(0);
  expect(adapter.pendingExitHandlers).toBe(0);
});

test('hardening: bindStreams degrades gracefully with default streams (/dev/tty fallback)', () => {
  // In a non-TTY test runner /dev/tty open fails and bindStreams falls back to
  // the std streams; in a real terminal it binds /dev/tty. Either way: no throw.
  expect(() => {
    const bound = bindStreams({ caps: caps(), preferDevTty: true });
    expect(typeof bound.isTTY).toBe('boolean');
    bound.dispose();
  }).not.toThrow();
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
