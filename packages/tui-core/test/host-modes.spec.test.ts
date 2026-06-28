/**
 * Specification tests — host enter/leave mode sequences (RD-07, AC-1).
 *
 * Immutable oracle: expectations derive from the 03-02 sequence table and ST-1,
 * ST-1b, ST-2 in plan doc 07-testing-strategy — never from reading the
 * implementation. If a test here fails after implementation, the implementation
 * is wrong.
 *
 * Capabilities come from RD-02's `resolveCapabilities({ override })` with a clean
 * env so no real terminal is needed (same helper style as the RD-04 suite).
 */
import { test, expect } from 'vitest';

import { enterMode, leaveMode } from '../src/engine/host/modes.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { CapabilityProfile, DeepPartial } from '../src/engine/capability/index.js';

/** Deterministic capability profile with the given fields overridden. */
function caps(override: DeepPartial<CapabilityProfile> = {}): CapabilityProfile {
  return resolveCapabilities({ env: {}, platform: 'linux', override }).profile;
}

/** Assert each needle appears in `haystack` in strictly increasing position. */
function assertOrdered(haystack: string, needles: readonly string[]): void {
  let last = -1;
  for (const needle of needles) {
    const at = haystack.indexOf(needle, last + 1);
    expect(at > last).toBeTruthy();
    last = at;
  }
}

/** The full-capability profile shared by ST-1 and ST-2. */
const FULL = caps({
  mouse: { sgr: true, drag: true, wheel: true },
  altScreen: true,
  bracketedPaste: true,
});

// ---------------------------------------------------------------------------
// ST-1 — enter sequence, full caps, exact order (AC-1)
// ---------------------------------------------------------------------------

test('ST-1: enterMode(full caps) emits modes in the documented order', () => {
  const out = enterMode(FULL);
  assertOrdered(out, ['?1049h', '?25l', '?7l', '?1006h', '?1000h', '?1002h', '?2004h', '?1004h']);
});

// ---------------------------------------------------------------------------
// ST-1b — gating: disabled caps omit their sequences (AC-1)
// ---------------------------------------------------------------------------

test('ST-1b: enterMode gates mouse/paste off but keeps always-on modes + focus', () => {
  const out = enterMode(
    caps({ altScreen: true, mouse: { sgr: false, drag: false, wheel: false }, bracketedPaste: false }),
  );
  expect(out.includes('?1006')).toBe(false);
  expect(out.includes('?1000')).toBe(false);
  expect(out.includes('?2004')).toBe(false);
  assertOrdered(out, ['?1049h', '?25l', '?7l', '?1004h']);
});

// ---------------------------------------------------------------------------
// ST-2 — leave is the strict inverse of enter (AC-1)
// ---------------------------------------------------------------------------

test('ST-2: leaveMode(full caps) is the strict inverse of enterMode', () => {
  const out = leaveMode(FULL);
  // Reverse order of the enter sequence, with each high (h) toggled low (l).
  assertOrdered(out, ['?1004l', '?2004l', '?1002l', '?1000l', '?1006l', '?7h', '?25h', '?1049l']);
});

test('ST-2: every mode enabled on enter is disabled on leave (toggles pair up)', () => {
  const enter = enterMode(FULL);
  const leave = leaveMode(FULL);
  // Extract every "?<n>h" enabled on enter; assert a matching "?<n>l" on leave.
  const onModes = [...enter.matchAll(/\?(\d+)h/g)].map((m) => m[1]);
  expect(onModes.length >= 6).toBeTruthy();
  for (const mode of onModes) {
    expect(leave.includes(`?${mode}l`)).toBeTruthy();
  }
});
