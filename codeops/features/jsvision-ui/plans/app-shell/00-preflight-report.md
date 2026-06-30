# Preflight Report — App Shell (RD-05 plan)

> **Artifact**: `plans/app-shell/` (all docs)
> **Date**: 2026-06-30
> **Skills Version**: 3.1.0
> **Iteration**: 1
> **Outcome**: ⏳ **FINDINGS RESOLVED IN PLAN** — PF-01…PF-09 dispositioned + integrated (Phase 0 +
> spec corrections); an iteration-2 re-scan is recommended to confirm a clean pass before exec.

> **Disposition (2026-06-30):** all findings accepted + remediated in the plan. Foundation gaps
> (PF-01/02/03/06) became **Phase 0** ([03-00-foundation-extensions.md](03-00-foundation-extensions.md),
> decisions PA-15…PA-17/PA-19, oracles FX-01…FX-05); PF-04 (settable `onFrame`/PA-18), PF-05
> (`Window.focusable`), PF-07/08/09 folded into the existing docs/phases. Decision record:
> [00-pf01-scope-addition.md](00-pf01-scope-addition.md). Packaging: **Phase 0 in this plan**.

> ⚠️ **SAME-SESSION / SAME-DAY REVIEW** — this plan was authored 2026-06-30 and reviewed the same
> day. Authoring-model blind spots are likely; findings below are grounded in direct reads of the
> live source (file:line cited). A future independent re-scan is still advisable.

> **PF numbering note:** findings here are numbered **PF-01…PF-09** to distinguish them from the
> `PF-001`/`PF-003`/`PF-004` references inside the plan, which point at the *RD-05 requirement*
> preflight (`requirements/00-preflight-report-RD-05.md`), not this report.

## Codebase Context Summary

RD-05 composes the RD-04 `EventLoop`, RD-03 `View`/`Group`/`RenderRoot`/`DrawContext`, RD-02
`layout()`, and `@jsvision/core` (`createHost`, `Theme`, `ScreenBuffer`). Surfaces verified against
live source:

- **`EventLoop`/`EventLoopOptions`** — `event/types.ts:16-63`. `onFrame` is **not** present; the
  plan adds it to `EventLoopOptions` (construction-time). `createEventLoop(viewport, opts)` builds +
  owns a deferring `RenderRoot`; `runTick` drives one `flush()` per tick (`event-loop.ts:141-158`).
- **`hitTestRoute`** — `event/hit-test.ts:90-115`. Mouse/wheel route to the **single top-most hit
  view only** — no pre/post sweep, no bubble (`dispatch.ts:111-115`).
- **Focus** — `event/focus.ts:130-132`: `focusView` is a **no-op when `!isFocusable(view)`**, and
  `isFocusable` requires `view.focusable === true` (`focus.ts:54-55`). `View.focusable` defaults
  `false` (`view/view.ts:50`).
- **Reflow** — `view/reflow.ts:24-36`: each pass rebuilds a fresh `LayoutBox` tree from **every**
  visible view and **overwrites every `view.bounds`** with RD-02 `layout()` output.
- **Layout engine** — `layout/{types,layout}.ts`: **pure flex** (row/col, justify/align/gap/padding,
  fixed/fr/auto). **No** absolute positioning, explicit x/y offsets, overlap, or float mode.
- **`DrawContext`** — `view/types.ts:34-45`, `view/draw-context.ts:127-129`,
  `view/theme-style.ts:15-17`: `color(role)` returns **`{fg,bg}` only**; role-only extras
  (`pattern`/`border`/`title`) are dropped.
- **`Group`** — `view/group.ts:38-42`: `draw()` fills `background` with a **space** glyph (not a
  pattern). `children` = z-order.
- **Theme** — `core/.../color/theme.ts:25-53`: roles incl. `window`/`dialog` already carry
  unconsumed `border`/`title`; `desktop` carries an unconsumed `pattern`. `ThemeRole` is exported
  (`color/index.ts`). `PALETTE.darkGray` exists.
- **Host** — `core/.../host/types.ts:29-69`: `createHost(options: HostOptions): Host` — **single
  arg**; `runtime` is a field of `HostOptions`. SIGCONT re-asserts modes + repaints **then** fires
  `onResume` (`host/signals.ts:110-124`) — matches AR-83.

---

## 🔴 CRITICAL

### PF-01 — Free-floating, overlapping windows are not expressible on the flex layout/reflow model

