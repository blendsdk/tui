# Execution Plan — App Shell

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md) · **Implements**: jsvision-ui/RD-05 · **Plan**: `plans/app-shell/`
> **Last Updated**: 2026-06-30
> **Progress**: 7/48 tasks (15%)
> **CodeOps Skills Version**: 3.1.0

## Overview

Build the RD-05 app shell on the composed RD-04 `EventLoop`. Specification-first ordering is
**non-negotiable**: every feature phase runs three sessions — **(A) Spec Tests → confirm RED →
(B) Implementation → confirm GREEN → (C) Impl Tests & Hardening**. Spec tests derive from RD-05
ACs (the immutable oracles ST-01…ST-22 in [07-testing-strategy.md](07-testing-strategy.md)).
Commits reference **/gitcm** (commit) or **/gitcmp** (commit + push) — never raw git. Verify with
`yarn verify`; iterate with `yarn workspace @jsvision/ui test`. Commit scope: `color` (core theme),
`event` (loop seams), `app`/`desktop`/`window`/`menu`/`status` (ui subsystems), `examples` (demo).

**🚨 Update this document after EACH completed task!**

> Six phases (0–5): **foundation extensions** (RD-02 absolute placement + RD-03 `DrawContext.role`) →
> foundation (seams + theme role + Commands) → Application/`run()` lifecycle → Desktop + Window/Frame →
> Menus → StatusLine + demos + final gate. Each new file ≤ 500 lines (PA-11) with full JSDoc on public
> symbols. **One cross-package edit** (core `Theme.windowInactive`) + **two intra-package RD-02/RD-03
> contract extensions** (`LayoutProps` absolute placement; `DrawContext.role`) + two intra-package
> loop seams (capture + `onFrame`). AC-21 ("only cross-package edit = `windowInactive`") still holds.
> The loop is **composed, not re-shaped**.

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 0 | Foundation extensions: RD-02 `absolute` placement · RD-03 `DrawContext.role()` (resolves PF-01/02/03/06) | 2 | 4–6 h |
| 1 | Foundation: core `windowInactive` role · loop `setCapture`/`onFrame` seams · `Commands` · dir skeleton | 3 | 4–6 h |
| 2 | Application + `run()` lifecycle (compose, host wiring, onFrame→render, quit→exit, restore, suspend/resume) | 3 | 6–8 h |
| 3 | Desktop WM + Window/Frame (raise · drag · resize · zoom · cascade/tile · switch · close · theming) | 4 | 9–12 h |
| 4 | Menus (overlay · builders · MenuBar pre-process · MenuPopup · nested controller · enable/disable) | 3 | 6–8 h |
| 5 | StatusLine + one-frame + demos + packaging + final gate | 3 | 5–8 h |
| **Total** | | **18** | **34–48 h** |

---

## Phase 0 — Foundation extensions (absolute placement · raw-role draw access)

Land the RD-02/RD-03 capabilities the WM, overlay, and frame chrome require, **before** any app-shell
code. Spec-first: FX oracles RED → implement → GREEN → impl tests. (Refs: 03-00; resolves PF-01/02/03/06.)

