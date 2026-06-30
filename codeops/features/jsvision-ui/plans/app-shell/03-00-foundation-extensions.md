# Foundation Extensions (Phase 0): App Shell

> **Document**: 03-00-foundation-extensions.md
> **Parent**: [Index](00-index.md)
> **Resolves**: PF-01 (critical), PF-02, PF-03, PF-06 — see [00-preflight-report.md](00-preflight-report.md)
> **Decision record**: [00-pf01-scope-addition.md](00-pf01-scope-addition.md) · PA-15…PA-17

## Overview

The window manager, the menu overlay, and the frame chrome need three capabilities the RD-02/RD-03
foundation does **not** provide today. RD-05 preflight confirmed (independent challenger) that without
them Phase 3/4 cannot be built: `reflow()` runs one global flex `layout()` and overwrites **every**
`view.bounds` (`view/reflow.ts:30-33`), and `layout()` is pure flex with no overlap or per-child
placement (`layout/layout.ts:59-89`) — so directly-set window geometry is clobbered, overlapping
windows are inexpressible, and a full-viewport overlay cannot exist. Phase 0 lands these foundation
extensions (spec-first) **before** Phase 1, so every later phase builds on a real surface.

This adds **two additive intra-package (`packages/ui`) contract extensions**: RD-02 `LayoutProps`
(absolute placement) and RD-03 `DrawContext` (`role()` accessor). Both are additive and pure; zero
runtime deps; the loop is still composed, not re-shaped. They are **not** cross-package — AC-21's
"only cross-package edit = `windowInactive`" still holds.

## Part A — RD-02 absolute placement (PA-15) — resolves PF-01, PF-02, PF-06

An absolutely-placed child is removed from its parent's flex flow and positioned at an explicit,
content-box-relative rect; its own children still flow inside that rect (the CSS `position:absolute`
analogy). One primitive unblocks free-floating windows (PF-01), the menu overlay (PF-02), and — via
the overlay — click-outside close (PF-06). `reflow.ts` needs **no** change (it already writes back
every rect `layout()` returns).

### API (`packages/ui/src/layout/types.ts`, additive)

```ts
export interface LayoutProps {
  // … existing: direction, size, justify, align, gap, padding …
  /** Placement mode. 'flow' (default) joins the parent's flex flow; 'absolute' is removed from
   *  flow and placed at `rect` within the parent's content box. */
  position?: 'flow' | 'absolute';
  /** position:'absolute' only — the parent-content-relative rect in cells (each side clamped ≥0
   *  via `toCells`); ignored for 'flow'. */
  rect?: Rect;
}
```
`normalizeProps` defaults `position:'flow'`; `ResolvedProps` carries the normalized `position` + an
optional normalized `rect`.

### Behavior (`packages/ui/src/layout/layout.ts`, localized to `layoutContainer`)

1. Partition `box.children` into **flow** vs **absolute** by `position`.
2. `solveMainSizes`/`mainAxisOffsets`/`crossPlacement` run over the **flow subset only** (absolute
   children consume no main-axis space and never shift flow siblings).
3. Each **absolute** child: `childRect = { x: content.x + rect.x, y: content.y + rect.y, width:
   rect.width, height: rect.height }`; `result.set(child, childRect)`; then
   `layoutContainer(child, { width: rect.width, height: rect.height }, result)` so its interior flows (padding honored).
4. Z-order is unchanged — paint order is `children` array order (`render-root.ts:81-93`), so a
   later-in-array absolute child paints on top.

Mixed flow+absolute is required (the app root) and supported.

### WM usage — mutate the layout rect, not `bounds`

| Gesture | Was (clobbered) | Now |
|---|---|---|
| drag-move | `w.bounds.x/y = …` | `w.layout.rect = { …, x, y }` + `invalidateLayout()` |
| resize | `w.bounds.w/h = …` | `w.layout.rect.{width,height} = …` |
| zoom | `w.bounds = desktop` | `w.layout.rect = desktopRect` (restore: saved rect) |
| cascade/tile | per-window `bounds` | per-window `w.layout.rect` |