**Dimensions:** 4 (Completeness), 6 (Feasibility), 13 (Architecture Mismatch).

The window manager's entire mechanism is **direct geometry mutation**: drag sets
`target.bounds.{x,y}`, resize sets `bounds.{width,height}`, zoom sets `bounds` to the desktop rect,
cascade/tile assign per-window rects — each followed by `target.invalidateLayout()` (03-02 lines
85-102; RD-05 line 387). But:

1. **`invalidateLayout()` → reflow clobbers those bounds.** `reflow.ts:29-33` runs `layout()` over a
   box tree built from `view.layout` props (not `view.bounds`) and writes the flex result back onto
   **every** view's `bounds`, including the Desktop's window children. The just-set drag/zoom/tile
   geometry is overwritten on the very reflow the gesture triggers.
2. **Overlap & arbitrary (x,y) are inexpressible.** `layout/layout.ts` is pure flex flow; a Group's
   children are packed by `justify`/`align` with no overlap and no per-child offset. ST-06/AC-6 ("two
   overlapping windows"), raise (AC-7), drag-to-arbitrary-position (AC-8), cascade stagger (AC-11)
   all require free placement the engine cannot produce.

The plan lists RD-02 `layout()` and RD-03 `reflow` as **"consumed — no changes"** (02-current-state
lines 22-24, 67) and claims the only cross-package edit is `windowInactive`. As written, Phase 3 is
not implementable: dragged windows snap back, and the spec tests can't even construct the overlap
scenarios they assert.

**Failure scenario:** `desktop.addWindow(a); desktop.addWindow(b)` → both windows are flex-packed
side-by-side (default `row`), never overlapping; a title-bar drag sets `a.bounds.x` then
`invalidateLayout()` immediately reflows `a` back to its flex slot. ST-06/07/08/10/11 fail at setup.

**Options:**
- **(A) Recommended — add a "free/absolute placement" capability and scope it explicitly.** Give the
  Desktop a layout mode where its window children are positioned from their own `bounds` (or explicit
  `x/y/w/h` layout props) and **excluded from the flex pass**; reflow then lays out only each
  window's *interior* against the window's authoritative rect. This is a real RD-02/RD-03 addition —
  add it to this plan's scope (new tasks + ACs) and drop the "no RD-02/RD-03 changes / single
  cross-package edit" claim. *Evidence it's needed:* `reflow.ts:30-33`, `layout/layout.ts` (no
  absolute mode).
- **(B) Desktop owns a custom reflow for its subtree** (bypass `layout()` for windows; lay out
  interiors with a per-window `layout(windowBox, windowSize)` call). Smaller blast radius than a
  general absolute mode, but still a new RD-03 reflow seam the plan doesn't budget.
- *Dropped:* "do nothing / it already works" — refuted by `reflow.ts:30-33` + the pure-flex engine.

**Nuance (independent challenger, CONFIRMED):** manually-set `bounds` *do* survive a pure
`invalidate()` (the repaint-only branch `render-root.ts:199-207` composes from cached contexts and
reads `view.bounds` directly, no reflow). But the design isn't rescued: the plan deliberately calls
`invalidateLayout()` (needed to re-inset window content on resize), and **any** reflow anywhere in
the tree — a terminal resize, a content relayout, another window's gesture — snaps every window back
to its flex-flow slot. There is no scoped/subtree reflow and no opt-out. The challenger also notes
the *RD-05 requirement* preflight missed this and even listed `invalidateLayout` under "verified
accurate."

**Recommendation:** **(A)** — surface the gap now, expand scope, and re-baseline the
"minimal-footprint" framing. *Confidence: High → **CONFIRMED***. *Hardening: an independent
challenger was tasked to refute the claim and could not — both premises (reflow clobbers bounds; flex
has no overlap/absolute mode) hold against live source, and no escape hatch exists in the shipped
code or the planned additive edits.*

---

## 🟠 MAJOR

### PF-02 — Menu overlay (full-screen, non-flow, top-z) is not expressible either (same root cause)

