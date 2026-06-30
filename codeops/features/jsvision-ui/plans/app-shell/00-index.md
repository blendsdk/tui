# App Shell Implementation Plan

> **Feature**: The RD-05 app shell — `Application`/`run()`, the `Desktop` window manager, `Window`/`Frame`, nested `MenuBar`/`MenuPopup`, and `StatusLine` — composing the RD-04 `EventLoop` into a runnable, windowed TUI application.
> **Status**: Planning Complete
> **Created**: 2026-06-30
> **Implements**: jsvision-ui/RD-05
> **CodeOps Skills Version**: 3.1.0

## Overview

RD-05 turns the RD-04 dispatch *mechanism* into a *program*. It composes `createEventLoop`
(which builds + owns the `RenderRoot`) with an owned `Desktop`, an optional `MenuBar`, an
optional `StatusLine`, and a full-screen `overlay` layer, then wires `@jsvision/core`'s
`createHost` to the loop so a real terminal drives `dispatch`/`resize` and every composed
frame flows to `host.render` — with the terminal restored on every exit path.

The `Desktop` is the full interactive window manager: child-array order is z-order, a
mouse-down raises + focuses a window (the raise RD-04 deferred), and title-bar drag, SE-corner
free-resize, zoom, cascade/tile, and Alt-N switching mutate window geometry through the loop's
new **pointer-capture** seam so a gesture tracks the cursor past its affordance. `Window` wears
a `Frame` (border, centered title, number, close/zoom boxes, resize corner) themed by the new
**`windowInactive`** core role for the active-vs-background distinction. Menus are a non-modal
overlay driven by a `MenuBar`-owned navigation state machine (nested popups, tilde accelerators,
enable/disable greying); the `StatusLine` is a static, command-bound bottom row.

Two new additive seams on the composed loop make this robust: `setCapture`/`releaseCapture`
(drag/resize tracking — PF-001) and a settable `onFrame` member so `run()` delivers async frames to
the host (PF-003).

**Phase 0 prerequisites (added after plan preflight — see [00-preflight-report.md](00-preflight-report.md)).**
The window manager, the menu overlay, and the frame chrome require two foundation extensions that
RD-02/RD-03 do not provide today: **absolute child placement** in RD-02 `layout()` (so windows
free-float/overlap and survive reflow instead of being clobbered by the global flex pass) and a
**`DrawContext.role()`** accessor in RD-03 (so the desktop pattern and frame border/title colors are
reachable). So RD-05 keeps its **single cross-package edit** (core `Theme.windowInactive`) **plus two
additive intra-package RD-02/RD-03 contract extensions** (absolute placement, `DrawContext.role`) and
the two intra-package loop seams (capture, `onFrame`) — all additive and pure. AC-21's "only
cross-package edit = `windowInactive`" still holds (the RD-02/RD-03 edits are within `packages/ui`).

## Document Index

| #   | Document | Description |
| --- | -------- | ----------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (PA-1…PA-19 + inherited AR-67…AR-87) |
| PF  | [Preflight Report](00-preflight-report.md) · [Scope Addition](00-pf01-scope-addition.md) | Plan preflight findings (PF-01…PF-09) + the Phase-0 scope-addition decision record |
| 00  | [Index](00-index.md) | This document — overview and navigation |
| 01  | [Requirements](01-requirements.md) | Feature requirements and scope (Source: RD-05) |
| 02  | [Current State](02-current-state.md) | Analysis of the RD-01…RD-04 + core surfaces RD-05 builds on |
| 03-00 | [Foundation Extensions (Phase 0)](03-00-foundation-extensions.md) | RD-02 `absolute` placement + RD-03 `DrawContext.role()` — the prerequisites for the WM/overlay/frame (resolves PF-01/02/03/06) |
| 03-01 | [Application & run() lifecycle](03-01-application-run-host.md) | `createApplication`, full-screen layout, host wiring, `onFrame`→`host.render`, quit→exit code, restore, suspend/resume |
| 03-02 | [Desktop window manager](03-02-desktop-wm.md) | Raise, drag-move, free-resize, zoom, cascade/tile, window switching, close |
| 03-03 | [Window & Frame](03-03-window-frame.md) | `Window` container, `Frame` chrome + hit-zones, min-size, active/inactive theming |
| 03-04 | [Menus](03-04-menus.md) | Overlay layer, builders, `MenuBar` pre-process, `MenuPopup` nested navigation, enable/disable |
| 03-05 | [StatusLine, Commands, Theme & loop seams](03-05-statusline-commands-theme-seams.md) | `StatusLine`, `Commands` constants, additive `windowInactive` role, additive `setCapture`/`onFrame` seams, packaging |
| 07  | [Testing Strategy](07-testing-strategy.md) | FX-01…FX-05 (Phase 0) + ST-01…ST-22 spec oracles + implementation tests |
| 99  | [Execution Plan](99-execution-plan.md) | 6 phases (0–5), 18 sessions, 48-task checklist |

