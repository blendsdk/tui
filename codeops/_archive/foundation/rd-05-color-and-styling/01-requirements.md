# Requirements: RD-05 Color & Styling

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-05](../../requirements/RD-05-color-and-styling.md)

## Feature Summary

A new `src/engine/color/` subsystem that encodes app-specified colors and text
attributes into the correct ANSI SGR for the detected terminal depth, validates
color input, and provides the DOS-16 palette + semantic theme primitives. It fills
the RD-04 `StyleEncoder` seam and becomes the `serialize()` default encoder.

## In Scope

- **`Color` parsing/validation** — `#rgb`, `#rrggbb`, the 16 named ANSI colors, and
  `default`; malformed input throws `InvalidColorError` (AR-7, AR-8). *(Must)*
- **Depth-aware encoding** driven by `caps.colorDepth` (AR-3): `truecolor` →
  `38;2;r;g;b`/`48;2;r;g;b`; `256` → `38;5;n`/`48;5;n` (nearest); `16` →
  `30–37`/`40–47`/`90–97`/`100–107` (nearest); `mono` → no color SGR. *(Must)*
- **Nearest-color mapping** — `nearest256(rgb)` and `nearest16(rgb)`, deterministic
  redmean weighted distance, ties → lowest index, corners exact (AR-5, AR-6, AR-14). *(Must)*
- **Text attributes** — `bold|dim|italic|underline|blink|reverse|strike` composed
  into the SGR parameter list (reuses RD-04's `Attr` bits). *(Must)*
- **Mono legibility** — at `mono` depth emit no `38`/`48`, but still emit attributes
  (reverse/bold convey state). *(Must)*
- **DOS-16 `PALETTE`** constants + a typed `Theme` structure with the migrated
  semantic roles + a default theme (AR-9). *(Must)*
- **`styleKey(fg, bg, attrs)`** — a stable per-cell style key for run-merging /
  caching (AR-11). *(Must)*
- **Composed `encodeStyle`** — the `StyleEncoder`-shaped function (fg + bg + attrs →
  one merged SGR, AR-4); becomes the `serialize()` default (AR-3); crash-safe on
  malformed color (AR-7). *(Must)*
- **`encode(color, role, depth)`** — the granular public primitive returning a
  standalone SGR (AC-1); `encode('default', …)` → `''` (AR-13). *(Must)*

## Out of Scope

- **Attribute fallback** gated on capability (italic→reverse) — deferred (DEF-1,
  AR-10); no capability field models per-attribute support.
- **Hierarchical Turbo Vision palette inheritance** (view-tree color mapping) — UI
  layer (RD-05 Won't-Have).
- **Color rendering / buffer composition** — RD-04.
- **BOX/BLOCK glyph constants** from the prototype `theme.ts` — RD-04 glyph concern,
  not color (AR-9).
- **Relocating `Color`/`Attr` types** out of `render/types.ts` (AR-2).

## Public API surface (re-exported from `@blendsdk/tui`)

| Symbol | Kind | Source |
| ------ | ---- | ------ |
| `encode(color, role, depth)` | fn | `color/encode.ts` |
| `encodeStyle(fg, bg, attrs, caps)` | fn (`StyleEncoder`) | `color/encode.ts` |
| `styleKey(fg, bg, attrs)` | fn | `color/encode.ts` |
| `nearest256(rgb)` / `nearest16(rgb)` | fn | `color/downsample.ts` |
| `InvalidColorError` | class | `color/color.ts` |
| `PALETTE` | const | `color/palette.ts` |
| `defaultTheme` | const | `color/theme.ts` |
| `Theme`, `Rgb`, `ColorRole` | type | `color/*` |

`Color`, `Ansi16Name`, `Attr`, `AttrMask`, `Style` remain exported from
`render/index.ts` as today (AR-2). `StyleEncoder`/`RenderOptions` stay in
`render/serialize.ts`.

## Dependencies

- **RD-02** — `CapabilityProfile.colorDepth`, `ColorDepth`.
- **RD-04** — `Color`/`Ansi16Name`/`Attr`/`AttrMask` types, the `StyleEncoder` seam,
  `serialize`/`RenderOptions`.
- **RD-08** — `TuiError` (base for `InvalidColorError`).

## Success Criteria

All seven RD-05 acceptance criteria (AC-1…AC-7) pass as specification tests
(ST-1…ST-17 in `07-testing-strategy.md`); RD-02/RD-04/RD-06/RD-07/RD-08 suites stay
green; `npm run verify` + lint + check:deps + audit clean.
