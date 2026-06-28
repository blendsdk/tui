/**
 * Nearest-color downsampling via redmean weighted distance (RD-05; AR-5, AR-6).
 *
 * `nearest256`/`nearest16` find the closest palette entry to an RGB color, used
 * when the terminal depth is 256 or 16. The metric is the redmean approximation
 * (a low-cost perceptual distance); selection is on squared distance (no sqrt),
 * and ties resolve to the **lowest index** so corner colors (pure black/white)
 * map exactly (AC-5).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution
 * (it resolves to the `.ts` source during development via tsx).
 */
import type { Rgb } from './color.js';

import { ANSI16_ORDER, ANSI16_REFERENCE, rgb256 } from './palette.js';

/**
 * Redmean weighted **squared** distance between two colors. Larger when more
 * perceptually different; comparable directly (no sqrt needed).
 *
 * `rmean = (a.r+b.r)/2`,
 * `d² = (2 + rmean/256)·Δr² + 4·Δg² + (2 + (255-rmean)/256)·Δb²`.
 *
 * @param a One color.
 * @param b The other color.
 * @returns The squared redmean distance (≥ 0).
 */
export function redmean2(a: Rgb, b: Rgb): number {
  const rmean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db;
}

/**
 * Nearest xterm-256 palette index (0–255) to `rgb`.
 *
 * Scans all 256 reference entries; on a distance tie keeps the lower index, so
 * `#000000`→0 and `#ffffff`→15 are exact rather than mapping to the cube. [AR-6]
 *
 * @param rgb The source color.
 * @returns The nearest palette index 0–255.
 */
export function nearest256(rgb: Rgb): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < 256; index += 1) {
    const distance = redmean2(rgb, rgb256(index));
    // Strict `<` keeps the first (lowest) index on a tie.
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/**
 * Nearest ANSI-16 palette index (0–15) to `rgb` (0–7 normal, 8–15 bright).
 *
 * Same lowest-index tie rule as {@link nearest256}. [AR-6]
 *
 * @param rgb The source color.
 * @returns The nearest ANSI-16 index 0–15.
 */
export function nearest16(rgb: Rgb): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < ANSI16_ORDER.length; index += 1) {
    const distance = redmean2(rgb, ANSI16_REFERENCE[ANSI16_ORDER[index]]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}
