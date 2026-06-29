# Color Encoding Core: RD-05

> **Document**: 03-01-color-encoding.md
> **Parent**: [Index](00-index.md)
> **Files**: `src/engine/color/{color,palette,downsample,encode}.ts`

## Overview

The encoding core: parse/validate a `Color`, downsample its RGB to the detected
depth (redmean nearest), and emit SGR. Three public entry points — `encode()` (one
color → standalone SGR), `encodeStyle()` (the merged `StyleEncoder` seam), and
`styleKey()` — plus the exported `nearest256`/`nearest16` primitives and
`InvalidColorError`. *(AR-3…AR-8, AR-11, AR-13, AR-14)*

## `color.ts` — parsing, validation, errors

```ts
import type { Color, Ansi16Name } from '../render/types.js';
import { TuiError } from '../safety/errors.js';

/** RGB components, each an integer 0–255. */
export interface Rgb { readonly r: number; readonly g: number; readonly b: number; }

/** Thrown when a color string is not a valid #rgb/#rrggbb/named/default value. [AR-8] */
export class InvalidColorError extends TuiError {}

/**
 * Validate + parse a Color to RGB. Returns `null` for `'default'` (no RGB; the
 * terminal default). Throws InvalidColorError for malformed input — never returns
 * a partial value, so malformed colors cannot leak into the SGR stream. [AR-7]
 *
 * Accepts: `'default'`; a named ANSI-16 color (membership-checked); `#rgb` /
 * `#rrggbb` (hex-digit-checked). Anything else throws.
 */
export function toRgb(color: Color): Rgb | null;
```

- `default` → `null`.
- Named color → its reference RGB from `palette.ts` (`ANSI16_REFERENCE`).
- `#rgb` → expand each nibble (`#abc` → `#aabbcc`); `#rrggbb` → parse. Validate with
  `/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/`; on failure throw `InvalidColorError`.
- Any other string (e.g. `'rgb(1,2,3)'`, `'#zzz'`, an unknown name) throws
  `InvalidColorError` (AC-6).

## `palette.ts` — reference tables (+ DOS-16, see 03-02)

```ts
import type { Ansi16Name } from '../render/types.js';
import type { Rgb } from './color.js';

/** The 16 named ANSI colors as reference RGB (the existing xterm-ish palette). */
export const ANSI16_REFERENCE: Readonly<Record<Ansi16Name, Rgb>>;

/** The 6 cube levels and 24 gray levels used to build the xterm-256 reference. */
// cube level for component step i (0..5): [0,95,135,175,215,255]
// gray level for step k (0..23): 8 + 10*k  → indices 232..255
/** Reference RGB for xterm-256 index n (0..255): base 16 | cube | gray. */
export function rgb256(index: number): Rgb;
```

`ANSI16_REFERENCE` carries the **same** RGB values RD-04 used (`serialize.ts:49`)
so nearest-16 and the 256 base colors agree. The 16th name (`brightMagenta`) is
included (the prototype omitted it).

## `downsample.ts` — redmean nearest mapping [AR-5, AR-6]

```ts
import type { Rgb } from './color.js';

/** Redmean weighted squared distance between two colors (no sqrt needed). */
// rmean = (a.r + b.r) / 2
// d² = (2 + rmean/256)·dr² + 4·dg² + (2 + (255-rmean)/256)·db²
export function redmean2(a: Rgb, b: Rgb): number;

/** Nearest xterm-256 index (0..255) to `rgb`; ties resolve to the lowest index. */
export function nearest256(rgb: Rgb): number;

/** Nearest ANSI-16 index (0..15) to `rgb`; ties resolve to the lowest index. */
export function nearest16(rgb: Rgb): number;
```

- `nearest256` scans indices 0..255 (`rgb256(n)`), keeps the min `redmean2`; on a
  tie keeps the **lower** index. So `#000000`→0 (not cube 16), `#ffffff`→15 (not
  cube 231) — corners exact (AC-5).
- `nearest16` scans the 16 `ANSI16_REFERENCE` values in `Ansi16Name` order, same
  tie rule. Index 0..7 = normal, 8..15 = bright.

## `encode.ts` — `encode`, `encodeStyle`, `styleKey`

