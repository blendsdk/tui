/**
 * Specification tests — depth-aware color encoding & validation (RD-05).
 *
 * Immutable oracle: expectations derive from RD-05 AC-1…AC-7 and the AR-3…AR-8/
 * AR-13/AR-14 decisions via ST-1…ST-14 in plan doc 07-testing-strategy — never
 * from reading the implementation. The nearest-color vectors are hand-derived from
 * the documented redmean formula + full-256 candidate set + lowest-index tie-break
 * (AR-5/AR-6); if one fails after implementation, the implementation is wrong.
 */
import { test, expect } from 'vitest';

import { encode, encodeStyle, styleKey, nearest256, nearest16, InvalidColorError } from '../src/engine/color/index.js';
import { Attr } from '../src/engine/render/index.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { DeepPartial, CapabilityProfile } from '../src/engine/capability/index.js';

function caps(override: DeepPartial<CapabilityProfile>): CapabilityProfile {
  return resolveCapabilities({ override }).profile;
}
const TRUECOLOR = caps({ colorDepth: 'truecolor' });
const MONO = caps({ colorDepth: 'mono' });

// ST-1…ST-4 — one color across the four depths (AC-1).
test('ST-1: encode truecolor → 48;2;r;g;b', () => {
  expect(encode('#0000a8', 'bg', 'truecolor')).toBe('\x1b[48;2;0;0;168m');
});
test('ST-2: encode 256 → nearest cube index 19', () => {
  expect(encode('#0000a8', 'bg', '256')).toBe('\x1b[48;5;19m');
});
test('ST-3: encode 16 → nearest ANSI blue (bg 44)', () => {
  expect(encode('#0000a8', 'bg', '16')).toBe('\x1b[44m');
});
test('ST-4: encode mono → empty', () => {
  expect(encode('#0000a8', 'bg', 'mono')).toBe('');
});

// ST-5 — deterministic nearest-color vector table (AC-2).
test('ST-5: nearest256/nearest16 match the fixed vector table', () => {
  const vectors: ReadonlyArray<[{ r: number; g: number; b: number }, number, number]> = [
    [{ r: 0, g: 0, b: 0 }, 0, 0],
    [{ r: 255, g: 255, b: 255 }, 15, 15],
    [{ r: 255, g: 0, b: 0 }, 9, 9],
    [{ r: 0, g: 0, b: 168 }, 19, 4],
  ];
  for (const [rgb, i256, i16] of vectors) {
    expect(nearest256(rgb)).toBe(i256);
    expect(nearest16(rgb)).toBe(i16);
  }
});

// ST-6/ST-7 — attribute composition + reset cleanliness (AC-3).
test('ST-6: {bold,underline} → 1;4', () => {
  expect(encodeStyle('default', 'default', Attr.bold | Attr.underline, TRUECOLOR)).toBe('\x1b[1;4m');
});
test('ST-7: no attrs + default colors → empty (nothing to carry)', () => {
  expect(encodeStyle('default', 'default', Attr.none, TRUECOLOR)).toBe('');
});

// ST-8 — mono legibility: attributes still emit, no color (AC-4).
test('ST-8: mono keeps reverse but emits no 38/48', () => {
  const out = encodeStyle('#ff0000', '#0000ff', Attr.reverse, MONO);
  expect(out).toBe('\x1b[7m');
  expect(!out.includes('38') && !out.includes('48')).toBeTruthy();
});

// ST-9 — corners are exact (AC-5).
test('ST-9: pure black/white map exactly at each depth', () => {
  expect(nearest256({ r: 0, g: 0, b: 0 })).toBe(0);
  expect(nearest256({ r: 255, g: 255, b: 255 })).toBe(15);
  expect(nearest16({ r: 0, g: 0, b: 0 })).toBe(0);
  expect(nearest16({ r: 255, g: 255, b: 255 })).toBe(15);
  expect(encode('#000000', 'fg', '16')).toBe('\x1b[30m');
  expect(encode('#ffffff', 'fg', '16')).toBe('\x1b[97m');
  expect(encode('#000000', 'fg', '256')).toBe('\x1b[38;5;0m');
  expect(encode('#ffffff', 'fg', '256')).toBe('\x1b[38;5;15m');
});

// ST-10/ST-11 — malformed colors throw a typed error, emit no bytes (AC-6).
test('ST-10: malformed hex throws InvalidColorError', () => {
  expect(() => encode('#zzz', 'fg', 'truecolor')).toThrow(InvalidColorError);
});
test('ST-11: a non-hex color string throws InvalidColorError', () => {
  expect(() => encode('rgb(1,2,3)', 'fg', 'truecolor')).toThrow(InvalidColorError);
});

// ST-12 — the render-path seam degrades on a malformed color (crash-safe) (AC-7).
test('ST-12: encodeStyle degrades a malformed color instead of throwing', () => {
  let out = '';
  expect(() => {
    out = encodeStyle('#zzz', 'default', Attr.none, TRUECOLOR);
  }).not.toThrow();
  expect(out).toBe('');
});

// ST-13 — only numeric SGR is emitted (no caller-string passthrough) (AC-7).
test('ST-13: encode emits only numeric SGR', () => {
  expect(encode('#0000a8', 'fg', '256')).toMatch(/^\x1b\[[0-9;]*m$/);
});

// ST-14 — styleKey stability (Must-Have).
test('ST-14: styleKey is stable and distinguishes styles', () => {
  expect(styleKey('#fff', '#000', Attr.bold)).toBe(styleKey('#fff', '#000', Attr.bold));
  expect(styleKey('#fff', '#000', Attr.bold)).not.toBe(styleKey('#eee', '#000', Attr.bold));
  expect(styleKey('#fff', '#000', Attr.bold)).not.toBe(styleKey('#fff', '#111', Attr.bold));
  expect(styleKey('#fff', '#000', Attr.bold)).not.toBe(styleKey('#fff', '#000', Attr.italic));
});
