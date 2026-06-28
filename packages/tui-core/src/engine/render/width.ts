/**
 * Display-width of a Unicode code point (RD-04, AC-2, plan doc 03-01, PL-10).
 *
 * This module is the single source of width truth for the renderer: the buffer
 * advances the cursor by these widths so wide CJK/emoji occupy two columns and
 * combining marks occupy none. The ranges are derived from the Unicode
 * East-Asian Width property (`EastAsianWidth.txt`): `W`/`F` → 2, `A` → 2 only
 * under `widthMode: 'ambiguous-wide'`, combining/zero-width → 0, else 1.
 *
 * It is pure and capability-free: callers pass `caps.unicode.widthMode`.
 */

/**
 * Width-resolution mode. Mirrors `UnicodeCaps['widthMode']` from RD-02; declared
 * here so this module stays dependency-free. `'ambiguous-wide'` renders the
 * East-Asian Ambiguous (`A`) range as width 2 (CJK-context terminals).
 */
export type WidthMode = 'wcwidth' | 'ambiguous-wide';

/** An inclusive `[lo, hi]` code-point range. Tables below are sorted by `lo`. */
type Range = readonly [number, number];

/**
 * Zero-width code points: combining marks and explicit zero-width characters.
 * A documented core subset — enough for AC-2 and common scripts; not the full
 * Unicode `Mn`/`Me` set. Sorted ascending by `lo`.
 */
const ZERO_WIDTH: readonly Range[] = [
  [0x0300, 0x036f], // Combining Diacritical Marks
  [0x0483, 0x0489], // Cyrillic combining
  [0x0591, 0x05bd], // Hebrew points
  [0x05bf, 0x05bf],
  [0x0610, 0x061a], // Arabic
  [0x064b, 0x065f], // Arabic
  [0x0670, 0x0670],
  [0x06d6, 0x06dc], // Arabic
  [0x0e31, 0x0e31], // Thai
  [0x0e34, 0x0e3a],
  [0x200b, 0x200f], // Zero-width space / ZWNJ / ZWJ / directional marks
  [0xfeff, 0xfeff], // Zero-width no-break space (BOM)
];

/**
 * East-Asian Wide (`W`) and Fullwidth (`F`) ranges, plus wide emoji. Each entry
 * cites its Unicode block. Notably excludes `U+4DC0–4DFF` (Yijing Hexagrams,
 * narrow) so the `U+4DFF`/`U+4E00` boundary resolves correctly. Sorted by `lo`.
 */
const WIDE: readonly Range[] = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2329, 0x232a], // Angle brackets 〈 〉
  [0x2600, 0x26ff], // Miscellaneous Symbols (emoji presentation, PL-10)
  [0x2e80, 0x303e], // CJK Radicals .. Kangxi .. CJK Symbols & Punctuation
  [0x3041, 0x33ff], // Hiragana .. Katakana .. CJK Compatibility
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa4cf], // Yi Syllables / Radicals
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe10, 0xfe19], // Vertical Forms
  [0xfe30, 0xfe6f], // CJK Compatibility Forms / Small Form Variants
  [0xff00, 0xff60], // Fullwidth Forms
  [0xffe0, 0xffe6], // Fullwidth signs
  [0x1f300, 0x1faff], // Emoji: Misc Symbols & Pictographs .. Extended-A
  [0x20000, 0x3fffd], // CJK Unified Ideographs Extension B+ (supplementary)
];

/**
 * East-Asian Ambiguous (`A`) ranges — width 2 only under `'ambiguous-wide'`.
 * A documented common subset (covers Latin-1 symbols, general punctuation,
 * arrows, Roman numerals); not the exhaustive `A` table. Sorted by `lo`.
 */
const AMBIGUOUS: readonly Range[] = [
  [0x00a1, 0x00a1], // ¡
  [0x00a4, 0x00a4],
  [0x00a7, 0x00a8],
  [0x00aa, 0x00aa],
  [0x00ad, 0x00ae],
  [0x00b0, 0x00b4],
  [0x00b6, 0x00ba],
  [0x00bc, 0x00bf],
  [0x2018, 0x2019], // ‘ ’
  [0x201c, 0x201d], // “ ”
  [0x2020, 0x2022],
  [0x2025, 0x2027],
  [0x2030, 0x2030],
  [0x2032, 0x2033],
  [0x203b, 0x203b],
  [0x2103, 0x2103], // ℃
  [0x2160, 0x216b], // Roman numerals Ⅰ..Ⅻ
  [0x2170, 0x2179],
  [0x2190, 0x2199], // Arrows
  [0x21d2, 0x21d2],
  [0x21d4, 0x21d4],
];

/** True when `cp` falls inside one of the sorted, non-overlapping `ranges`. */
function inRanges(cp: number, ranges: readonly Range[]): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = ranges[mid];
    if (cp < start) hi = mid - 1;
    else if (cp > end) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Display width of a Unicode code point.
 *
 * @param codepoint The code point (e.g. from `String.prototype.codePointAt`).
 * @param widthMode From `caps.unicode.widthMode`; `'ambiguous-wide'` widens
 *   East-Asian Ambiguous characters to 2.
 * @returns 0 (C0/C1 control, combining, or zero-width), 2 (East-Asian Wide /
 *   Fullwidth / wide emoji, or Ambiguous under `'ambiguous-wide'`), else 1.
 */
export function charWidth(codepoint: number, widthMode: WidthMode): 0 | 1 | 2 {
  // C0 (incl. NUL) and C1 controls have no advance.
  if (codepoint < 0x20 || (codepoint >= 0x7f && codepoint < 0xa0)) return 0;
  if (inRanges(codepoint, ZERO_WIDTH)) return 0;
  if (inRanges(codepoint, WIDE)) return 2;
  if (widthMode === 'ambiguous-wide' && inRanges(codepoint, AMBIGUOUS)) return 2;
  return 1;
}
