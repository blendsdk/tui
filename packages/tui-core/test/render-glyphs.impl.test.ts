/**
 * Implementation tests — glyph fallback table (RD-04, PL-9).
 *
 * Exercises `fallbackGlyph` directly across the full box set (single + double),
 * tee/cross glyphs, blocks/shades, the non-UTF-8 path, and the no-fallback case
 * under full capabilities. Complements the ST-5 / ST-11 spec oracles.
 */
import { test, expect } from 'vitest';

import { fallbackGlyph } from '../src/engine/render/glyphs.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { CapabilityProfile, DeepPartial } from '../src/engine/capability/index.js';

function caps(override: DeepPartial<CapabilityProfile> = {}): CapabilityProfile {
  return resolveCapabilities({ env: {}, platform: 'linux', override }).profile;
}

const FULL = caps({ unicode: { utf8: true }, glyphs: { boxDrawing: true, halfBlocks: true } });
const NO_BOX = caps({ unicode: { utf8: true }, glyphs: { boxDrawing: false, halfBlocks: true } });
const NO_BLOCKS = caps({ unicode: { utf8: true }, glyphs: { boxDrawing: true, halfBlocks: false } });
const NO_UTF8 = caps({ unicode: { utf8: false }, glyphs: { boxDrawing: true, halfBlocks: true } });

test('single-line box glyphs fall back to + - |', () => {
  expect(fallbackGlyph('┌', NO_BOX)).toBe('+');
  expect(fallbackGlyph('┐', NO_BOX)).toBe('+');
  expect(fallbackGlyph('└', NO_BOX)).toBe('+');
  expect(fallbackGlyph('┘', NO_BOX)).toBe('+');
  expect(fallbackGlyph('─', NO_BOX)).toBe('-');
  expect(fallbackGlyph('│', NO_BOX)).toBe('|');
});

test('double-line box glyphs fall back to + - |', () => {
  expect(fallbackGlyph('╔', NO_BOX)).toBe('+');
  expect(fallbackGlyph('╝', NO_BOX)).toBe('+');
  expect(fallbackGlyph('═', NO_BOX)).toBe('-');
  expect(fallbackGlyph('║', NO_BOX)).toBe('|');
});

test('tee and cross glyphs fall back to +', () => {
  for (const g of ['├', '┤', '┬', '┴', '┼']) {
    expect(fallbackGlyph(g, NO_BOX)).toBe('+');
  }
});

test('block and shade glyphs fall back to # when halfBlocks is off', () => {
  for (const g of ['█', '▀', '▄', '▌', '▐', '░', '▒', '▓']) {
    expect(fallbackGlyph(g, NO_BLOCKS)).toBe('#');
  }
});

test('non-UTF-8 maps any non-ASCII non-box glyph to ? and passes ASCII', () => {
  expect(fallbackGlyph('é', NO_UTF8)).toBe('?');
  expect(fallbackGlyph('世', NO_UTF8)).toBe('?');
  expect(fallbackGlyph('A', NO_UTF8)).toBe('A');
  expect(fallbackGlyph(' ', NO_UTF8)).toBe(' ');
});

test('non-UTF-8 still ASCII-substitutes box glyphs when boxDrawing is also off', () => {
  const noBoxNoUtf8 = caps({ unicode: { utf8: false }, glyphs: { boxDrawing: false, halfBlocks: true } });
  expect(fallbackGlyph('┌', noBoxNoUtf8)).toBe('+');
});

test('full capabilities pass every glyph through unchanged', () => {
  for (const g of ['┌', '█', 'é', '世', 'A', '─']) {
    expect(fallbackGlyph(g, FULL)).toBe(g);
  }
});

test('a continuation cell empty string passes through unchanged', () => {
  expect(fallbackGlyph('', NO_UTF8)).toBe('');
});
