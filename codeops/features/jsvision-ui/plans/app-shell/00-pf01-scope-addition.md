# Scope Addition — Foundation Extensions for RD-05 (PF-01 … PF-06)

> **Status**: ✅ ACCEPTED — integrated as **Phase 0** (canonical design: [03-00-foundation-extensions.md](03-00-foundation-extensions.md); decisions PA-15…PA-19), user-confirmed 2026-06-30
> **Source**: `00-preflight-report.md` (PF-01 critical, PF-02/03/06 major)
> **Date**: 2026-06-30

> This document is the **decision record**. The canonical design lives in
> `03-00-foundation-extensions.md`; the app-shell-local fixes (Part C below) are integrated into the
> 03-0X docs + execution plan. Packaging decision: **Phase 0 in this plan** (over a separate
> predecessor RD or amending the RD-02/RD-03 plans).

Preflight found that the app-shell's window manager, menu overlay, and frame chrome need three
capabilities that RD-02/RD-03 **do not provide today** and that the plan does not add. This document
designs those capabilities (grounded in the live engine code), specifies their spec oracles, and maps
**every** preflight finding to a concrete fix and a home. Nothing here is implemented yet.

---

## Part A — The root cause (one mechanism unblocks PF-01, PF-02, PF-06)

`reflow()` runs **one global** `layout(rootBox, viewport)` and writes the flex result onto **every**
`view.bounds` (`view/reflow.ts:30-33`); `layout()` is **pure flex** with no overlap and no per-child
placement (`layout/layout.ts:59-89`). So directly-set window geometry is clobbered on the next
reflow, overlapping windows are inexpressible, and a "full-viewport non-flow overlay" cannot exist.

**Fix: add an `absolute` placement mode to RD-02 layout.** An absolutely-placed child is removed
from its parent's flex flow and positioned at an explicit, content-box-relative rect; its own
children still flow inside that rect. This is the CSS `position:absolute` analogy and it solves
windows (PF-01), the menu overlay (PF-02), and — via the overlay — click-outside close (PF-06) with a
single, idiomatic primitive. `reflow.ts` needs **no** change (it already writes back every rect
`layout()` returns).

### A.1 — RD-02 API (`layout/types.ts`)

```ts
export interface LayoutProps {
  // … existing: direction, size, justify, align, gap, padding …
  /** Placement mode. 'flow' (default) joins the parent's flex flow; 'absolute' is removed from
   *  flow and placed at `rect` within the parent's content box. */
  position?: 'flow' | 'absolute';
  /** For position:'absolute' only — the parent-content-relative rect in cells (clamped ≥0).
   *  Ignored for 'flow'. */
  rect?: Rect;
}
```
`normalizeProps` defaults `position:'flow'`; `rect` passes through (each side via `toCells`).

### A.2 — RD-02 behavior (`layout/layout.ts`, localized to `layoutContainer`)

- Partition `box.children` into **flow** vs **absolute** by `position`.
- `solveMainSizes`/`mainAxisOffsets`/`crossPlacement` run over the **flow subset only**, so absolute
  children neither consume main-axis space nor shift flow siblings.
- Each **absolute** child: `childRect = { x: content.x + rect.x, y: content.y + rect.y, width:
  rect.width, height: rect.height }` (content-box-relative, integer-clamped); `result.set(child,
  childRect)`; then `layoutContainer(child, { width: rect.width, height: rect.height }, result)` so its interior flows.
- Z-order is unchanged: paint order is `children` array order (`render-root.ts:81-93`), so an absolute
  child later in the array paints on top.

Mixed flow+absolute is required (the app root) and supported: flow `[menuBar, desktop, statusLine]`
flex normally; the absolute `overlay` overlays the column.

### A.3 — How the WM uses it (replaces direct `bounds` mutation)

The window manager mutates the window's **layout rect**, not `bounds`, then `invalidateLayout()`:

| Gesture | Today (broken) | With absolute placement |
|---|---|---|
| drag-move | `w.bounds.x/y = …` | `w.layout = {…, position:'absolute', rect:{x,y,…}}` |
| resize | `w.bounds.w/h = …` | `w.layout.rect.{width,height} = …` |
| zoom | `w.bounds = desktop` | `w.layout.rect = desktopRect` (restore: saved rect) |
| cascade/tile | per-window `bounds` | per-window `layout.rect` |

After reflow, `w.bounds === w.layout.rect`; a subsequent terminal resize or any other reflow
**re-honors** the rect instead of clobbering it. Windows overlap freely; `Desktop` holds only
absolute children. Content still re-insets (`padding:1`) within the window's rect. This satisfies
ST-06/07/08/09/10/11.

### A.4 — How the overlay uses it (PF-02)

App root children: `[menuBar (flow, h=1), desktop (flow, fr:1), statusLine (flow, h=1), overlay
(absolute, rect = full viewport)]`. The overlay overlays the whole screen, paints last (top-z), and
hosts popups at absolute rects — exactly PA-2's intent, now realizable.

---

## Part B — Raw theme-role access (PF-03)