After reflow `w.bounds === w.layout.rect`; a later terminal resize or any other reflow **re-honors**
the rect. Windows overlap freely; the `Desktop` holds only absolute children. Content re-insets
(`padding:1`) within the window rect. Satisfies ST-06…ST-11.

### Overlay usage (PF-02)

App root children: `[menuBar (flow, h=1), desktop (flow, fr:1), statusLine (flow, h=1), overlay
(absolute, rect = full viewport)]`. The overlay overlays the whole screen, paints last (top-z), and
hosts popups at absolute rects — PA-2's intent, now realizable.

## Part B — RD-03 raw theme-role access (PA-16) — resolves PF-03

`DrawContext.color(role)` returns `{fg,bg}` only (`view/theme-style.ts:15-17`), dropping the
role-only extras the chrome needs. Add a typed raw-role accessor:

```ts
// packages/ui/src/view/types.ts (DrawContext), additive
role<K extends ThemeRoleName>(name: K): Theme[K];
```
`draw-context.ts`: `role: (name) => theme[name]` (the generic `K` keeps `ctx.role('desktop').pattern`
type-safe — no cast). Consumers:
- **`Desktop.draw(ctx)`** overrides `Group.draw` (which space-fills, `group.ts:38-42`) to fill the
  pattern: `ctx.fill(ctx.role('desktop').pattern, ctx.color('desktop'))` → ST-06 passes.
- **`drawFrame`** reads `ctx.role(role).border` / `.title` for the border + title colors → AR-73/PA-1
  becomes real (active vs `windowInactive` differ in border/title, not just fg).

## Part C — Spec oracles (PA-17) — written + RED before implementation

| Oracle | Asserts | File |
|---|---|---|
| FX-01 | An `absolute` child is placed at its `rect` regardless of siblings; flow siblings reserve **no** space for it. | `layout.absolute.spec.test.ts` |
| FX-02 | Two `absolute` children may overlap; both keep their full rects. | `layout.absolute.spec.test.ts` |
| FX-03 | An `absolute` child's own children flow within its rect (padding honored). | `layout.absolute.spec.test.ts` |
| FX-04 | Re-running `layout()` (resize) re-honors each `absolute` rect (no flex snap-back). | `layout.absolute.spec.test.ts` |
| FX-05 | `DrawContext.role('desktop').pattern` / `role('window').border` return the role extras. | `view.drawcontext-role.spec.test.ts` |

Impl tests: absolute-rect clamping/normalization (negative/non-finite → clamp); mixed flow+absolute
container; `role()` resolves for every `ThemeRoleName`.

## Integration Points
- **RD-02 `layout`/`reflow`:** absolute placement is a localized `layoutContainer` change; `reflow.ts`
  unchanged.
- **RD-03 `DrawContext`/`Group`:** the `role()` accessor + a `Desktop.draw` override.
- **Phase 1+:** the WM (03-02/03-03), overlay (03-01), and menus (03-04) consume these.

## Error Handling

| Error Case | Handling | Ref |
|---|---|---|
| `position:'absolute'` with no `rect` | Treat as `rect = {0,0,0,0}` (degenerate, zero-size, no throw) | PA-15 |
| `rect` with negative / non-finite sides | Clamp each via `toCells` (consistent with existing RD-02) | PA-15 |
| Absolute child larger than parent | Allowed (overflow, consistent with RD-02 AR-28); clipped at compose by `DrawContext` | PA-15 |
| `role(name)` for any `ThemeRoleName` | Always resolves (`keyof Theme`); no missing-role path | PA-16 |

## Testing Requirements
- Spec: FX-01…FX-05 (above), RED before Part A/B implementation.
- Impl: clamp/normalize; mixed container; `role()` over all roles; `Desktop.draw` pattern fill.
- No regressions in the RD-02 layout suite (18 ST oracles) or RD-03 view suite.
