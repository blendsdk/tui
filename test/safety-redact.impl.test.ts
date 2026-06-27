/**
 * Implementation tests — redaction edge cases (RD-08; AR-9, AR-6).
 *
 * Wheel/focus pass-through (no secrets); a control key with modifiers; and
 * `dumpCaps` coverage across every reason layer plus the all-false group → `-`
 * rule. Complements the ST-14…ST-18 spec oracle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { redactEvent, dumpCaps } from '../src/engine/safety/index.js';
import type { CapabilityResolution } from '../src/engine/capability/index.js';

test('a wheel event passes its direction and coordinates through', () => {
  const r = redactEvent({ type: 'wheel', dir: 'up', x: 7, y: 9 });
  assert.deepEqual(r, { type: 'wheel', dir: 'up', x: 7, y: 9 });
});

test('a focus event passes its flag through', () => {
  assert.deepEqual(redactEvent({ type: 'focus', focused: true }), { type: 'focus', focused: true });
  assert.deepEqual(redactEvent({ type: 'focus', focused: false }), { type: 'focus', focused: false });
});

test('a named key with modifiers keeps the name and the modifier flags', () => {
  const r = redactEvent({ type: 'key', key: 'tab', ctrl: true, alt: false, shift: true });
  assert.deepEqual(r, { type: 'key', key: 'tab', ctrl: true, alt: false, shift: true });
});

test('a printable key with modifiers still drops the character', () => {
  const r = redactEvent({ type: 'key', key: 'A', codepoint: 0x41, ctrl: false, alt: true, shift: true });
  assert.deepEqual(r, { type: 'key', printable: true, ctrl: false, alt: true, shift: true });
});

test('dumpCaps renders every reason layer name and collapses an all-false group', () => {
  const resolution: CapabilityResolution = {
    profile: {
      colorDepth: 'truecolor',
      mouse: { sgr: false, drag: false, wheel: false }, // all-false → `-`
      unicode: { utf8: true, widthMode: 'ambiguous-wide', emoji: 'wide' },
      osc: {
        hyperlink8: true,
        clipboard52: true,
        title: true,
        notify9: false,
        notify777: false,
        notify99: false,
        progress9_4: false,
      },
      sync2026: false,
      altScreen: false,
      bracketedPaste: true,
      keyboard: { kittyFlags: true, modifyOtherKeys: false },
      glyphs: { boxDrawing: true, halfBlocks: true },
      platform: 'darwin',
      multiplexer: true,
    },
    reasons: {
      colorDepth: 'override',
      mouse: 'runtime',
      unicode: 'env',
      osc: 'table',
      sync2026: 'default',
      altScreen: 'default',
      bracketedPaste: 'table',
      keyboard: 'runtime',
      glyphs: 'table',
      platform: 'runtime',
      multiplexer: 'env',
    },
  };

  const out = dumpCaps(resolution);
  // Every layer name appears at least once.
  for (const layer of ['override', 'runtime', 'env', 'table', 'default']) {
    assert.match(out, new RegExp(`\\(${layer}\\)`), `layer ${layer} present`);
  }
  // All-false group collapses to `-`.
  assert.match(out, /mouse=- \(runtime\)/);
  // Non-boolean nested fields render name:value.
  assert.match(out, /widthMode:ambiguous-wide/);
  assert.match(out, /emoji:wide/);
  // Exactly one `(layer)` pair per CapabilityReasons key (11 keys).
  assert.equal(out.match(/\([a-z]+\)/g)?.length, 11);
});