### Session 0A — Spec tests (RED)
- [x] T0.1 — `packages/ui/test/layout.absolute.spec.test.ts`: **FX-01** (absolute child at its rect; flow siblings reserve no space), **FX-02** (two absolute children overlap), **FX-03** (absolute child's children flow within its rect), **FX-04** (re-layout/resize re-honors the rect — no flex snap-back). (03-00 §C; PA-15) ✅ 2026-06-30
- [x] T0.2 — `packages/ui/test/view.drawcontext-role.spec.test.ts`: **FX-05** (`ctx.role('desktop').pattern` / `role('window').border` return role extras). (03-00 §C; PA-16) ✅ 2026-06-30
- [x] T0.3 — Run `yarn test` → FX specs **fail (RED)**; all RD-01…RD-04 + core suites stay green. ✅ 2026-06-30 (5 fail / 193 pass — exactly the new FX specs)

### Session 0B — Implementation (GREEN) + impl tests
- [x] T0.4 — `packages/ui/src/layout/types.ts`: add `position?: 'flow'|'absolute'` + `rect?: Rect` to `LayoutProps`; normalize in `normalizeProps`/`ResolvedProps`. `layout/layout.ts`: partition flow vs absolute in `layoutContainer`; flow flex over the flow subset; place absolute children at their (clamped) content-box-relative rect + recurse. (03-00 §A; AR-28; PA-15) ✅ 2026-06-30
- [x] T0.5 — `packages/ui/src/view/types.ts`: add `role<K extends ThemeRoleName>(name: K): Theme[K]` to `DrawContext`. `view/draw-context.ts`: `role: (name) => theme[name]`. (03-00 §B; PA-16) ✅ 2026-06-30
- [x] T0.6 — Impl tests: `layout.absolute.impl.test.ts` (rect clamp/normalize; mixed flow+absolute container; absolute overflow), `view.drawcontext-role.impl.test.ts` (`role()` over every `ThemeRoleName`). Run tests → FX specs **GREEN**; no RD-02 (18 ST) / RD-03 regressions. ✅ 2026-06-30 (208 ui tests pass)
- [x] T0.7 — `yarn verify` + `lint` green; files ≤ 500 lines. **/gitcm** — `feat(layout): additive absolute child placement (RD-05 Phase 0 / PF-01)` + `feat(view): additive DrawContext.role() raw-role access (RD-05 Phase 0 / PF-03)`. ✅ 2026-06-30 (verify 8/8, lint clean, files ≤ 244 lines)

---

## Phase 1 — Foundation: theme role · loop seams · Commands · dir skeleton

Additive core `windowInactive` role; additive loop `setCapture`/`releaseCapture` + `onFrame`; the
`Commands` constants; the `{app,desktop,window,menu,status}/` dir skeleton + barrels. Covers AC-22
(capture), the AC-20 mechanism (one `onFrame` per flush), and seeds AC-21. (Refs: 03-05.)

### Session 1A — Spec tests (RED)
- [ ] T1.1 — `packages/core/test/theme-windowinactive.spec.test.ts`: `defaultTheme.windowInactive` exists with `{fg,bg,border,title}`; `color('windowInactive')` resolves to a `Style`. (07 §spec; AC-15/21; PA-1)
- [ ] T1.2 — `packages/ui/test/app-shell.seams.spec.test.ts`: **ST-22** (with a capture target set, a mouse move off the target still routes to the target, focus-on-click suppressed) + onFrame fires once per `flush`. (07 §spec; AC-22/20; PA-5,6)
- [ ] T1.3 — Run `yarn test` → confirm the new specs **fail (RED)**; all RD-01…RD-04 + core suites stay green.

### Session 1B — Implementation (GREEN)
- [ ] T1.4 — `packages/core/src/engine/color/theme.ts`: add the `windowInactive: ThemeRole & {border,title}` role + `defaultTheme.windowInactive`; CHANGELOG + README versioning note (additive, non-breaking). (03-05; AR-73; PA-1)
- [ ] T1.5 — `packages/ui/src/event/types.ts`: add `setCapture`/`releaseCapture` **and a settable `onFrame?` member** to `EventLoop` (so `run()` can wire it after the host exists — PF-04/PA-18). `event/event-loop.ts`: capture state + the two methods + the mutable `onFrame` field; fire `this.onFrame?.(renderRoot.buffer())` at end of `runTick`, on `resize`, after `mount`. `event/hit-test.ts`: short-circuit to the capture target (target-local `ev.local`, focus-on-click suppressed). (03-05; AR-82,84; PA-5,6,18)
- [ ] T1.6 — `packages/ui/src/status/commands.ts`: the `Commands` constants (`quit/close/zoom/next/prev/cascade/tile`). Create the `{app,desktop,window,menu,status}/` dirs and seed **minimal constructable class skeletons** so Phase 2's `createApplication` can compose + type them (PF-12): `desktop/desktop.ts` `Desktop extends Group` with only the `desktop`-pattern `draw()` override (`ctx.role('desktop').pattern`) + an `attachLoop(seam)` stub; `menu/menubar.ts` `MenuBar extends View` and `status/statusline.ts` `StatusLine extends View`, each with a no-op `draw()`. (Window stays Phase 3 — it isn't referenced by `createApplication`/ST-01.) Barrels + re-exports in `src/index.ts`. (03-05; AR-76,85; PA-11; PF-12)
- [ ] T1.7 — Run tests → seam + theme specs **GREEN**; no RD-01…RD-04/core regressions.

### Session 1C — Impl tests & hardening
- [ ] T1.8 — `app-shell.seams.impl.test.ts`: capture release on modal open/close + on target unmount; `onFrame` after resize/mount; last-writer-wins `setCapture`; `releaseCapture` no-op. (07 §impl)
- [ ] T1.9 — `yarn verify` + `lint` green; no file > 500 lines. **/gitcm** — `feat(color): additive windowInactive theme role (RD-05 AR-73)` + `feat(event): additive setCapture/releaseCapture + onFrame loop seams (RD-05 PF-001/PF-003)`.

