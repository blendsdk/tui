# Component: Geometry, DrawContext & Theming (`geometry.ts`, `draw-context.ts`, `theme-style.ts`)

> **Files**: `geometry.ts`, `draw-context.ts`, `theme-style.ts`
> **CodeOps Skills Version**: 2.0.0

The view-local paint surface. `DrawContext` is the **stateless**, auto-clipped facade handed to
`draw(ctx)`; it offsets view-local coords to absolute screen coords and clips to the view's rect
∩ its ancestors' rects, dropping out-of-clip writes (AR-39). All writes go through the single
shared core `ScreenBuffer` (AR-38) — RD-03 never emits raw escapes (AC-16).

## Geometry (`geometry.ts`, AR-37)

Reuses RD-02's public `Rect`/`Size2D`; adds:

```ts
interface Point { x: number; y: number; }
function intersect(a: Rect, b: Rect): Rect;        // overlap; empty (non-overlap) → {x,y,width:0,height:0}
function translate(r: Rect, dx: number, dy: number): Rect;
function contains(r: Rect, p: Point): boolean;     // half-open: x ≤ p.x < x+width, y ≤ p.y < y+height
```

Pure, no mutation, integer-in/integer-out. `intersect` is the clip primitive (view rect ∩
ancestor clip); a zero/negative result yields a zero-size rect (degenerate clip → no-op draws,
AC-17).

## `DrawContext` (`draw-context.ts`, AR-38/AR-39)

Built **per view per compose** by the render root from: the shared `ScreenBuffer`, the view's
absolute origin `(ox, oy)`, the absolute clip `Rect` (view rect ∩ ancestor clip), and the
active `Theme`.

```ts
interface DrawContext {
  text(x, y, str, style?): void;
  fillRect(x, y, w, h, char, style?): void;
  fill(char, style?): void;                 // = fillRect(0, 0, size.width, size.height, char, style)
  box(x, y, w, h, style?, title?): void;
  shadow(x, y, w, h, style?): void;
  color(role: ThemeRoleName): Style;
  readonly size: Size2D;                    // the view's content size = its bounds w/h
}
```

### Clipping & offset model

Every coordinate is **view-local** (origin = the view's top-left). Each writer:

1. Translates the target to absolute: `absX = ox + x`, `absY = oy + y`.
2. Intersects the write region with the absolute clip; cells outside are **dropped**.
3. Routes the surviving cells through `ScreenBuffer` (`set`/`text`/`fillRect`/`box`/`shadow`),
   which also drops anything past the screen edge (`inBounds`, `buffer.ts:110`) and applies
   `sanitize` on text (`buffer.ts:159`) — preserving the injection boundary (AC-16, AR-39).

- `text` clips horizontally per glyph (advancing by `charWidth`), so a partly-off run paints
  only its visible cells; wide glyphs straddling the clip edge are dropped whole (no half-glyph).
- `fillRect`/`fill` clip the rect to the clip ∩ buffer, then delegate to `ScreenBuffer.fillRect`.
- `box`/`shadow` translate + delegate; border cells outside the clip are dropped (the clip is
  applied to each emitted cell). For v1 these clip at the cell level like `text`.
- Out-of-clip and degenerate (zero/over-large) writes are **silent no-ops**, never throws (AC-17).

Stateless: no cursor; each call is fully specified by its args + the fixed (origin, clip, theme).
A stateful-cursor API was rejected (AR-39) for consistency with the buffer's x,y API.

## Theming adapter (`theme-style.ts`, AR-35/AR-45/PA-6)

```ts
type ThemeRoleName = keyof Theme;   // 'desktop'|'menuBar'|'menuSelected'|'window'|'dialog'|
                                    // 'button'|'buttonFocused'|'statusBar'|'shadow'
function themeRoleToStyle(role: ThemeRole): Style;   // { fg: role.fg, bg: role.bg }  (attrs unset)
```

`ctx.color(role)` = `themeRoleToStyle(theme[role])` — a pure lookup + adapter. Core `Style` is
`{fg, bg, attrs?}`; `ThemeRole` is `{fg, bg, hotkey?}` (+ `border`/`title`/`pattern` on some
roles). The adapter maps `fg`/`bg` and **ignores** the role-only extras (`hotkey`/`border`/
`title`/`pattern`) — those are RD-05 chrome concerns (PA-6). The widget owns role selection from
its state (`this.focused ? 'buttonFocused' : 'button'`); RD-03 only resolves names (AR-35).

The active theme is threaded through `DrawContext` so a future **per-`Group` override** is a
non-breaking addition (the seam, AR-35) — v1 ships one app theme on the render root.

## Invariants (asserted by tests)

- Local `(0,0)` lands at the view's absolute origin; a write at/after the view's far edge, or
  outside an ancestor's rect, paints **nothing** into a neighbor (AC-4).
- `ctx.color('button')`/`ctx.color('buttonFocused')` equal `themeRoleToStyle(defaultTheme.button)`
  / `…buttonFocused` (AC-13).
- No `DrawContext` method writes to a stream or emits an escape sequence — all output is buffer
  cells (AC-16).
- Degenerate geometry → clipped no-ops, no throw (AC-17).

## Traceability

AR-35, AR-37, AR-38, AR-39, AR-45 · PA-6. ACs: 4, 13, 16 (+ 17 clip, 6 fill).