```ts
import { CSI } from '../render/ansi.js';
import type { Color, AttrMask, CapabilityProfile, ColorDepth } from '...';
import { Attr } from '../render/types.js';
import { toRgb } from './color.js';
import { nearest16, nearest256 } from './downsample.js';

export type ColorRole = 'fg' | 'bg';

/**
 * Encode ONE color to a standalone SGR for `depth`. Throws InvalidColorError on a
 * malformed color (AC-6). `'default'` and `mono` depth → `''`. [AR-7, AR-13]
 *
 * truecolor → `38;2;r;g;b` / `48;2;r;g;b`
 * 256       → `38;5;n` / `48;5;n`  (n = nearest256)
 * 16        → fg 30–37/90–97, bg 40–47/100–107  (nearest16)
 */
export function encode(color: Color, role: ColorRole, depth: ColorDepth): string;

/**
 * The StyleEncoder seam: merge attrs + fg + bg into ONE SGR (AR-4). Crash-safe —
 * a malformed color degrades to no-color rather than throwing (AR-7), so the host
 * render loop never crashes. Attribute order: bold,dim,italic,underline,blink,
 * reverse,strike (the RD-04 ATTR_SGR order). mono → no 38/48 (attrs still emit).
 */
export function encodeStyle(fg: Color, bg: Color, attrs: AttrMask, caps: CapabilityProfile): string;

/** A stable per-cell style key for run-merging / caching. [AR-11] */
export function styleKey(fg: Color, bg: Color, attrs: AttrMask): string; // `${fg}|${bg}|${attrs}`
```

### SGR parameter rules

- **Attributes** (shared helper `attrParams(attrs): number[]`): for each
  `{bit, code}` in `[bold:1, dim:2, italic:3, underline:4, blink:5, reverse:7,
  strike:9]`, push `code` when the bit is set.
- **Color params** (`colorParams(color, role, depth): number[]`): `default`/`mono`
  → `[]`; truecolor → `[role===fg?38:48, 2, r, g, b]`; 256 → `[role?38:48, 5, n]`;
  16 → fg `[idx<8 ? 30+idx : 90+(idx-8)]`, bg `[idx<8 ? 40+idx : 100+(idx-8)]`.
- `encode` = wrap `colorParams` in `${CSI}…m` (or `''` when empty).
- `encodeStyle` = `attrParams ++ colorParams(fg) ++ colorParams(bg)` (catching
  `InvalidColorError` per color → treat as `[]`), wrapped once in `${CSI}…m` (or
  `''` when empty).

## Code Examples (documented oracles — see ST cases)

```ts
encode('#0000a8', 'bg', 'truecolor'); // '\x1b[48;2;0;0;168m'
encode('#0000a8', 'bg', '256');       // '\x1b[48;5;19m'   (cube (0,0,175) = index 19)
encode('#0000a8', 'bg', '16');        // '\x1b[44m'        (nearest16 = blue, idx 4)
encode('#0000a8', 'bg', 'mono');      // ''
encode('#000000', 'fg', '256');       // '\x1b[38;5;0m'    (corner exact)
encode('#ffffff', 'fg', '16');        // '\x1b[97m'        (idx 15 → 90+7)
encodeStyle('default','default', Attr.bold|Attr.underline, anyCaps); // '\x1b[1;4m'
encodeStyle('#f00','#00f', Attr.reverse, monoCaps);                  // '\x1b[7m'
encode('#zzz', 'fg', 'truecolor');    // throws InvalidColorError
```

## Error Handling

| Case | Strategy | AR |
| ---- | -------- | -- |
| Malformed color into `encode()` | Throw `InvalidColorError` (extends `TuiError`); emit no bytes | AR-7, AR-8 |
| Malformed color into `encodeStyle()` (render path) | Catch internally → that color contributes no params (degrade); never throw | AR-7 |
| `default` color / `mono` depth | `[]` params → `''` (terminal default via the run's `SGR_RESET`) | AR-13 |
| Tie in nearest mapping | Resolve to the **lower** index (corners exact) | AR-6 |

## Testing Requirements

Unit: every depth × role for `encode`; the redmean vector table for
`nearest256`/`nearest16`; attribute composition; mono legibility; the throw +
crash-safe-degrade pair; `styleKey` stability. See `07-testing-strategy.md`.