**Dimensions:** 4, 13. PA-2 hosts `MenuPopup`s in a full-screen `overlay` that "does not consume
flow space … positioned to the full viewport rect" (03-01 lines 22-27). On the flex model the app
root `col` `[menuBar, desktop, statusLine, overlay]` gives the overlay a **flow slot** — after
menuBar(1)+desktop(fr:1)+status(1) consume the column, the overlay collapses to ~0 height, and
`DrawContext` clips a popup to its parent → the popup is invisible. This is the *exact* 1-row
clipping PA-2 set out to avoid. Resolving PF-01 (a stacking/absolute layer) also resolves this;
otherwise the menu subsystem (Phase 4) has no working popup host. *Evidence:* `reflow.ts:24-36`,
`layout/layout.ts`, `draw-context.ts` clip.

### PF-03 — Role-only theme extras (`pattern`, `border`, `title`) are unreachable through `DrawContext`

**Dimensions:** 4, 13. `DrawContext.color(role)` returns **`{fg,bg}` only**
(`theme-style.ts:15-17`, `draw-context.ts:127-129`). Yet:
- **Desktop pattern (AR-80 / ST-06):** the plan sets `Desktop.background = 'desktop'` and comments
  "role + pattern fill" (03-02 lines 55-56), but `Group.draw` fills `background` with a **space**
  (`group.ts:38-42`) — the `'░'` pattern from `theme.desktop.pattern` is never read. ST-06 asserts
  the pattern renders; it won't, unless Desktop overrides `draw()` and obtains the pattern glyph.
- **Frame border/title colors (AR-73 / PA-1):** `drawFrame` is to use `ctx.color('window'|'windowInactive')`
  (03-03 line 109), which drops the role's `border`/`title` colors — so the carefully-specified
  `windowInactive: {…, border, title}` shape is partly dead (mirrors the already-unconsumed
  `window`/`dialog` border/title).

**Options:** (A) Recommended — extend `DrawContext` with a raw-role accessor (e.g. `role(name):
ThemeRole`) and have Desktop/Frame read `pattern`/`border`/`title`; note this is a (small, intra-ui)
**RD-03 change**, so drop "no RD-03 change needed" (03-05 line 71). (B) Inject the active `Theme`
into Desktop/Window via the seam. *Dropped:* hardcode `'░'` and fg-only borders — works for the
default theme but silently ignores `theme.desktop.pattern`/`window.border`, breaking custom themes
and leaving the PA-1 role shape cosmetic. **At minimum** the plan must state the chosen mechanism;
today ST-06's pattern assertion fails against the literal `background='desktop'` design.

### PF-04 — `onFrame` wiring is described two incompatible ways (option vs. settable member)

**Dimensions:** 3 (Contradiction), 4. The seam (03-05 lines 85-89) adds `onFrame?` **only to
`EventLoopOptions`** (construction-time) and adds **only** `setCapture`/`releaseCapture` to
`EventLoop`. But `run()` (03-01 line 86) does `loop.onFrame = (buffer) => host.render(buffer)` —
assigning a **settable property on the loop**, which the type surface does not provide. The two can't
both be true: at `createApplication` time the host doesn't exist yet (so `onFrame` can't be
`host.render`), and at `run()` time there is no settable `loop.onFrame`. **Options:** (A) Recommended
— add a mutable `onFrame` member to the `EventLoop` interface (set by `run()`); drop it from, or keep
it additionally on, `EventLoopOptions`. (B) `createApplication` owns a mutable sink and passes
`onFrame: (b) => sink(b)` at construction; `run()` reassigns `sink` (not `loop.onFrame`) — then fix
the run() pseudocode. Either way the plan's current text is internally inconsistent and must pick
one. *Evidence:* `event/types.ts:36-63` (no onFrame member); 03-01 line 86 vs 03-05 lines 85-89.

### PF-05 — `Window` is never marked `focusable`, so raise/`activeWindow()` silently no-op

**Dimensions:** 4, 13. Raise calls `seam.focusView(w)` (03-02 lines 80-83), but `focusView` is a
**no-op unless `isFocusable(view)`**, which requires `view.focusable === true`
(`focus.ts:54-55,130-132`); `View.focusable` defaults `false` (`view/view.ts:50`). The `Window`
class (03-03 lines 46-64) never sets `focusable = true`. Consequence: an empty/contentless window is
neither focusable itself nor a focusable container, so `focusView(w)` does nothing and
`activeWindow()` ("top-most **focused** window", AR-78) never returns it — breaking ST-07
(focus-on-raise), ST-12 (next/prev/Alt-N active), ST-13 (next becomes active), and ST-15
(active/inactive theming, which keys off `activeWindow() === this`). **Recommendation:** specify
`Window.focusable = true` (a window is a focus target / focusable container) in 03-03 and the
Phase-3 tasks. *Evidence:* `focus.ts:54-55,130-132`; `view.ts:50`.

