/**
 * Specification tests — input redaction & the caps debug dump (RD-08).
 *
 * Immutable oracle: expectations derive from RD-08 AC-4/AC-8 and the AR-9/AR-6
 * decisions via ST-14…ST-18 in plan doc 07-testing-strategy — never from reading
 * the implementation. `redactEvent` is the core no-secret-logging control: a
 * printable key's character and a paste's text must never survive redaction.
 */
import { test, expect } from 'vitest';

import { redactEvent, dumpCaps } from '../src/engine/safety/index.js';
import type { CapabilityResolution } from '../src/engine/capability/index.js';

// ST-14 — a printable key drops its character and codepoint (AC-4).
test('ST-14: a printable key redacts to printable:true with no char or codepoint', () => {
  const r = redactEvent({ type: 'key', key: 'a', codepoint: 0x61, ctrl: false, alt: false, shift: false });
  expect(r).toStrictEqual({ type: 'key', printable: true, ctrl: false, alt: false, shift: false });
  expect(!('key' in r)).toBeTruthy();
  expect(!('codepoint' in r)).toBeTruthy();
});

// ST-15 — a named key keeps its name (no secret in a control-key name) (AC-4).
test('ST-15: a named key keeps its name', () => {
  const r = redactEvent({ type: 'key', key: 'enter', ctrl: false, alt: false, shift: false });
  expect(r).toStrictEqual({ type: 'key', key: 'enter', ctrl: false, alt: false, shift: false });
});

// ST-16 — a paste yields only its length, never its text (AC-4).
test('ST-16: a paste redacts to length+truncated with no text', () => {
  const r = redactEvent({ type: 'paste', text: 'secret-token', truncated: false });
  expect(r).toStrictEqual({ type: 'paste', length: 12, truncated: false });
  expect(!JSON.stringify(r).includes('secret-token')).toBeTruthy();
});

// ST-17 — mouse coordinates are non-secret and pass through (AC-4).
test('ST-17: a mouse event passes its coordinates through unchanged', () => {
  const r = redactEvent({ type: 'mouse', kind: 'down', button: 0, x: 3, y: 5 });
  expect(r).toStrictEqual({ type: 'mouse', kind: 'down', button: 0, x: 3, y: 5 });
});

// ST-18 — dumpCaps renders one secret-free `field=value (layer)` pair per
// CapabilityReasons key (AC-8 Should-Have / AR-6). Format derived from 03-02:
// scalars render their value directly; object groups list enabled boolean
// members (all-false → `-`); non-boolean nested fields render `name:value`.
test('ST-18: dumpCaps renders the exact secret-free caps summary', () => {
  const resolution: CapabilityResolution = {
    profile: {
      colorDepth: '256',
      mouse: { sgr: true, drag: false, wheel: true },
      unicode: { utf8: true, widthMode: 'wcwidth', emoji: 'narrow' },
      osc: {
        hyperlink8: true,
        clipboard52: false,
        title: false,
        notify9: false,
        notify777: false,
        notify99: false,
        progress9_4: false,
      },
      sync2026: true,
      altScreen: true,
      bracketedPaste: true,
      keyboard: { kittyFlags: false, modifyOtherKeys: false },
      glyphs: { boxDrawing: true, halfBlocks: false },
      platform: 'linux',
      multiplexer: false,
    },
    reasons: {
      colorDepth: 'env',
      mouse: 'table',
      unicode: 'table',
      osc: 'table',
      sync2026: 'table',
      altScreen: 'table',
      bracketedPaste: 'table',
      keyboard: 'default',
      glyphs: 'table',
      platform: 'runtime',
      multiplexer: 'default',
    },
  };

  const expected =
    'colorDepth=256 (env) ' +
    'mouse=sgr,wheel (table) ' +
    'unicode=utf8,widthMode:wcwidth,emoji:narrow (table) ' +
    'osc=hyperlink8 (table) ' +
    'sync2026=true (table) ' +
    'altScreen=true (table) ' +
    'bracketedPaste=true (table) ' +
    'keyboard=- (default) ' +
    'glyphs=boxDrawing (table) ' +
    'platform=linux (runtime) ' +
    'multiplexer=false (default)';

  expect(dumpCaps(resolution)).toBe(expected);
  expect(!dumpCaps(resolution).includes('\n')).toBeTruthy();
});
