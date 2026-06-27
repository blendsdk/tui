/**
 * SGR encoding — the depth-aware color & attribute encoder (RD-05; AR-3, AR-4,
 * AR-7, AR-13).
 *
 * `encode()` turns one color into a standalone SGR for a given depth (throwing on
 * malformed input). `encodeStyle()` is the `StyleEncoder`-shaped seam the RD-04
 * serializer injects: it merges attributes + fg + bg into a single SGR and is
 * crash-safe (a malformed color degrades to no-color rather than throwing inside
 * the render loop). `styleKey()` is a stable per-cell key for run-merging.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution
 * (it resolves to the `.ts` source during development via tsx).
 */
import { CSI } from '../render/ansi.js';
import { Attr } from '../render/types.js';
import type { Color, AttrMask } from '../render/types.js';
import type { CapabilityProfile, ColorDepth } from '../capability/index.js';

import { InvalidColorError, toRgb } from './color.js';
import { nearest16, nearest256 } from './downsample.js';

/** Whether a color is a foreground or background (selects the SGR base code). */
export type ColorRole = 'fg' | 'bg';

/** SGR attribute codes, paired with their {@link Attr} bit (RD-04 order). */
const ATTR_SGR: readonly { readonly bit: number; readonly code: number }[] = [
  { bit: Attr.bold, code: 1 },
  { bit: Attr.dim, code: 2 },
  { bit: Attr.italic, code: 3 },
  { bit: Attr.underline, code: 4 },
  { bit: Attr.blink, code: 5 },
  { bit: Attr.reverse, code: 7 },
  { bit: Attr.strike, code: 9 },
];

/** The SGR parameter list for a set attribute bitmask (empty when none set). */
function attrParams(attrs: AttrMask): number[] {
  const out: number[] = [];
  for (const { bit, code } of ATTR_SGR) {
    if ((attrs & bit) !== 0) out.push(code);
  }
  return out;
}

/**
 * The SGR parameter list for one color at `depth`. Empty for `'default'` or
 * `mono`. Throws `InvalidColorError` on a malformed color (via {@link toRgb}).
 */
function colorParams(color: Color, role: ColorRole, depth: ColorDepth): number[] {
  if (depth === 'mono') return [];
  const rgb = toRgb(color);
  if (!rgb) return []; // 'default' → terminal default (no SGR)
  const base = role === 'fg' ? 38 : 48;
  if (depth === 'truecolor') return [base, 2, rgb.r, rgb.g, rgb.b];
  if (depth === '256') return [base, 5, nearest256(rgb)];
  // depth === '16': 30–37/40–47 (normal) or 90–97/100–107 (bright)
  const idx = nearest16(rgb);
  if (role === 'fg') return [idx < 8 ? 30 + idx : 90 + (idx - 8)];
  return [idx < 8 ? 40 + idx : 100 + (idx - 8)];
}

/** Like {@link colorParams} but never throws — a malformed color yields `[]`. */
function colorParamsSafe(color: Color, role: ColorRole, depth: ColorDepth): number[] {
  try {
    return colorParams(color, role, depth);
  } catch (err) {
    if (err instanceof InvalidColorError) return []; // degrade (render-loop safety)
    throw err;
  }
}

/** Wrap an SGR parameter list in `CSI … m`, or `''` when empty. */
function sgr(params: readonly number[]): string {
  return params.length > 0 ? `${CSI}${params.join(';')}m` : '';
}

/**
 * Encode ONE color to a standalone SGR for the detected depth. [AR-13]
 *
 * truecolor → `38;2;r;g;b`/`48;2;r;g;b`; 256 → `38;5;n`/`48;5;n` (nearest); 16 →
 * `30–37`/`40–47`/`90–97`/`100–107` (nearest); `'default'` and `mono` → `''`.
 *
 * @param color The color to encode.
 * @param role `'fg'` or `'bg'` (selects the SGR base code).
 * @param depth The detected `caps.colorDepth`.
 * @returns The SGR sequence, or `''`.
 * @throws InvalidColorError when `color` is malformed (AC-6).
 */
export function encode(color: Color, role: ColorRole, depth: ColorDepth): string {
  return sgr(colorParams(color, role, depth));
}

/**
 * The `StyleEncoder` seam: merge attributes + fg + bg into ONE SGR. [AR-4]
 *
 * Crash-safe (AR-7): a malformed color degrades to no-color rather than throwing,
 * so the host render loop never crashes on bad cell data. At `mono` depth no
 * `38`/`48` is emitted but attributes still are (legibility — AC-4).
 *
 * @param fg Foreground color.
 * @param bg Background color.
 * @param attrs Attribute bitmask.
 * @param caps Capability profile (reads `colorDepth`).
 * @returns One merged SGR sequence, or `''` when nothing applies.
 */
export function encodeStyle(fg: Color, bg: Color, attrs: AttrMask, caps: CapabilityProfile): string {
  const params = [
    ...attrParams(attrs),
    ...colorParamsSafe(fg, 'fg', caps.colorDepth),
    ...colorParamsSafe(bg, 'bg', caps.colorDepth),
  ];
  return sgr(params);
}

/**
 * A stable per-cell style key for run-merging / caching. [AR-11]
 *
 * Two cells with the same fg/bg/attrs produce the same key; any difference
 * produces a different key. Cheap string concatenation.
 *
 * @param fg Foreground color.
 * @param bg Background color.
 * @param attrs Attribute bitmask.
 * @returns A stable key string.
 */
export function styleKey(fg: Color, bg: Color, attrs: AttrMask): string {
  return `${fg}|${bg}|${attrs}`;
}