---

## Phase 2 — Application + run() lifecycle

`createApplication` composition + full-screen layout + overlay; `run()` host wiring, `onFrame`→
`host.render`, quit→exit code, restore on every path, suspend/resume; injectable runtime. Covers
AC-1…AC-5. (Refs: 03-01.)

### Session 2A — Spec tests (RED)
- [ ] T2.1 — `app-shell.lifecycle.spec.test.ts`: **ST-01** (composition + layout), **ST-02** (host wiring via fake runtime), **ST-03** (quit→exit code 0/arg), **ST-04** (restore-on-throw), **ST-05** (suspend/resume — host owns reassert+repaint, onResume notify-only). Build the **fake `RuntimeAdapter`** fixture. (07 §spec; AC-1…5; PA-14)
- [ ] T2.2 — Run tests → lifecycle specs **fail (RED)**.

### Session 2B — Implementation (GREEN)
- [ ] T2.3 — `app/application.ts`: `createApplication` — resolve viewport (opts→stdout→80×24); build the app-root `Group` `[menuBar? (flow), desktop (flow,fr:1), statusLine? (flow), overlay (absolute, full-viewport rect — Phase 0, `state.visible=false` until a popup mounts — PF-10)]` + layout, composing the Phase-1 `Desktop`/`MenuBar`/`StatusLine` skeletons (PF-12); `createEventLoop(viewport, {caps,theme,logger,keymap,commands,onIdle})`; `mount(appRoot)`; inject the loop seam into desktop/menubar/statusline; register `Commands` + bind `'quit'`. (03-01; AR-71,75; PA-3,7,12,15; PF-10,12)
- [ ] T2.4 — `app/run.ts`: `run()` — `createHost({caps,onInput→dispatch,onResize→resize,onSuspend,onResume, runtime})` (**single options arg** — PF-07); set `loop.onFrame = host.render` (settable member — PF-04); `host.start()`; paint first frame; await the quit promise; `finally host.stop()` (guaranteed restore). Wire suspend/resume per AR-83 (onResume = notify-only; **no inert flush nudge** — PF-09). (03-01; AR-71,83,86; PA-6,18)
- [ ] T2.5 — Run tests → lifecycle specs **GREEN** (incl. restore-on-throw + suspend/resume via the fake runtime).

### Session 2C — Impl tests & hardening
- [ ] T2.6 — `app-shell.lifecycle.impl.test.ts`: viewport default resolution; `onFrame` call count = flush count; idempotent `host.stop()`; quit-arg coercion; first-frame paint. (07 §impl)
- [ ] T2.7 — `yarn verify` + `lint` green; files ≤ 500 lines. **/gitcm** — `feat(app): createApplication + run() lifecycle — host wiring, quit→exit, restore, suspend/resume (RD-05)`.

---

## Phase 3 — Desktop WM + Window/Frame

The window manager + window chrome. Heaviest phase (4 sessions). Covers AC-6…AC-15. (Refs: 03-02, 03-03.)

### Session 3A — Spec tests (RED)
- [ ] T3.1 — `app-shell.desktop.spec.test.ts`: **ST-06**…**ST-13** (background/z-order, raise, drag-clamp, free-resize+reflow, zoom toggle, cascade/tile, next/prev/Alt-N, close→next active). (07 §spec; AC-6…13)
- [ ] T3.2 — `app-shell.window.spec.test.ts`: **ST-14** (frame chrome + close/zoom box clicks), **ST-15** (active/inactive theming flips on raise). (07 §spec; AC-14,15)
- [ ] T3.3 — Run tests → desktop + window specs **fail (RED)**.

### Session 3B — Implementation: Window + Frame (GREEN, part 1)
- [ ] T3.4 — `window/frame.ts`: `drawFrame(ctx,size,state,role)` (border, centered title, number, close `[■]`, zoom `[↑]`/`[↓]`, SE corner) + `frameZoneAt(size,local,flags)` geometry. (03-03; AR-67,74; PA-8)
- [ ] T3.5 — `window/window.ts`: `Window extends Group` — `focusable = true` (a window is a focus target so raise/`activeWindow()` work — PF-05); reactive `title`, `number`, flags, `position:'absolute'` + `padding:1` content inset, `zoom()`/`close()`, `draw()` (active vs `windowInactive` role via `ctx.role()` border/title — PF-03), `onEvent` (raise-on-down + frame hit-zone → move/resize/close/zoom). (03-03; AR-67,73,74; PA-8,10,16)

