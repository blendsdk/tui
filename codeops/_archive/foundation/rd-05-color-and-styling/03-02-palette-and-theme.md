# Palette & Theme: RD-05

> **Document**: 03-02-palette-and-theme.md
> **Parent**: [Index](00-index.md)
> **Files**: `src/engine/color/palette.ts` (DOS-16), `src/engine/color/theme.ts`

## Overview

The app-facing color primitives the Turbo Vision look needs: the DOS-16 `PALETTE`
hex constants and a typed `Theme` structure with the migrated semantic roles + a
default theme. Migrated from the prototype `theme.ts`, excluding BOX/BLOCK glyphs
(RD-04 concern) and any inheritance logic (Won't-Have). *(AR-9)*

> **Note:** `palette.ts` also holds the encoding **reference** tables
> (`ANSI16_REFERENCE`, `rgb256`) from 03-01 — those are internal downsampling data.
> The `PALETTE`/`Theme` below are the app-facing constants. Both are "color data,"
> kept in the same data module.

## `PALETTE` — the Borland DOS-16 palette

The full 16-color DOS palette as `#rrggbb` constants (the prototype's 15 + the
missing `brightMagenta`):

```ts
export const PALETTE = {
  black: '#000000',
  blue: '#0000aa',
  green: '#00aa00',
  cyan: '#00aaaa',
  red: '#aa0000',
  magenta: '#aa00aa',
  brown: '#aa5500',
  lightGray: '#aaaaaa',
  darkGray: '#555555',
  brightBlue: '#5555ff',
  brightGreen: '#55ff55',
  brightCyan: '#55ffff',
  brightRed: '#ff5555',
  brightMagenta: '#ff55ff', // added — the prototype omitted it (AR-9)
  yellow: '#ffff55',
  white: '#ffffff',
} as const satisfies Record<string, Color>;
```

Values are taken verbatim from the prototype (`theme.ts:10-26`); `brightMagenta`
follows the DOS convention (`#ff55ff`). Each is a valid `Color` (so it round-trips
through `encode`).

## `Theme` — typed semantic roles

```ts
import type { Color } from '../render/types.js';

/** A foreground/background pair (+ optional hotkey accent) for a UI surface. */
export interface ThemeRole {
  readonly fg: Color;
  readonly bg: Color;
  readonly hotkey?: Color;
}

/** Named semantic roles → colors. A data primitive for the future UI layer (not the UI). */
export interface Theme {
  readonly desktop: ThemeRole & { readonly pattern: string };
  readonly menuBar: ThemeRole;
  readonly menuSelected: ThemeRole;
  readonly window: ThemeRole & { readonly border: Color; readonly title: Color };
  readonly dialog: ThemeRole & { readonly border: Color; readonly title: Color };
  readonly button: ThemeRole;
  readonly buttonFocused: ThemeRole;
  readonly statusBar: ThemeRole;
  readonly shadow: ThemeRole;
}

/** The classic Borland look, migrated from the prototype THEME (theme.ts:32-56). */
export const defaultTheme: Theme;
```

`defaultTheme` carries the prototype's role values verbatim (e.g. `desktop`:
`{ pattern:'░', fg: PALETTE.lightGray, bg: '#0000a8' }`; `menuBar`:
`{ fg: PALETTE.black, bg: PALETTE.lightGray, hotkey: PALETTE.red }`; etc.). Roles
are **data only** — no view-tree mapping, no inheritance (Won't-Have). The
prototype's `menuBarActive`/`menuDropdown`/`buttonShadow` extras are folded into the
roles above or dropped where purely UI-incidental; the migrated set is the one
declared in `Theme`.

## Integration Points

- **`encode`/`encodeStyle`** — `PALETTE` values are ordinary `Color`s; they encode
  through the same path. No special-casing.
- **`render/types.ts`** — `Color` is imported (type-only) for `ThemeRole` (AR-2).
- **`index.ts`** — re-exports `PALETTE`, `defaultTheme`, and the `Theme`/`ThemeRole`
  types.

## Error Handling

| Case | Strategy |
| ---- | -------- |
| A palette value is malformed | Compile-time `satisfies Record<string, Color>` + a spec test asserting each entry encodes without throwing |
| A consumer mutates `PALETTE`/`defaultTheme` | `as const` / `readonly` — compile-time immutable |

## Testing Requirements

Unit: `PALETTE` has all 16 keys at the documented hex; every value parses via
`toRgb` without throwing; `defaultTheme` exposes the declared roles wired to palette
colors. See `07-testing-strategy.md` (ST-15, ST-16).