## Quick Reference

### Usage Examples

```ts
import { createApplication, Desktop, Window, menuBar, subMenu, item, separator,
         statusLine, statusItem, Commands } from '@jsvision/ui';
import { resolveCapabilities, createKeymap } from '@jsvision/core';

const app = createApplication({
  caps: resolveCapabilities(),
  keymap: createKeymap({ 'alt+x': Commands.quit, 'f10': 'menu' }),
  menuBar: menuBar([
    subMenu('~F~ile', [ item('E~x~it', Commands.quit, 'Alt+X'), separator() ]),
  ]),
  statusLine: statusLine([ statusItem('~Q~uit', Commands.quit, 'Alt+X') ]),
});

const win = new Window('Hello');           // movable/resizable/zoomable/closable by default
app.desktop.addWindow(win);
const code = await app.run();              // wires the real TTY; resolves on 'quit'
process.exit(code);
```

### Key Decisions

| Decision | Outcome |
| -------- | ------- |
| Active/inactive theming | New `windowInactive` role on core `Theme` (PA-1/AR-73) |
| Menu popups | Dedicated full-screen `overlay` layer; non-modal menus (PA-2) |
| Initial viewport | Optional `viewport?`, default stdout→80×24 (PA-3) |
| WM parameters | Compact preset: min 10×3, title-row clamp, cascade +1/+2 (PA-4) |
| Drag/resize robustness | Additive `setCapture`/`releaseCapture` loop seam (PA-5/AR-82) |
| Async frame delivery | Additive `onFrame` hook → `host.render` (PA-6/AR-84) |
| Frame | Window-internal helper, not a `View` subclass (PA-8) |
| Suspend/resume | Host owns mode-reassert + repaint; `onResume` notify-only (AR-83) |
| Window positioning | RD-02 additive `position:'absolute'` + `rect`; WM mutates `layout.rect` (PA-15 / PF-01) |
| Chrome theme access | RD-03 additive `DrawContext.role<K>(name): Theme[K]` (pattern/border/title) (PA-16 / PF-03) |
| `onFrame` shape | Settable member on `EventLoop` (set by `run()`), not an options-only field (PA-18 / PF-04) |
| Menu close-outside | Full-viewport transparent catcher in the overlay (PA-19 / PF-06) |

## Related Files

**New (`packages/ui/src/`):** `app/` (application, run, host-wiring), `desktop/` (desktop, gestures, arrange), `window/` (window, frame), `menu/` (builders, menubar, popup, controller), `status/` (statusline, commands).
**Additive edits:** `packages/core/src/engine/color/theme.ts` (+`windowInactive`); `packages/ui/src/layout/{types.ts,layout.ts}` (+`absolute` placement — Phase 0); `packages/ui/src/view/{types.ts,draw-context.ts,group.ts}` (+`DrawContext.role` / `Desktop.draw` pattern — Phase 0); `packages/ui/src/event/{types.ts,event-loop.ts,hit-test.ts}` (capture + settable `onFrame`); `packages/ui/src/index.ts` (re-exports).
**Tests:** `packages/ui/test/layout.absolute.{spec,impl}.test.ts` + `view.drawcontext-role.{spec,impl}.test.ts` (Phase 0), `packages/ui/test/app-shell.*.{spec,impl}.test.ts`, `packages/core/test/theme-windowinactive.spec.test.ts`, `packages/examples/shell-demo/` (+ e2e).