### PF-06 — Menu "click-outside-to-close" has no working mechanism on RD-04 mouse routing

**Dimensions:** 4, 7 (Testability), 13. The MenuBar is a **pre-process** view, which only sees
**keys** (3-phase sweep). Mouse events bypass the sweeps entirely and go to the **single top-most hit
view** (`dispatch.ts:111-115`, `hit-test.ts:90-115`). So a click *outside* an open popup lands on a
window/desktop and the MenuBar never learns of it — yet 03-04 (error table + impl test T4.6) requires
"click outside an open menu → close + restore focus." As specified this is unimplementable. **Options:**
(A) Recommended — while a menu is open, mount a full-screen transparent **catcher** view as the
overlay's first child (below the popup) whose `onEvent` closes the menu on any mouse-down; popups sit
above it. (B) Use the pointer-capture seam (PA-5) for the open-menu lifetime so the MenuBar receives
all mouse events (note: capture suppresses focus-on-click and is documented as drag/resize-only —
reconcile that). *Dropped:* rely on pre-process (refuted — mouse never reaches it). **Recommendation:**
(A); add it to 03-04 and Phase 4. *Evidence:* `dispatch.ts:111-115`, `hit-test.ts:90-115`.

---

## 🟡 MINOR

### PF-07 — `run()` pseudocode calls `createHost(opts, { runtime })` (two args)

03-01 lines 80-84 pass `{ runtime }` as a **second positional argument**, but
`createHost(options: HostOptions): Host` takes a **single** options object and `runtime` is a field
of `HostOptions` (`host/types.ts:29-57,59`). Illustrative pseudocode, but it contradicts the
verified signature and will mislead the implementer. Fix: fold `runtime` into the single options
object.

### PF-08 — Session/task counts are inconsistent across the plan

00-index line 44 says "**5 phases, 15 sessions**"; 99 line 21 says "**Six phases**"; the phase table
sums to **16** sessions; success criteria (99 line 227) say "**16 sessions / 40 tasks**"; the master
checklist actually lists **41** items (P1 9 + P2 7 + P3 11 + P4 7 + P5 7) and the header reads
"0/40". Pick one canonical count (5 phases / 16 sessions / N tasks) and reconcile all four sites.

---

## 🔵 OBSERVATIONS

### PF-09 — `onResume` flush nudge produces a frame that is never delivered
`run()` sets `onResume: () => loop.renderRoot.flush()` (03-01 line 83). `renderRoot.flush()` does not
fire `onFrame` (only `runTick`/`resize`/`mount` will, per 03-05), and the host already re-painted
during SIGCONT (`signals.ts:110-124`). The nudge is therefore harmless but inert — consider dropping
it or routing through a path that actually reaches `host.render` if a post-resume repaint is ever
wanted.

---

## Verified-good (no finding)

- Suspend/resume model (AR-83): host owns mode-reassert + repaint, `onResume` notify-only — matches
  `signals.ts:110-124`. ✅
- `createHost`/`Host`/`RuntimeAdapter` surface, `caps` required, `host.render(buffer)` damage-diffs —
  `host/types.ts`. ✅
- `MouseEvent {kind,button,x,y}` 1-based→0-based normalization — `input/events.ts:28-33`,
  `hit-test.ts:97-98`. ✅
- `ThemeRole` exported; `PALETTE.darkGray` exists; additive `windowInactive` is a clean, non-breaking
  `Theme` add — `color/index.ts`, `color/theme.ts`. ✅
