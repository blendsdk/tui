/**
 * Implementation tests — color encoding edge cases (RD-05).
 *
 * `#rgb` short-form expansion, every attribute bit, fg vs bg role codes across the
 * normal/bright ranges, gray-ramp mapping, `default`→`''`, and the redmean
 * tie-break direction. Complements the ST-1…ST-14 spec oracle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encode, encodeStyle, nearest256 } from '../src/engine/color/index.js';
import { redmean2 } from '../src/engine/color/downsample.js';
import { Attr } from '../src/engine/render/index.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { DeepPartial, CapabilityProfile } from '../src/engine/capability/index.js';

function caps(override: DeepPartial<CapabilityProfile>): CapabilityProfile {
  return resolveCapabilities({ override }).profile;
}
const TRUECOLOR = caps({ colorDepth: 'truecolor' });

test('#rgb short form expands each nibble', () => {
  assert.equal(encode('#abc', 'fg', 'truecolor'), '\x1b[38;2;170;187;204m');
});

test('every attribute bit encodes to its SGR code', () => {
  const cases: ReadonlyArray<[number, number]> = [
    [Attr.bold, 1],
    [Attr.dim, 2],
    [Attr.italic, 3],
    [Attr.underline, 4],
    [Attr.blink, 5],
    [Attr.reverse, 7],
    [Attr.strike, 9],
  ];
  for (const [bit, code] of cases) {
    assert.equal(encodeStyle('default', 'default', bit, TRUECOLOR), `\x1b[${code}m`);
  }
});

test('16-depth fg and bg role codes span the normal and bright ranges', () => {
  assert.equal(encode('red', 'fg', '16'), '\x1b[31m'); // normal fg 30+1
  assert.equal(encode('red', 'bg', '16'), '\x1b[41m'); // normal bg 40+1
  assert.equal(encode('brightWhite', 'fg', '16'), '\x1b[97m'); // bright fg 90+7
  assert.equal(encode('brightWhite', 'bg', '16'), '\x1b[107m'); // bright bg 100+7
});

test('a mid-gray maps to the 256 gray ramp', () => {
  // gray ramp index 244 = 8 + (244-232)*10 = 128 → exact for #808080.
  assert.equal(nearest256({ r: 0x80, g: 0x80, b: 0x80 }), 244);
  assert.equal(encode('#808080', 'fg', '256'), '\x1b[38;5;244m');
});

test("'default' color encodes to the empty string at every depth", () => {
  for (const depth of ['truecolor', '256', '16', 'mono'] as const) {
    assert.equal(encode('default', 'fg', depth), '');
    assert.equal(encode('default', 'bg', depth), '');
  }
});

test('redmean2 is zero for identical colors; nearest hits an exact palette entry', () => {
  assert.equal(redmean2({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 }), 0);
  // Pure black ties index 0 (base) and 16 (cube); the lower index wins (AR-6).
  assert.equal(nearest256({ r: 0, g: 0, b: 0 }), 0);
});
