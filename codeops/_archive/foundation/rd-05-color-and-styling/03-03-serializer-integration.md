# Serializer Integration: RD-05

> **Document**: 03-03-serializer-integration.md
> **Parent**: [Index](00-index.md)
> **Files**: `src/engine/render/serialize.ts`, `src/engine/index.ts`, `test/render-serialize.impl.test.ts`

## Overview

Make the depth-aware `encodeStyle` the `serialize()` default, replacing the
provisional truecolor-only `defaultEncodeStyle` (AR-3). The `StyleEncoder` seam and
`RenderOptions` are unchanged, so any app injecting a custom encoder is unaffected;
only the *default* behavior gains downsampling. *(AR-3, AR-4)*

## Current Architecture

`serialize()` (`serialize.ts:142`) defaults `encodeStyle` to the local
`defaultEncodeStyle` (`serialize.ts:144`), which over-emits 24-bit truecolor at
every non-mono depth and silently ignores malformed colors. The color tables
(`ANSI16_RGB` `serialize.ts:49`), the parser (`colorToRgb` `serialize.ts:80`), and
`ATTR_SGR` (`serialize.ts:69`) live inline in the serializer.

## Proposed Changes

1. **Move** the color logic out of `serialize.ts` into `color/` (03-01): the
   reference RGB → `palette.ts`, parsing → `color.ts`, attribute/SGR composition →
   `encode.ts`. Remove the now-duplicated `ANSI16_RGB`/`colorToRgb`/`ATTR_SGR` from
   `serialize.ts` (DRY / no dead code).
2. **Re-point the default**: `serialize.ts` imports `encodeStyle` from
   `../color/index.js` and `defaultEncodeStyle` becomes that depth-aware function
   (either `export { encodeStyle as defaultEncodeStyle }` re-export, or a thin
   wrapper). The public `defaultEncodeStyle` symbol from `render/index.ts` stays
   exported (now depth-aware) so no public export is removed.
3. **Keep the seam**: `StyleEncoder`, `RenderOptions`, and
   `serialize(current, previous, options)` signatures are untouched (AR-4). An
   app-supplied `options.encodeStyle` still wins.

### Avoiding a circular import

`color/encode.ts` imports `CSI` from `render/ansi.js` and types from
`render/types.js`; `render/serialize.ts` imports `encodeStyle` from `color/`. This
is acyclic: `color/` → `render/ansi.js` + `render/types.js` (leaf modules, no
back-import), and `render/serialize.ts` → `color/`. `serialize.ts` must import the
encoder from `color/` (not from `render/index.js`) to avoid a barrel cycle.

## RD-04 test impact

- **Spec oracles stay green:** `render-serialize.spec.test.ts:115-131` run at
  `colorDepth:'truecolor'`, where the depth-aware encoder emits the same
  `38;2;r;g;b` — unchanged.
- **One impl test updates (AR-3):** `render-serialize.impl.test.ts:95-96` asserts
  the provisional over-emit (`38;2;255;0;0` for brightRed at `colorDepth:'256'`).
  Under RD-05 that cell downsamples to `38;5;9` (brightRed → 256 index 9). Update
  the assertion to expect the downsampled `38;5;9` and re-title the test to reflect
  the now-correct behavior. This is the only RD-04 test change.
- **Mono impl test stays green:** `render-serialize.impl.test.ts:66` (mono emits no
  `38;2`) still holds — the depth-aware encoder emits no color at `mono`.

## `index.ts` (public entry point)

Add an RD-05 `color/` re-export block: `encode`, `encodeStyle`, `styleKey`,
`nearest256`, `nearest16`, `InvalidColorError`, `PALETTE`, `defaultTheme`, and the
`Theme`/`ThemeRole`/`Rgb`/`ColorRole` types. `defaultEncodeStyle` remains exported
from the render block (now depth-aware).

## Error Handling

| Case | Strategy | AR |
| ---- | -------- | -- |
| A cell carries a malformed color during `serialize()` | `encodeStyle` degrades that color to no-color; the frame still renders (crash-safe loop) | AR-7 |
| An app injects a custom `encodeStyle` | Honored unchanged (seam untouched) | AR-4 |
| A lingering import of the removed inline tables | Build/typecheck fails (no dead code left) | AR-3 |

## Testing Requirements

- ST-17: `serialize()` at `colorDepth:'256'` downsamples a brightRed cell to
  `38;5;9`; at `truecolor` still emits `38;2;255;0;0` (RD-04 oracle preserved).
- The full RD-04 suite stays green except the one deliberately-updated impl test.