`DrawContext.color(role)` returns `{fg,bg}` only (`view/theme-style.ts:15-17`), dropping the
role-only extras (`pattern`/`border`/`title`). The desktop pattern (AR-80/ST-06) and frame
border/title (AR-73) need them.

**Fix (RD-03, additive to `DrawContext`):**
```ts
export interface DrawContext {
  // … existing …
  color(role: ThemeRoleName): Style;
  /** Resolve the full theme role (incl. role-only extras: pattern/border/title) for chrome. */
  role<K extends ThemeRoleName>(name: K): Theme[K];
}
```
`draw-context.ts`: `role: (name) => theme[name]`. Then:
- `Desktop.draw(ctx)` overrides `Group.draw` to fill with the pattern glyph:
  `ctx.fill(ctx.role('desktop').pattern, ctx.color('desktop'))` (instead of the space-fill
  `Group.draw` does — `group.ts:38-42`).
- `drawFrame` reads `ctx.role(role).border` / `.title` for border + title colors.

The generic `K` keeps it type-safe (no cast): `ctx.role('desktop').pattern` is typed.

---

## Part C — App-shell-local spec corrections (PF-04, PF-05, PF-06, PF-07, PF-08, PF-09)

These fold into the **existing** app-shell phases (no new foundation needed):

| # | Fix | Lands in |
|---|---|---|
| **PF-04** | Make `onFrame` a **settable member of `EventLoop`** (set by `run()`), not an `EventLoopOptions`-only field; or a sink indirection. Pick one; fix the 03-01 `loop.onFrame = …` pseudocode to match. | 03-05 seam, 03-01, event/types.ts (Phase 1) |
| **PF-05** | `Window.focusable = true` (a window is a focus target / focusable container) so `raise()`'s `focusView(w)` works and `activeWindow()` resolves. | 03-03, Phase 3 task T3.5 |
| **PF-06** | While a menu is open, mount a **full-viewport transparent catcher** (absolute) as the overlay's first child below the popup; its `onEvent` closes the menu on mouse-down (depends on Part A overlay). | 03-04, Phase 4 task T4.5 |
| **PF-07** | `createHost(options)` is **single-arg**; fold `runtime` into the options object. | 03-01 pseudocode |
| **PF-08** | Reconcile phase/session/task counts (canonical: 5 phases / 16 sessions / N tasks) across 00-index, 99 header, 99 overview, master checklist. | 00-index, 99 |
| **PF-09** | Drop or re-route the inert `onResume` flush nudge. | 03-01 |

---

## Part D — New spec oracles (spec-first; written + RED before implementation)

Foundation-extension oracles (these gate Part A/B before app-shell Phase 3/4 begins):

| Oracle | Asserts | File |
|---|---|---|
| FX-01 | An `absolute` child is placed at its `rect` regardless of siblings; flow siblings reserve **no** space for it. | `layout.absolute.spec.test.ts` |
| FX-02 | Two `absolute` children may overlap; both keep their full rects. | `layout.absolute.spec.test.ts` |
| FX-03 | An `absolute` child's own children flow within its rect (padding honored). | `layout.absolute.spec.test.ts` |
| FX-04 | Re-running layout (resize) re-honors each `absolute` rect (no flex snap-back). | `layout.absolute.spec.test.ts` |
| FX-05 | `DrawContext.role('desktop').pattern` / `role('window').border` return the role extras. | `view.drawcontext-role.spec.test.ts` |

The existing ST-06 (desktop pattern) and ST-08/09/10/11 (WM geometry) become **truly** satisfiable
once FX-01…FX-05 are green.

---

## Part E — Sequencing & scope-claim corrections

```
Foundation Extensions (Part A + B)   ← NEW; spec oracles FX-01…FX-05
        ↓
Phase 1 (loop seams + Commands + onFrame member [PF-04])
        ↓
Phase 2 (Application + run() + absolute overlay)
        ↓
Phase 3 (Desktop/Window via absolute placement [PF-01,03,05])
        ↓
Phase 4 (Menus via overlay + catcher [PF-02,06])
        ↓
Phase 5 (StatusLine + demos + gate)
```

**Scope claims — corrected framing:**
- ✅ **Still true** (AC-21): the **only cross-package edit is `windowInactive`** on core `Theme`. The
  two new contract edits are **intra-package** (both in `packages/ui`): RD-02 `LayoutProps`
  (`absolute` placement) and RD-03 `DrawContext` (`role()`).
- ❌ **Now false** — "RD-02 `layout` / RD-03 `reflow` consumed — no changes": RD-02
  `layout.ts`/`types.ts` and RD-03 `draw-context.ts`/`types.ts`/`group.ts` (Desktop.draw) change
  (additively).
- ✅ Still true: zero new runtime deps; loop composed not re-shaped; pure TS/ESM. Net contract
  surface: **1 cross-package + 2 intra-package RD-02/RD-03 extensions + 2 intra-package loop seams**.

---

## Open decision (blocks integration)

**Where do Part A + B live?** — see the question posed alongside this draft. The *design* above is
identical either way; only its home (a predecessor RD/plan vs a Phase 0 in this plan) differs.
