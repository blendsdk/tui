/**
 * Specification tests — Capability detection & precedence (RD-02).
 *
 * Immutable oracle: expectations derive from RD-02's acceptance criteria
 * (AC-1, AC-2, AC-5, AC-6), the component specs (03-01, 03-02), and the
 * Ambiguity Register (PL-5, PL-7, PL-9, PL-12) — never from reading the
 * implementation. If a test here fails after implementation, the implementation
 * is wrong, not the test.
 *
 * Phase 1 covers ST-1…ST-8, ST-10, ST-12; Phase 2 appends the table/multiplexer/
 * reason/cache cases (ST-9, ST-11, ST-17, ST-18, ST-19) now that layer 4 exists.
 * (ST-9 is sited here per runtime decision RT-1 in the ambiguity register: it
 * needs a detected terminal with mouse drag/wheel on, which the table provides.)
 *
 * Detection is driven entirely through injectable inputs (`options.env`,
 * `options.platform`) so every case is hermetic and cross-platform — no real
 * TTY and no `process.env` mutation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveCapabilities } from '../src/engine/capability/index.js';

// ---------------------------------------------------------------------------
// colorDepth from environment signals (AC-1)
// ---------------------------------------------------------------------------

// ST-1 (AC-1): COLORTERM=truecolor → truecolor, reason 'env'.
test('ST-1: COLORTERM=truecolor → colorDepth truecolor (reason env)', () => {
  const { profile, reasons } = resolveCapabilities({ env: { COLORTERM: 'truecolor' } });
  assert.equal(profile.colorDepth, 'truecolor');
  assert.equal(reasons.colorDepth, 'env');
});

// ST-2 (AC-1): TERM=xterm-256color, no COLORTERM → '256'.
test('ST-2: TERM=xterm-256color → colorDepth 256', () => {
  const { profile } = resolveCapabilities({ env: { TERM: 'xterm-256color' } });
  assert.equal(profile.colorDepth, '256');
});

// ST-3 (AC-1): TERM=xterm → '16'.
test('ST-3: TERM=xterm → colorDepth 16', () => {
  const { profile } = resolveCapabilities({ env: { TERM: 'xterm' } });
  assert.equal(profile.colorDepth, '16');
});

// ---------------------------------------------------------------------------
// NO_COLOR precedence (AC-1, PL-5, PL-12)
// ---------------------------------------------------------------------------

// ST-4 (AC-1, PL-5): NO_COLOR present → mono, beating COLORTERM.
test('ST-4: NO_COLOR=1 beats COLORTERM=truecolor → mono', () => {
  const { profile } = resolveCapabilities({ env: { COLORTERM: 'truecolor', NO_COLOR: '1' } });
  assert.equal(profile.colorDepth, 'mono');
});

// ST-5 (PL-12, AC-1): NO_COLOR present with an EMPTY value still forces mono.
test('ST-5: NO_COLOR="" (empty) still forces mono', () => {
  const { profile } = resolveCapabilities({ env: { COLORTERM: 'truecolor', NO_COLOR: '' } });
  assert.equal(profile.colorDepth, 'mono');
});

// ---------------------------------------------------------------------------
// FORCE_COLOR matrix (AC-2)
// ---------------------------------------------------------------------------

// ST-6 (AC-2): FORCE_COLOR=0|1|2|3 → mono|16|256|truecolor, overriding TERM.
test('ST-6: FORCE_COLOR=0|1|2|3 → mono|16|256|truecolor (overriding TERM)', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['0', 'mono'],
    ['1', '16'],
    ['2', '256'],
    ['3', 'truecolor'],
  ];
  for (const [force, expected] of cases) {
    const { profile } = resolveCapabilities({ env: { TERM: 'xterm', FORCE_COLOR: force } });
    assert.equal(profile.colorDepth, expected, `FORCE_COLOR=${force}`);
  }
});

// ST-7 (PL-5): NO_COLOR wins over FORCE_COLOR.
test('ST-7: NO_COLOR=1 wins over FORCE_COLOR=3 → mono', () => {
  const { profile } = resolveCapabilities({ env: { NO_COLOR: '1', FORCE_COLOR: '3' } });
  assert.equal(profile.colorDepth, 'mono');
});

// ---------------------------------------------------------------------------
// Override (AC-5, PL-7)
// ---------------------------------------------------------------------------

// ST-8 (AC-5): override.colorDepth beats a detected COLORTERM; reason 'override'.
test('ST-8: override colorDepth beats COLORTERM (reason override)', () => {
  const { profile, reasons } = resolveCapabilities({
    override: { colorDepth: '16' },
    env: { COLORTERM: 'truecolor' },
  });
  assert.equal(profile.colorDepth, '16');
  assert.equal(reasons.colorDepth, 'override');
});

// ---------------------------------------------------------------------------
// Conservative defaults (AC-6)
// ---------------------------------------------------------------------------

// ST-10 (AC-6): empty env → conservative defaults, capability reasons 'default'.
// `platform` is always actively sourced from options.platform/process.platform
// (03-02: reason 'env'), so only the capability fields fall back to 'default'.
test('ST-10: empty env → conservative defaults with reason default', () => {
  const { profile, reasons } = resolveCapabilities({ env: {}, platform: 'linux' });

  assert.equal(profile.colorDepth, '16');
  assert.equal(profile.mouse.sgr, false);
  assert.equal(profile.unicode.utf8, false);

  assert.equal(reasons.colorDepth, 'default');
  assert.equal(reasons.mouse, 'default');
  assert.equal(reasons.unicode, 'default');

  // Every capability reason (everything except the always-resolved platform) is 'default'.
  for (const [field, reason] of Object.entries(reasons)) {
    if (field === 'platform') continue;
    assert.equal(reason, 'default', `reasons.${field}`);
  }
});

// ---------------------------------------------------------------------------
// Immutability (PL-9)
// ---------------------------------------------------------------------------

// ST-12 (PL-9): both profile and reasons are deep-frozen.
test('ST-12: profile and reasons are deep-frozen', () => {
  const { profile, reasons } = resolveCapabilities({ env: { COLORTERM: 'truecolor' } });

  assert.ok(Object.isFrozen(profile), 'profile frozen');
  assert.ok(Object.isFrozen(reasons), 'reasons frozen');

  // Nested capability groups are frozen too (deep freeze, not just the top level).
  assert.ok(Object.isFrozen(profile.mouse), 'profile.mouse frozen');
  assert.ok(Object.isFrozen(profile.unicode), 'profile.unicode frozen');
  assert.ok(Object.isFrozen(profile.osc), 'profile.osc frozen');
  assert.ok(Object.isFrozen(profile.keyboard), 'profile.keyboard frozen');
  assert.ok(Object.isFrozen(profile.glyphs), 'profile.glyphs frozen');
});

// ---------------------------------------------------------------------------
// Phase 2: known-terminal table, multiplexer, reasons & cache
// ---------------------------------------------------------------------------

// ST-18 (PL-10): a known terminal (iTerm2 via TERM_PROGRAM) applies its known
// caps with reason 'table'. Expectations come from the iTerm2 row in 03-02
// (truecolor, mouse sgr/drag/wheel, OSC hyperlink/clipboard/title/notify).
test('ST-18: TERM_PROGRAM=iTerm.app applies known caps with reason table', () => {
  const { profile, reasons } = resolveCapabilities({ env: { TERM_PROGRAM: 'iTerm.app' } });

  assert.equal(profile.colorDepth, 'truecolor');
  assert.equal(profile.mouse.sgr, true);
  assert.equal(profile.osc.hyperlink8, true);

  assert.equal(reasons.colorDepth, 'table');
  assert.equal(reasons.mouse, 'table');
  assert.equal(reasons.osc, 'table');
});

// ST-9 (PL-7): a scalar override merges over a DETECTED terminal group without
// disturbing that group's other detected leaves. iTerm2 detects drag/wheel on;
// override forces sgr off only.
test('ST-9: override mouse.sgr over iTerm2 keeps detected drag/wheel', () => {
  const { profile, reasons } = resolveCapabilities({
    env: { TERM_PROGRAM: 'iTerm.app' },
    override: { mouse: { sgr: false } },
  });

  assert.equal(profile.mouse.sgr, false);
  assert.equal(profile.mouse.drag, true);
  assert.equal(profile.mouse.wheel, true);
  assert.equal(reasons.mouse, 'override');
});

// ST-11 (PL-3): the reason trace records the winning layer per field — 'env'
// for a COLORTERM-driven colorDepth, 'table' for a table-driven group, and
// 'default' for a field no layer touched.
test('ST-11: reasons record env / table / default across fields', () => {
  const { reasons } = resolveCapabilities({
    env: { COLORTERM: 'truecolor', TERM_PROGRAM: 'iTerm.app' },
  });

  assert.equal(reasons.colorDepth, 'env'); // COLORTERM (soft) outranks the table
  assert.equal(reasons.mouse, 'table'); // iTerm2 supplies the mouse group
  assert.equal(reasons.keyboard, 'default'); // no layer touches keyboard
});

// ST-19 (RD-02 must-have): tmux/screen is detected as a multiplexer with
// conservative caps; the reason is 'env' (TMUX / TERM prefix).
test('ST-19: TERM=screen + TMUX set → multiplexer true (reason env)', () => {
  const { profile, reasons } = resolveCapabilities({
    env: { TERM: 'screen', TMUX: '/tmp/x' },
  });

  assert.equal(profile.multiplexer, true);
  assert.equal(reasons.multiplexer, 'env');
  // Conservative: no rich color is claimed from a bare `screen` TERM.
  assert.equal(profile.colorDepth, '16');
});

// ST-17 (PL-14): the ambient resolution (no options) is cached per process;
// a second bare call returns the same frozen reference, and `refresh: true`
// forces a fresh object.
test('ST-17: ambient resolution is cached; refresh forces a fresh object', () => {
  const first = resolveCapabilities();
  const second = resolveCapabilities();
  assert.equal(second, first, 'second bare call returns the cached reference');

  const refreshed = resolveCapabilities({ refresh: true });
  assert.notEqual(refreshed, first, 'refresh returns a fresh object');
  assert.deepEqual(refreshed, first, 'refresh recomputes equal content');
});
