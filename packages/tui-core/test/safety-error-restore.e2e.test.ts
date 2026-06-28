/**
 * End-to-end test — an error through the host crash path restores the terminal
 * before exit (RD-08 AC-6, via the existing RD-07 handleFatal path; AR-1).
 *
 * Immutable oracle: the expectation derives from RD-08 AC-6 via ST-26 in plan
 * doc 07-testing-strategy — never from reading the implementation. RD-08 adds NO
 * new runtime code here: it fires an RD-08 typed error (`EssentialsNotMetError`)
 * through the RD-07 host's `onUncaughtException` and asserts the captured restore
 * (raw-off + leave alt-screen) precedes the recorded `exit(1)`.
 *
 * Not in the unit glob; run explicitly:
 *   npx tsx --test test/safety-error-restore.e2e.test.ts
 */
import { test, expect } from 'vitest';

import { createHost } from '../src/engine/host/host.js';
import { leaveMode } from '../src/engine/host/modes.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { CapabilityProfile, DeepPartial } from '../src/engine/capability/index.js';
import { EssentialsNotMetError } from '../src/engine/safety/index.js';
import { CaptureStream, FakeInput, FakeRuntimeAdapter, expectExit } from './host-doubles.js';

/** Deterministic rich profile so leave-mode includes the ?1049l alt-screen pair. */
function caps(override: DeepPartial<CapabilityProfile> = {}): CapabilityProfile {
  return resolveCapabilities({ env: {}, platform: 'linux', override }).profile;
}
const RICH = caps({ mouse: { sgr: true, drag: true, wheel: true }, altScreen: true, bracketedPaste: true });

// ST-26 — an uncaught error through the loop restores before exit(1) (AC-6).
test('ST-26: an uncaught EssentialsNotMetError restores the terminal before exit(1)', async () => {
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
  const writtenBeforeCrash = output.data.length;

  // Fire the error through the host's uncaught-exception path. The fake `exit`
  // throws (it is typed `never`), so nothing can be written AFTER exit — meaning
  // any restore bytes present must have been written BEFORE the recorded exit.
  expectExit(() => adapter.emitUncaught(new EssentialsNotMetError(['interactive TTY (raw-mode keyboard input)'])));

  expect(output.data.includes(leaveMode(RICH))).toBeTruthy();
  expect(output.data.length > writtenBeforeCrash).toBeTruthy();
  expect(adapter.rawModeCalls.at(-1)).toBe(false);
  expect(codes).toStrictEqual([1]);
  expect(adapter.exits).toStrictEqual([1]);
});