### Session 3C — Implementation: Desktop (GREEN, part 2)
- [ ] T3.6 — `desktop/desktop.ts`: **extend the Phase-1 `Desktop` skeleton** (PF-12) — keep its pattern `draw()`/`attachLoop`; add `addWindow`/`removeWindow` (windows are `position:'absolute'`), `raise` (+focus), `activeWindow`, post-process `onEvent` for WM commands. (03-02; AR-67,78,80; PA-7,12,15,16)
- [ ] T3.7 — `desktop/gestures.ts`: `beginMove`/`beginResize` + the captured `onEvent` (move/resize math sets `target.layout.rect` + clamp to PA-4 + `invalidateLayout`; release on up — PF-01). `desktop/arrange.ts`: `cascade`/`tile` (set each window's `layout.rect`; un-zoom, clamp-to-min, degenerate counts) + `focusNextWindow`/`focusPrevWindow`/`focusWindowNumber`. (03-02; AR-67,74,87; PA-4,5,10,15)
- [ ] T3.8 — Barrels + `src/index.ts` re-exports (`Desktop`, `Window`); run tests → desktop + window specs **GREEN**.

### Session 3D — Impl tests & hardening
- [ ] T3.9 — `app-shell.desktop.impl.test.ts`: clamp boundaries; tile grid math + cell-clamp; cascade stagger; un-zoom-before-arrange; capture released when a modal opens. (07 §impl)
- [ ] T3.10 — `app-shell.window.impl.test.ts`: `frameZoneAt` boundaries; flag gating; reactive title repaint; content inset; close disposes the scope (onCleanup spy). (07 §impl)
- [ ] T3.11 — `yarn verify` + `lint` green; files ≤ 500 lines. **/gitcm** — `feat(window): Window + Frame chrome + active/inactive theming (RD-05)` + `feat(desktop): window manager — raise/drag/resize/zoom/cascade/tile/switch/close (RD-05)`.

---

## Phase 4 — Menus

Overlay-hosted nested menus driven by a MenuBar-owned controller. Covers AC-16…AC-18 (+ AC-18 status side in P5). (Refs: 03-04.)

### Session 4A — Spec tests (RED)
- [ ] T4.1 — `app-shell.menu.spec.test.ts`: **ST-16** (builders + F10/click/Alt+F open), **ST-17** (nested nav), **ST-18** (command emit + enable/disable greying). (07 §spec; AC-16,17,18)
- [ ] T4.2 — Run tests → menu specs **fail (RED)**.

### Session 4B — Implementation (GREEN)
- [ ] T4.3 — `menu/builders.ts`: `menuBar`/`subMenu`/`item`/`separator` + tilde `~X~` parsing (accelerator char + display column). (03-04; AR-68,77)
- [ ] T4.4 — `menu/controller.ts`: the nav state machine (open path + highlight indices; ↑↓ skip; Enter activate; ←→ switch; Esc one level; nested sub-popups; item hotkey; save/restore focus). `menu/popup.ts`: `MenuPopup` presentational view (rows; highlighted=menuSelected; disabled greyed). (03-04; AR-68; PA-9)
- [ ] T4.5 — `menu/menubar.ts`: **flesh out the Phase-1 `MenuBar` skeleton** (PF-12) — pre-process; draw titles; `attach(overlay,seam)`; `onEvent` runs the controller; on open set `overlay.state.visible=true` **then** mount popups into the overlay at absolute rects clamped on-screen + a **full-viewport transparent catcher** as the overlay's first child whose `onEvent` closes the menu on an outside mouse-down; on close unmount them and set `overlay.state.visible=false` (PF-06/PF-10). Barrels + `src/index.ts` re-exports. Run tests → menu specs **GREEN**. (03-04; AR-51,68; PA-2,9,19; PF-10)

### Session 4C — Impl tests & hardening
- [ ] T4.6 — `app-shell.menu.impl.test.ts`: tilde parsing; separator/disabled skipping; nested open/close; popup on-screen clamp; click-outside close + focus restore; pre-process consumption (key doesn't reach the focused window while open). (07 §impl)
- [ ] T4.7 — `yarn verify` + `lint` green; files ≤ 500 lines. **/gitcm** — `feat(menu): nested MenuBar/MenuPopup over an overlay layer — builders, navigation, enable/disable (RD-05)`.

---

## Phase 5 — StatusLine + one-frame + demos + packaging + final gate

StatusLine, the one-frame-per-interaction oracle, demos, packaging finalization, full gate. Covers AC-18 (status), AC-19, AC-20, AC-21, AC-22 (integration), AC-22 demo. (Refs: 03-05, 07.)

### Session 5A — Spec tests (RED)
- [ ] T5.1 — `app-shell.status.spec.test.ts`: **ST-19** (status draw/click/accelerator/grey), **ST-20** (one frame per interaction — a drag step / menu key / command cascade each → exactly one `onFrame`). Finalize `app-shell.packaging.spec.test.ts`: **ST-21** (public imports; check:deps; only cross-package edit = `windowInactive`). (07 §spec; AC-18,19,20,21)
- [ ] T5.2 — Run tests → status + packaging specs **fail (RED)** (packaging may partially pass).

### Session 5B — Implementation (GREEN)
- [ ] T5.3 — `status/statusline.ts`: **flesh out the Phase-1 `StatusLine` skeleton** (PF-12) — add `statusLine`/`statusItem` builders; `attach(seam)`; draw (tilde-highlighted items, dim when disabled); `onEvent` (click hit-zone / accelerator → `emitCommand`). Finalize all `src/index.ts` re-exports. (03-05; AR-72,77; PA-12)
- [ ] T5.4 — `packages/examples/shell-demo/`: headless `demo:shell` (scripted dispatch: open 2–3 windows → raise/drag/zoom → drop a menu + fire a command → status line; print ASCII frames via `loop.renderRoot.buffer()`) + the `demo:shell` `tsx` script; the real-TTY interactive demo variant. (03-05; AR-70; PA-13)
- [ ] T5.5 — Run tests → status + packaging specs **GREEN**; the one-frame oracle (ST-20) passes against the integrated shell.

### Session 5C — Impl tests, demo e2e & final gate
- [ ] T5.6 — `app-shell.status.impl.test.ts` (tilde parsing, hit-zones, greying) + `shell-demo.e2e.test.ts` (deterministic ASCII frames, exit 0). (07 §impl/e2e)
- [ ] T5.7 — Full gate: `yarn verify` (typecheck+build+test), `yarn test:e2e`, `yarn check:deps`, `yarn lint`; all green; every new file ≤ 500 lines; manual real-TTY demo smoke (drag/resize/zoom/menu/quit-restore). Update CLAUDE.md (document the `app/desktop/window/menu/status` modules + `demo:shell`). **/gitcmp** — `feat(status): static StatusLine + builders (RD-05)` + `feat(examples): demo:shell — RD-05 app-shell walkthrough` + `docs(project): document the RD-05 app shell in CLAUDE.md`.

---

## 🚨 Master Progress Checklist (All Phases) — MANDATORY

> **⚠️ EXECUTION RULE:** mark each task `[x]` with a timestamp immediately on completion; update the
> Progress header after every task; never batch updates. If this list is missing, reconstruct it from
> the phase details above before executing.

### Phase 0 — Foundation extensions
- [x] 0.1 Absolute-placement spec FX-01…04 (RED) ✅ 2026-06-30
- [x] 0.2 `DrawContext.role` spec FX-05 (RED) ✅ 2026-06-30
- [x] 0.3 Confirm RED ✅ 2026-06-30
- [x] 0.4 RD-02 `absolute` placement (types + layout) ✅ 2026-06-30
- [x] 0.5 RD-03 `DrawContext.role()` (types + draw-context) ✅ 2026-06-30
- [x] 0.6 Impl tests + confirm GREEN ✅ 2026-06-30
- [x] 0.7 Verify + lint + commit ✅ 2026-06-30

### Phase 1 — Foundation
- [ ] 1.1 Core theme-role spec (RED)
- [ ] 1.2 Loop seams spec — ST-22 + onFrame (RED)
- [ ] 1.3 Confirm RED
- [ ] 1.4 `windowInactive` role + defaultTheme + CHANGELOG/README
- [ ] 1.5 `setCapture`/`releaseCapture` + `onFrame` (types/event-loop/hit-test)
- [ ] 1.6 `Commands` constants + dir skeleton + Desktop/MenuBar/StatusLine class skeletons (PF-12) + barrels
- [ ] 1.7 Confirm GREEN
- [ ] 1.8 Seams impl tests
- [ ] 1.9 Verify + lint + commit

### Phase 2 — Application + run()
- [ ] 2.1 Lifecycle spec ST-01…05 + fake runtime fixture (RED)
- [ ] 2.2 Confirm RED
- [ ] 2.3 `createApplication` (compose + layout + overlay + command wiring)
- [ ] 2.4 `run()` (host wiring + onFrame→render + quit→exit + restore + suspend/resume)
- [ ] 2.5 Confirm GREEN
- [ ] 2.6 Lifecycle impl tests
- [ ] 2.7 Verify + lint + commit

### Phase 3 — Desktop + Window/Frame
- [ ] 3.1 Desktop spec ST-06…13 (RED)
- [ ] 3.2 Window spec ST-14,15 (RED)
- [ ] 3.3 Confirm RED
- [ ] 3.4 `frame.ts` (drawFrame + frameZoneAt)
- [ ] 3.5 `window.ts` (Window + zoom/close/inset/onEvent)
- [ ] 3.6 `desktop.ts` (Desktop + raise/add/remove/activeWindow + WM commands)
- [ ] 3.7 `gestures.ts` + `arrange.ts` (drag/resize/capture + cascade/tile/switch)
- [ ] 3.8 Barrels + re-exports; confirm GREEN
- [ ] 3.9 Desktop impl tests
- [ ] 3.10 Window impl tests
- [ ] 3.11 Verify + lint + commit

### Phase 4 — Menus
- [ ] 4.1 Menu spec ST-16,17,18 (RED)
- [ ] 4.2 Confirm RED
- [ ] 4.3 `builders.ts` (+ tilde parsing)
- [ ] 4.4 `controller.ts` + `popup.ts` (nav state machine + presentational popup)
- [ ] 4.5 `menubar.ts` (pre-process + overlay mount); confirm GREEN
- [ ] 4.6 Menu impl tests
- [ ] 4.7 Verify + lint + commit

### Phase 5 — StatusLine + demos + gate
- [ ] 5.1 Status + packaging spec ST-18(status),19,20,21 (RED)
- [ ] 5.2 Confirm RED
- [ ] 5.3 `statusline.ts` + builders + finalize re-exports
- [ ] 5.4 `shell-demo/` (headless `demo:shell` + real-TTY demo)
- [ ] 5.5 Confirm GREEN (incl. ST-20 one-frame)
- [ ] 5.6 Status impl tests + demo e2e
- [ ] 5.7 Full gate + CLAUDE.md + commit/push

---

## Dependencies

```
Phase 0 (absolute placement · DrawContext.role)   ← the foundation the WM/overlay/frame need
    ↓
Phase 1 (theme role · loop seams · Commands · Desktop/MenuBar/StatusLine class skeletons — PF-12)
    ↓
Phase 2 (Application + run())          ← needs onFrame member (P1) + Commands (P1) + the P1 class skeletons to compose/type (PF-12) + absolute overlay (P0)
    ↓
Phase 3 (Desktop + Window/Frame)       ← EXTENDS the P1 Desktop skeleton; needs absolute placement (P0) + DrawContext.role (P0) + capture seam (P1) + windowInactive (P1) + run/compose (P2)
    ↓
Phase 4 (Menus)                        ← needs absolute overlay + catcher (P0/P2) + command registry/enable (P1)
    ↓
Phase 5 (StatusLine + demos + gate)    ← integrates all; the one-frame + demo oracles need P2–P4
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All 18 sessions / 48 tasks completed
2. ✅ `yarn verify` + `yarn test:e2e` + `yarn check:deps` + `yarn lint` all green
3. ✅ All FX-01…FX-05 + ST-01…ST-22 spec oracles pass; no regressions in RD-01…RD-04 + core suites
4. ✅ No dead code — no unused parameters, functions, classes, or modules
5. ✅ Security hardened — clamped-no-op geometry, sanitize-bounded glyph output, guaranteed terminal restore, isolated handler/draw throws
6. ✅ Every new file ≤ 500 lines; public symbols carry JSDoc
7. ✅ One cross-package edit (core `Theme.windowInactive`) + two intra-package RD-02/RD-03 contract extensions (absolute placement; `DrawContext.role`) + two intra-package loop seams; AC-21 holds; loop composed, not re-shaped
8. ✅ CLAUDE.md documents the `app/desktop/window/menu/status` modules + the Phase-0 absolute-placement/role extensions + `demo:shell`
9. ✅ Post-completion project re-analysis (handled by the exec_plan skill)
