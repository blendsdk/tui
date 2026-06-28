/**
 * Implementation tests — color/serializer integration internals (RD-05).
 *
 * 16-depth downsampling through `serialize()`'s default encoder, and crash safety:
 * a malformed color stored in a cell must not throw inside the render loop (the
 * seam degrades). Complements the ST-17 spec oracle.
 */
import { test, expect } from 'vitest';

import { serialize } from '../src/engine/render/serialize.js';
import { ScreenBuffer } from '../src/engine/render/buffer.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { CapabilityProfile, DeepPartial } from '../src/engine/capability/index.js';

function caps(override: DeepPartial<CapabilityProfile>): CapabilityProfile {
  return resolveCapabilities({ env: {}, platform: 'linux', override }).profile;
}
function blank(w: number, h: number): ScreenBuffer {
  return new ScreenBuffer(w, h, { fg: 'default', bg: 'default' });
}

test('the default encoder downsamples to a 16-color code at colorDepth 16', () => {
  const previous = blank(4, 1);
  const current = blank(4, 1);
  current.set(0, 0, 'a', { fg: 'brightRed', bg: 'default' });
  const out = serialize(current, previous, { caps: caps({ colorDepth: '16' }) });
  // brightRed → nearest16 index 9 → bright fg 90+(9-8) = 91.
  expect(out.includes('\x1b[91m')).toBeTruthy();
  expect(!out.includes('38;5') && !out.includes('38;2')).toBeTruthy();
});

test('a malformed color in a cell does not crash serialize (seam degrades)', () => {
  const previous = blank(4, 1);
  const current = blank(4, 1);
  // '#zzz' satisfies the Color type (`#${string}`) but is not valid hex.
  current.set(0, 0, 'a', { fg: '#zzz', bg: 'default' });
  let out = '';
  expect(() => {
    out = serialize(current, previous, { caps: caps({ colorDepth: 'truecolor' }) });
  }).not.toThrow();
  expect(!out.includes('38;2')).toBeTruthy();
  expect(out.includes('a')).toBeTruthy();
});
