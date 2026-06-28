/**
 * Specification tests — restore guarantees & security (RD-07).
 *
 * Immutable oracle: expectations derive from ST-3, ST-11, ST-9, ST-10, ST-8 in
 * plan doc 07-testing-strategy, the AR-6 exit-code matrix, and RD-07 security
 * requirements — never from reading the implementation. If a test here fails
 * after implementation, the implementation is wrong.
 */
import { test, expect } from 'vitest';

import { createHost } from '../src/engine/host/host.js';
import { leaveMode } from '../src/engine/host/modes.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { CapabilityProfile, DeepPartial } from '../src/engine/capability/index.js';
import type { HostSignal } from '../src/engine/host/types.js';
import { CaptureStream, FakeInput, FakeRuntimeAdapter, expectExit } from './host-doubles.js';

/** Deterministic capability profile with the given fields overridden. */
function caps(override: DeepPartial<CapabilityProfile> = {}): CapabilityProfile {
  return resolveCapabilities({ env: {}, platform: 'linux', override }).profile;
}

const RICH = caps({ mouse: { sgr: true, drag: true, wheel: true }, altScreen: true, bracketedPaste: true });

// ---------------------------------------------------------------------------
// ST-3 — terminating signals restore then exit 130/143/129 (AC-2/AR-6)
// ---------------------------------------------------------------------------

const TERMINATING: readonly [HostSignal, number][] = [
  ['interrupt', 130],
  ['terminate', 143],
  ['hangup', 129],
];

for (const [signal, code] of TERMINATING) {
  test(`ST-3: ${signal} restores then exits ${code}`, async () => {
    const codes: number[] = [];
    const adapter = new FakeRuntimeAdapter();
    const output = new CaptureStream();
    const input = new FakeInput(true);
    const host = createHost({
      caps: RICH,
      runtime: adapter,
      input: input.asInput(),
      output: output.asOutput(),
      onBeforeExit: (c) => codes.push(c),
    });

    await host.start();
    expectExit(() => adapter.emit(signal));

    expect(output.data.includes(leaveMode(RICH))).toBeTruthy();
    expect(adapter.rawModeCalls.at(-1)).toBe(false);
    expect(codes).toStrictEqual([code]);
    expect(adapter.exits).toStrictEqual([code]);
  });
}

// ---------------------------------------------------------------------------
// ST-11 — panic restore fires via the 'exit' backstop when setup crashes (AC-8/AR-17/PF-004)
// ---------------------------------------------------------------------------

test('ST-11: a crash during enter-mode still restores via the exit backstop (writeSync once)', async () => {
  const adapter = new FakeRuntimeAdapter();
  const output = new CaptureStream();
  const input = new FakeInput(true);
  const host = createHost({ caps: RICH, runtime: adapter, input: input.asInput(), output: output.asOutput() });

  output.failNextWrite = true; // the enter-mode write throws mid-setup
  let threw = false;
  try {
    await host.start();
  } catch {
    threw = true;
  }
  expect(threw).toBeTruthy();

  adapter.emitProcessExit(); // the synchronous process.on('exit') backstop
  expect(adapter.writeSyncCalls.length).toBe(1);
  expect(adapter.writeSyncCalls[0].data).toBe(leaveMode(RICH));
  expect(adapter.writeSyncCalls[0].fd).toBe(1);

  // The done guard prevents a second sync write if a signal also fires afterwards.
  expectExit(() => adapter.emit('interrupt'));
  expect(adapter.writeSyncCalls.length).toBe(1);
});

// ---------------------------------------------------------------------------
// ST-9 — raw input never appears in the error/warn channels (AC-8/security)
// ---------------------------------------------------------------------------

test('ST-9: raw input bytes never reach writeError/warn', async () => {
  const adapter = new FakeRuntimeAdapter();
  const output = new CaptureStream();
  const input = new FakeInput(true);
  const host = createHost({
    caps: RICH,
    runtime: adapter,
    input: input.asInput(),
    output: output.asOutput(),
    onInput: () => {
      /* app consumes input; the host must not log it */
    },
  });

  await host.start();
  input.feed(new TextEncoder().encode('secret\r'));
  await host.stop();

  expect(adapter.errorOutput.includes('secret')).toBe(false);
  expect(adapter.warnOutput.includes('secret')).toBe(false);
});

// ---------------------------------------------------------------------------
// ST-10 — raw mode is never attempted on a non-TTY (AC-8/AR-11)
// ---------------------------------------------------------------------------

test('ST-10: a non-TTY host never enables raw mode', async () => {
  const adapter = new FakeRuntimeAdapter();
  const output = new CaptureStream();
  const input = new FakeInput(false);
  const host = createHost({ caps: RICH, runtime: adapter, input: input.asInput(), output: output.asOutput() });

  await host.start();
  await host.stop();

  expect(adapter.rawModeCalls.includes(true)).toBe(false);
});

// ---------------------------------------------------------------------------
// ST-8 — EPIPE → best-effort restore + clean exit 0 (AC-7/AR-16)
// ---------------------------------------------------------------------------

test('ST-8: an EPIPE output error restores best-effort and exits 0', async () => {
  const codes: number[] = [];
  const adapter = new FakeRuntimeAdapter();
  const output = new CaptureStream();
  const input = new FakeInput(true);
  const host = createHost({
    caps: RICH,
    runtime: adapter,
    input: input.asInput(),
    output: output.asOutput(),
    onBeforeExit: (c) => codes.push(c),
  });

  await host.start();
  const epipe = Object.assign(new Error('broken pipe'), { code: 'EPIPE' });
  expectExit(() => output.emit('error', epipe));

  expect(output.data.includes(leaveMode(RICH))).toBeTruthy();
  expect(codes).toStrictEqual([0]);
  expect(adapter.exits).toStrictEqual([0]);
});