- One-coalesced-frame-per-tick + capture short-circuit in `hit-test` are sound additive seams
  (modulo PF-04's onFrame wiring) — `event-loop.ts:141-158`, `hit-test.ts`. ✅

## Disposition (resolved)

| # | Sev | Resolution | Where |
|---|---|---|---|
| PF-01 | 🔴 | RD-02 additive `position:'absolute'` + `rect`; WM mutates `layout.rect` (PA-15) | 03-00 §A, Phase 0; 03-02/03-03 |
| PF-02 | 🟠 | Overlay = absolute full-viewport layer (PA-15) | 03-00 §A, 03-01, 03-04 |
| PF-03 | 🟠 | RD-03 additive `DrawContext.role<K>` + `Desktop.draw` pattern (PA-16) | 03-00 §B, Phase 0; 03-02/03-03 |
| PF-04 | 🟠 | Settable `EventLoop.onFrame` member (PA-18) | 03-05, 03-01, Phase 1 |
| PF-05 | 🟠 | `Window.focusable = true` | 03-03, Phase 3 |
| PF-06 | 🟠 | Full-viewport click-catcher in the overlay (PA-19) | 03-04, Phase 4 |
| PF-07 | 🟡 | Single-arg `createHost`; `runtime` folded in | 03-01 |
| PF-08 | 🟡 | Counts reconciled → 6 phases / 18 sessions / 48 tasks | 00-index, 99 |
| PF-09 | 🔵 | Inert `onResume` nudge dropped (notify-only) | 03-01 |

All findings carry an accepted resolution integrated into the plan. **Next:** run an iteration-2
preflight re-scan (verifies the fixes + checks for regressions) before `exec_plan`.

---

## Preflight Report: App Shell — Iteration 2

> **Status**: ✅ PASSED — all 5 findings resolved (1 critical, 2 major, 2 minor; user-accepted + applied 2026-06-30)
> **Previous Iteration**: PF-01…PF-09 — all resolved/integrated (Phase 0 + spec corrections)
> **This Iteration**: 5 new findings (PF-10…PF-14)
> **Carried Forward**: none open from iteration 1
> **Artifact**: implementation plan at `plans/app-shell/`
> **Codebase Grounded**: 16 live source files examined; all iteration-1 fixes re-verified against source
> **Last Updated**: 2026-06-30

> ⚠️ **SAME-SESSION REVIEW** — this iteration-2 re-scan was run in a fresh context but the same model
> authored the plan; consider a human/independent review of the CRITICAL finding. Every finding below
> is grounded in direct reads of live source (file:line cited) and an independent challenger confirmed
> PF-10/PF-11/PF-12.

### Iteration-1 fix verification (all CONFIRMED integrated)

| Prior | Fix claim | Verified against |
|---|---|---|
| PF-01 | RD-02 absolute placement; WM mutates `layout.rect` | `reflow.ts:54` builds the box from `view.layout` live → mutation flows through; `layout.ts` flex pass is localized-extendable. ✅ |
| PF-02 | Overlay = absolute full-viewport layer | `layout.ts` absolute branch (Phase 0). ✅ (but see PF-10 — the empty-overlay hit behavior is a NEW consequence) |
| PF-03 | `DrawContext.role<K>` + `Desktop.draw` pattern | `theme-style.ts:15-17` confirms `color()` drops extras; `draw-context.ts:131` returns a literal `role` is addable. ✅ |
| PF-04 | Settable `EventLoop.onFrame` member | `event-loop.ts` `runTick`/`resize`/`mount` flush points exist; member is addable. ✅ |
| PF-05 | `Window.focusable = true` | `focus.ts:54-55,130-132` confirm `focusView` no-ops unless `focusable`; plan 03-03:47 sets it. ✅ |
| PF-06 | Overlay click-catcher while menu open | `hit-test.ts` reverse-order walk + `dispatch.ts:112-114` mouse routing. ✅ (open-menu state only — see PF-10) |
| PF-07 | Single-arg `createHost` | `host/types.ts:29-57` `HostOptions.runtime` field. ✅ |
| PF-08 | Counts → 6 phases / 18 sessions / 48 tasks | 00-index:56, 99:7/41/260 + master checklist (7+9+7+11+7+7=48). ✅ |
| PF-09 | Inert `onResume` nudge dropped | 03-01:88 `onResume: () => {}`. ✅ |

---

### PF-10: Always-present full-viewport `overlay` swallows ALL mouse input when no menu is open 🔴 CRITICAL

**Dimension:** 4 (Completeness), 6 (Feasibility), 13 (Architecture Mismatch) · regression introduced by the PF-02 fix.
**Location:** `03-01-application-run-host.md:22-30`, `03-00-foundation-extensions.md:75`, `03-04-menus.md:30-37`; ST-07/08/14/19/16 in `07-testing-strategy.md`.
**Codebase Evidence:** `packages/ui/src/event/hit-test.ts:55-67` (`topMost` returns a childless `Group` via `contains`), `:110-115` + `packages/ui/src/event/dispatch.ts:112-114` (mouse delivers to a SINGLE hit view, no bubble); `packages/ui/src/view/geometry.ts:44-46` (`contains` true across the full rect); `packages/ui/src/view/view.ts:38` (`visible` defaults true); `packages/ui/src/view/reflow.ts:43` + `hit-test.ts:50` (`!visible`/`disabled` subtrees are skipped).

**The Problem:** The app root's last (top-z) child is a `position:'absolute'` `overlay` Group with `rect` = the full viewport, **always present**. When no menu is open the overlay has no children, but `topMost` walks app-root children front-to-back (overlay first), finds no child hit, then returns the **overlay itself** because its rect contains every point. Mouse delivery is single-target with no bubbling, so the desktop, windows, status line, and menu-bar titles (earlier siblings) **never receive any click**. The plan's "transparent until a popup mounts" (03-01:30) means paint-transparent (no `background` fill) — it is **not** hit-transparent. The PF-06 catcher only exists *while a menu is open*; the empty-overlay state is unhandled. Result: raise-on-click (ST-07), drag (ST-08), frame-box clicks (ST-14), status clicks (ST-19), and menu-title clicks (ST-16) all fail — the WM is unusable by mouse. *(Independent challenger: CONFIRMED.)*

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A (rec.) | The menu controller toggles `overlay.state.visible` with popup presence: `false` when empty, `true` while a menu (catcher+popups) is mounted. | `topMost`/`reflow`/compose all already skip `!visible` (`hit-test.ts:50`, `reflow.ts:43`); zero RD-04/RD-02 change; the empty overlay has nothing to paint or hit anyway; toggle happens at the same site that mounts/unmounts popups. | One extra state flip the controller must own (and a reflow on open/close — already incurred by mounting the popup). |
| B | Toggle `overlay.state.disabled` instead. | Same `topMost` skip. | `disabled` carries focus-subtree + "greyed" semantics (`focus.ts:44-55`); semantically wrong for a layer that isn't disabled. |
| C | Keep overlay rect `{0,0,0,0}` when empty; expand to full viewport when a menu opens. | `contains` false on a zero rect → not hit. | Fiddlier: child popups place relative to a zero content box and clip to zero until expanded; more moving parts than a visibility flag. |

*Considered and dropped:* a new RD-04 rule to skip childless/background-less groups in `topMost` — invasive, changes shipped+tested RD-04 hit-test semantics, risks unrelated regressions.

**Recommendation:** **Option A** — toggle `overlay.state.visible` with menu-open state, in 03-01 (overlay construction note), 03-04 (controller open/close), and Phase 4 T4.5. It reuses the existing `!visible` skip in both hit-test and reflow, needs no foundation change, and a paint-empty overlay genuinely should be inert to input. *Confidence: High → CONFIRMED.* *Hardening: an independent challenger tasked to refute could not — `topMost` returns the childless overlay, mouse is single-target, and no plan mechanism toggles visibility/disabled when empty.*

**User Decision:** Resolved — User accepted recommendation (Option A). Applied: 03-01 (overlay `state.visible=false` when empty + ordering note), 03-04 (controller toggles on open/close), 07 ST-01 (structural overlay clause), 99 T2.3/T4.5; recorded as PA-20.

---

### PF-11: ST-04 / AC-4 "restore on **handler** throw" contradicts the shipped RD-04 handler-isolation (AR-66) 🟠 MAJOR

**Dimension:** 3 (Logical Contradiction), 7 (Testability), 13 (Stale Assumption).
**Location:** `07-testing-strategy.md:39` (ST-04); `01-requirements.md` AC-4; cross-ref `RD-05-app-shell.md:473-475` (AC-4 source) and the plan's own `03-01-application-run-host.md:123`.
**Codebase Evidence:** `packages/ui/src/event/event-loop.ts:209-215` (`deliver` try/catch swallows + logs an `onEvent` throw, AR-66); `packages/ui/src/event/dispatch.ts:119,124,130` + `hit-test.ts:114` (every handler invocation routes through `deliver`); `03-01-application-run-host.md:82-95` (`run()` awaits `quitPromise.finally(host.stop)`, resolved only by `'quit'`).

**The Problem:** ST-04 asserts "a **handler** throws during a tick → `host.stop()` ran (`restored===true` on the throw path)." But a view `onEvent`/`draw` throw is caught and swallowed by `deliver` (AR-66 isolation), so it never propagates out of `runTick`/`dispatch`, never rejects `quitPromise`, and never reaches `run()`'s `finally`. The plan's **own** error table contradicts ST-04: `03-01:123` maps a handler throw to "Isolated + logged … the loop is not wedged" (explicitly *not* an exit path); only `03-01:124` ("thrown error / signal during `run()`") triggers `host.stop()`. The restore-on-throw guarantee is real only for a throw that *escapes* the loop — an uncaught exception (the host's `onUncaughtException` backstop) or an error in `run()`'s own wiring. As an immutable oracle, ST-04 as worded is unsatisfiable; an implementer building it literally gets a forever-red test and may be tempted to weaken AR-66. *(Challenger: CONFIRMED; also flagged the internal 03-01:123 vs ST-04 contradiction.)*

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A (rec.) | Re-word ST-04 to exercise the **escaping** throw path: the fake runtime fires `onUncaughtException` (host backstop restores) **or** an error is thrown in `run()`'s lifecycle (e.g. `host.start()`/first-frame push) → assert `host.stop()`/`restored`. Add a one-line note that handler throws are isolated (per 03-01:123) and are a *separate*, non-restoring case. Flag AC-4's "a handler" phrasing (RD-05:474) for a matching one-line clarification. | Aligns the immutable oracle with shipped, tested behavior; preserves AR-66; tests the guarantee that actually exists. | Touches an AC-derived oracle (cross-reference + a minor AC wording clarification upstream). |
| B | Make `run()`/the loop re-raise handler throws to end the run. | ST-04 would pass as literally worded. | Rejected — contradicts AR-66 (deliberate RD-04 isolation, shipped + tested); one bad widget could wedge/kill the app, regressing the availability guarantee. |

*Considered and dropped:* leave ST-04 as-is — it will sit red forever or pressure a weakening of AR-66.

**Recommendation:** **Option A** — bind ST-04 (and clarify AC-4) to the uncaught-exception / run()-lifecycle throw path, and keep handler throws documented as isolated. *Confidence: High → CONFIRMED.* *Hardening: challenger confirmed against `event-loop.ts:209-215` + the plan's own 03-01:123 row; the contradiction is internal to the plan as well as plan-vs-code.*

**User Decision:** Resolved — User accepted recommendation (Option A). Applied: 07 ST-04 re-spec to the escaping-throw path + isolated-handler note + fake-runtime `onUncaughtException` fixture; recorded as PA-22. **Upstream follow-up applied (user-authorized):** RD-05 AC-4 (`RD-05-app-shell.md`) reworded — restore triggers on an escaping throw/signal, and a view-handler throw is noted as isolated (AR-66), not a restore trigger.

---

### PF-12: Phase 2's "ST-01…ST-05 GREEN" gate depends on the `Desktop` class, which is only built in Phase 3 🟠 MAJOR

**Dimension:** 11 (Ordering & Sequencing), 6 (Feasibility) · internal contradiction in `99-execution-plan.md`.
**Location:** `99-execution-plan.md` T1.6 (:77), T2.3/T2.5 (:97-99), T3.6 (:121,:211), dependency graph (:247); ST-01 in `07-testing-strategy.md:36`.
**Codebase Evidence:** n/a (plan-internal contradiction) — verified against the plan's own task graph; `focus.ts`/`group.ts` confirm a `Group` stand-in would not satisfy `instanceof Desktop`.

**The Problem:** ST-01 requires `app.desktop` **is a `Desktop`** and the root to lay out with a "desktop fill"; Phase 2's exit gate (T2.5) demands lifecycle specs ST-01…ST-05 GREEN. But T2.3 builds the app root referencing `desktop` while the `Desktop` class is implemented only in Phase 3 (T3.6); Phase 1 (T1.6) ships only "placeholder barrels." No Phase 0/1/2 task creates even a minimal constructable `Desktop`, and the dependency graph (99:247) gates Desktop *after* Phase 2. So Phase 2 cannot reach GREEN: `createApplication` can't construct a `Desktop`, and a bare `Group` stand-in fails ST-01's `instanceof Desktop`. *(Challenger: CONFIRMED.)*

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A (rec.) | Pull a **minimal `Desktop` skeleton** into Phase 2 (a constructable `Desktop extends Group` with the `desktop` pattern `draw` + `addWindow`/`removeWindow` + `activeWindow`), deferring raise/drag/resize/zoom/cascade/tile to Phase 3. Add it as a Phase-2 task; ST-01/ST-02 pass in Phase 2, ST-06…13 land in Phase 3. | Restores a clean spec-first Phase-2 GREEN; small, additive; matches how 2B would naturally implement "enough to go green." | Splits Desktop across two phases (skeleton P2, WM P3) — must be noted so Phase 3 extends rather than recreates. |
| B | Move the lifecycle-specs-GREEN gate to after Phase 3 (Phase 2 ends RED on the desktop-dependent asserts). | No new Phase-2 task. | Breaks the plan's per-phase spec-first GREEN discipline; leaves Phase 2 without a clean exit; ST-01 stays red across a phase boundary. |

*Considered and dropped:* leave as-is — Phase 2 `createApplication` references a non-existent class and ST-01 cannot pass.

**Recommendation:** **Option A** — add a minimal `Desktop` skeleton task to Phase 2 (chrome `MenuBar`/`StatusLine` stay optional, so they're not blockers for ST-01). *Confidence: High → CONFIRMED.*

> **Application refinement:** during application I found `ApplicationOptions` also references the
> `MenuBar`/`StatusLine` *types* (`03-01`), so a Desktop-only skeleton wouldn't compile in Phase 2.
> The fix therefore seeds **all three** skeletons (`Desktop`/`MenuBar`/`StatusLine`) in Phase 1 (T1.6),
> which Phases 3/4/5 extend; `Window` stays Phase 3 (unreferenced by `createApplication`).

**User Decision:** Resolved — User accepted recommendation (Option A, refined to three Phase-1 skeletons). Applied: 99 T1.6 (skeletons) + T2.3/T3.6/T4.5/T5.3 reworded to compose/extend + dependency graph + master checklist; 03-01 build note; recorded as PA-21.

---

### PF-13: Phase-0 pseudocode uses `rect.size`, which is not a `Rect` property 🟡 MINOR

**Dimension:** 1 (Ambiguity) / 12 (Consistency).
**Location:** `03-00-foundation-extensions.md` §A.3 (step 3) and `00-pf01-scope-addition.md:55` — `layoutContainer(child, rect.size, result)`.
**Codebase Evidence:** `packages/ui/src/layout/types.ts:19-25` — `Rect` is `{x,y,width,height}`; there is no `.size`.
**The Problem:** The canonical Phase-0 design doc (the one the implementer follows) recurses with `rect.size`, which doesn't exist on `Rect`; copied literally it's a type error. Everywhere else the plan is precise.
**Recommendation (only viable fix):** change to `layoutContainer(child, { width: rect.width, height: rect.height }, result)` in both spots.
**User Decision:** Resolved — Applied in 03-00 §A.3 and 00-pf01 §A.2.

---

### PF-14: Phase-0 spec-test filename drifts between docs 🟡 MINOR

**Dimension:** 12 (Consistency).
**Location:** `00-pf01-scope-addition.md:136` says `draw-context.role.spec.test.ts`; `03-00:103,124`, `07:91`, and `99` T0.2 all say `view.drawcontext-role.spec.test.ts`.
**The Problem:** A single test file is named two ways across the plan; the canonical 03-00/07/99 agree, only the historical decision-record disagrees.
**Recommendation (only viable fix):** update `00-pf01-scope-addition.md:136` to `view.drawcontext-role.spec.test.ts` to match the canonical docs.
**User Decision:** Resolved — Applied in 00-pf01-scope-addition.md.

---

### Iteration-2 summary by severity

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 CRITICAL | 1 (PF-10) | ✅ resolved (PA-20) |
| 🟠 MAJOR | 2 (PF-11, PF-12) | ✅ resolved (PA-22, PA-21) |
| 🟡 MINOR | 2 (PF-13, PF-14) | ✅ resolved |
| 🔵 OBSERVATION | 0 | — |

**Outcome:** ✅ **PASSED** — all 5 iteration-2 findings (PF-10…PF-14) accepted (Option A) and applied to the plan docs 2026-06-30; decisions logged as PA-20…PA-22. One upstream follow-up flagged (RD-05 AC-4 wording — lives in the requirements artifact). **Next:** the plan is ready for `exec_plan`. A focused re-read of the edited spots confirmed no new contradictions introduced (overlay-visibility ↔ ST-01 reconciled; ST-04 ↔ AR-66 reconciled; Phase-1 skeletons ↔ Phase-2 compose/Phase-3 extend consistent; task counts unchanged at 6/18/48).
