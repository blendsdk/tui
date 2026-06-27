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
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { enterMode, leaveMode } from '../src/engine/host/modes.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { CapabilityProfile, DeepPartial } from '../src/engine/capability/index.js';

/** Deterministic capability profile with the given fields overridden. */
function caps(override: DeepPartial<CapabilityProfile> = {}): CapabilityProfile {
  return resolveCapabilities({ env: {}, platform: 'linux', override }).profile;
}

// ---------------------------------------------------------------------------
// Mode gating — each capability gate independently
// ---------------------------------------------------------------------------

test('modes: altScreen off omits ?1049', () => {
  const out = enterMode(caps({ altScreen: false }));
  assert.equal(out.includes('?1049'), false);
});

test('modes: mouse.sgr false omits all mouse modes', () => {
  const out = enterMode(caps({ mouse: { sgr: false, drag: true, wheel: true } }));
  assert.equal(out.includes('?1006'), false, 'no SGR encoding');
  assert.equal(out.includes('?1000'), false, 'no basic tracking');
  assert.equal(out.includes('?1002'), false, 'no button-event tracking');
});

test('modes: drag off keeps SGR+basic mouse but omits ?1002 (PF-003)', () => {
  const out = enterMode(caps({ mouse: { sgr: true, drag: false, wheel: true } }));
  assert.ok(out.includes('?1006h'), 'SGR encoding present');
  assert.ok(out.includes('?1000h'), 'basic tracking present');
  assert.equal(out.includes('?1002'), false, 'button-event (drag) omitted when drag is false');
});

test('modes: any-motion tracking ?1003 is never emitted (PF-003)', () => {
  const full = caps({ mouse: { sgr: true, drag: true, wheel: true } });
  assert.equal(enterMode(full).includes('?1003'), false);
  assert.equal(leaveMode(full).includes('?1003'), false);
});

test('modes: bracketedPaste false omits ?2004', () => {
  const out = enterMode(caps({ bracketedPaste: false }));
  assert.equal(out.includes('?2004'), false);
});

test('modes: colorDepth does not affect mode sequences', () => {
  const mono = enterMode(caps({ colorDepth: 'mono' }));
  const truecolor = enterMode(caps({ colorDepth: 'truecolor' }));
  assert.equal(mono, truecolor, 'mode setup is independent of color depth');
});

// ---------------------------------------------------------------------------
// Focus is host policy (PF-006), not caps-gated
// ---------------------------------------------------------------------------

test('modes: focus defaults on (?1004h present)', () => {
  assert.ok(enterMode(caps()).includes('?1004h'));
});

test('modes: focus:false omits ?1004h on enter and ?1004l on leave (PF-006)', () => {
  const profile = caps({ altScreen: true, bracketedPaste: true });
  assert.equal(enterMode(profile, { focus: false }).includes('?1004'), false);
  assert.equal(leaveMode(profile, { focus: false }).includes('?1004'), false);
});

// ---------------------------------------------------------------------------
// Keyboard protocol is deferred (DEF-2 / RT-1) — no CSI-u / modifyOtherKeys
// ---------------------------------------------------------------------------

test('modes: keyboard caps enabled still emit no keyboard-protocol bytes (DEF-2)', () => {
  const kb = caps({ keyboard: { kittyFlags: true, modifyOtherKeys: true } });
  const enter = enterMode(kb);
  const leave = leaveMode(kb);
  // No Kitty push/pop (CSI > … u / CSI < … u) and no modifyOtherKeys (CSI > 4 ; … m).
  assert.equal(/\x1b\[>\d*u/.test(enter), false, 'no Kitty push on enter');
  assert.equal(/\x1b\[<\d*u/.test(leave), false, 'no Kitty pop on leave');
  assert.equal(/\x1b\[>4;\d+m/.test(enter), false, 'no modifyOtherKeys on enter');
  assert.equal(/\x1b\[>4;\d+m/.test(leave), false, 'no modifyOtherKeys on leave');
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
    assert.ok(leave.includes(`?${mode}l`), `leave disables ?${mode}`);
  }
  assert.equal(enabled.includes('1002'), false, 'drag mode 1002 not among enabled');
});
