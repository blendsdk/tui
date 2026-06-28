/**
 * Specification tests — the additive RD-07 `detectTty()` helper (PF-001).
 *
 * Immutable oracle: expectations derive from PF-001 + AR-2 via ST-27/ST-28 in
 * plan doc 07-testing-strategy — never from reading the implementation. The gate
 * needs authoritative TTY facts BEFORE `start()` (host.isTTY is post-start only),
 * so `detectTty()` resolves them ephemerally and mirrors `bindStreams(...).isTTY`.
 */
import { test, expect } from 'vitest';

import { detectTty } from '../src/engine/host/index.js';
import { bindStreams } from '../src/engine/host/streams.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import { FakeInput, CaptureStream } from './host-doubles.js';

const caps = resolveCapabilities().profile;

// ST-27 — injected non-TTY streams → false; mirrors bindStreams; opens no fd.
test('ST-27: detectTty returns false for non-TTY streams and mirrors bindStreams', () => {
  const input = new FakeInput(false);
  const output = new CaptureStream();
  output.isTTY = false;

  const result = detectTty({ input: input.asInput(), output: output.asOutput() });
  expect(result).toBe(false);

  // Mirrors bindStreams' own isTTY for the same injected streams (AR-2).
  const bound = bindStreams({ caps, input: input.asInput(), output: output.asOutput() });
  expect(result).toBe(bound.isTTY);
  bound.dispose();
  // Injected streams open no fd, so detectTty's internal dispose leaves nothing
  // lingering (the /dev/tty open path is integration-only — ST-28 note).
});

// ST-28 — injected TTY streams → true; ephemeral (disposes anything it opened).
test('ST-28: detectTty returns true for TTY streams', () => {
  const input = new FakeInput(true);
  const output = new CaptureStream(); // isTTY defaults to true

  const result = detectTty({ input: input.asInput(), output: output.asOutput() });
  expect(result).toBe(true);

  const bound = bindStreams({ caps, input: input.asInput(), output: output.asOutput() });
  expect(result).toBe(bound.isTTY);
  bound.dispose();
});
