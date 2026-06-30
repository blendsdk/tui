# Current State: App Shell

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

RD-01…RD-04 and `@jsvision/core` are shipped and green. RD-05 builds on their public surfaces with:
one **cross-package** edit (the `windowInactive` theme role); two additive **intra-package**
RD-02/RD-03 contract extensions — `LayoutProps` absolute placement and `DrawContext.role` (Phase 0,
added after the **plan** preflight `00-preflight-report.md` found the WM/overlay/frame need them —
PF-01/02/03/06); and two additive intra-package loop seams (`setCapture`/`releaseCapture`, settable
`onFrame`). Every claim below was verified against live source.

### Relevant Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `packages/ui/src/event/types.ts` | `EventLoop`/`EventLoopOptions` | **Additive:** `setCapture`/`releaseCapture` **and a settable `onFrame?` member** on `EventLoop` (PA-5/PA-6/PA-18/PF-04) |
| `packages/ui/src/event/event-loop.ts` | `createEventLoop` (builds+owns `RenderRoot`, `runTick`) | **Additive:** capture state + `setCapture`/`releaseCapture`; mutable `onFrame` field fired at end of `runTick`/`resize`/`mount` (PA-5/PA-6/PA-18) |
| `packages/ui/src/event/hit-test.ts` | `hitTestRoute` (top-most-first) | **Additive:** short-circuit to the capture target, suppress focus-on-click while captured (PA-5) |
| `packages/ui/src/view/view.ts` | `View` (bounds, state, `onEvent`, `bind`, `invalidate`, `invalidateLayout`, `onMount`/`onCleanup`) | None (consumed); subclassed by `Window`/`Desktop` via `Group` |
| `packages/ui/src/view/group.ts` | `Group` (`children` z-order, `background`, `add`/`remove`/`addDynamic`, `current`) | **Additive (Phase 0):** `Desktop.draw` overrides the space-fill to paint the `desktop` pattern (PF-03) |
| `packages/ui/src/layout/{types,layout}.ts` | RD-02 `LayoutProps` + `layout()` flex pass | **Additive (Phase 0):** `position:'absolute'` + `rect` placement, excluded from flex flow (PF-01/PA-15) |
| `packages/ui/src/view/{types,draw-context}.ts` | RD-03 `DrawContext` (`color(role): Style`) | **Additive (Phase 0):** `role<K>(name): Theme[K]` raw-role access (PF-03/PA-16) |
| `packages/ui/src/view/render-root.ts` | `RenderRoot` (`mount`/`resize`/`flush`/`serialize`/`buffer`) | None (consumed via the loop; reflow unchanged — `layout()` handles absolute) |
| `packages/ui/src/view/reflow.ts` | RD-03 reflow (`layout()` → write `bounds`) | None — already writes back every rect `layout()` returns, incl. absolute children |
| `packages/core/src/engine/color/theme.ts` | `Theme` + `defaultTheme` | **Additive:** `windowInactive: ThemeRole & {border,title}` + default value (PA-1/AR-73) |
| `packages/core/src/engine/host/{types,host,signals}.ts` | `createHost`, `Host`, `RuntimeAdapter`, suspend/resume | None (consumed) |
| `packages/ui/src/index.ts` | UI public barrel (explicit named re-exports) | **Additive:** re-export `app/desktop/window/menu/status` symbols |

### Code Analysis (verified surfaces)

- **`createHost(options: HostOptions): Host`** — `HostOptions = { caps (required), onInput?, onResize?, onSuspend?, onResume?, … }`; `Host = { isTTY, start(): Promise<void>, stop(): Promise<void>, render(buffer: ScreenBuffer): void }` (`host/types.ts:29-68`). `host.render` does its own damage diff against its previous frame and keeps the new one — so RD-05 pushes `loop.renderRoot.buffer()` → `host.render(buffer)` per frame.
- **Suspend/resume** — `signals.ts:110-122`: the SIGCONT handler itself re-asserts raw mode + enter-mode string and full-repaints the last buffer, **then** fires `onResume`. `onSuspend` fires before the soft restore. RD-05's `onResume` is therefore notify-only (AR-83).
- **Initial size** — neither `Host` nor `CapabilityProfile` exposes terminal size; `ResizeEvent = { type:'resize', columns, rows }` arrives via `onResize` (`host/types.ts:19-22`). Hence `ApplicationOptions.viewport?` defaulting to stdout→80×24 (PA-3).
- **`EventLoop`** (`event/types.ts:36-63`) — `renderRoot`, `mount(root)`, `dispatch(event)`, `resize(size)`, `focusNext`/`focusPrev`/`focusView`/`getFocused`, `emitCommand(cmd,arg?)`/`enableCommand`/`isCommandEnabled`, `execView<R>`/`endModal<R>`. `createEventLoop(viewport: Size2D, opts)` builds + owns the `RenderRoot` with a deferring scheduler and drives one coalesced `flush()` per `runTick` (`event-loop.ts`).
- **Mouse routing** (`dispatch.ts:116`, `hit-test.ts:90-115`) — mouse/wheel branch out of the 3-phase sweeps to `hitTestRoute`, which delivers to the **single** top-most hit view (no bubble, no capture). `MouseEvent = { kind:'down'|'up'|'move'|'drag', button, x, y }` (`input/events.ts:30`). 1-based coords normalize to 0-based at the boundary (AR-63). → the capture seam (PA-5) is the additive fix.
- **`Theme`** (`color/theme.ts:25-52`) — roles `desktop` (`{pattern:'░',fg,bg}`), `menuBar`, `menuSelected`, `window` (`{fg,bg,border,title}`), `dialog`, `statusBar`, `shadow`, `button`/`buttonFocused`. **No** active/inactive window distinction → PA-1 adds `windowInactive`. `DrawContext.color(role)` resolves `ThemeRoleName = keyof Theme` → `Style` (RD-03 AR-45) — adding a role makes it resolvable automatically.
- **Keys** — `KeyEvent` has `ctrl`/`alt`/`shift`; the decoder decodes ESC-prefixed Alt keys (`keys.ts:117-124`); `createKeymap` accepts `'alt+x'`/`'f10'` (`keymap.ts`). So F10 and Alt+hotkey are decodable; the `MenuBar` preProcess inspects `ev.event` for `alt && key===<hotkey>`.
- **Modal** (`event/modal.ts`) — `execView` captures by confining the dispatch/hit-test scope to the modal subtree; `endModal` restores focus + resolves. Menus deliberately do **not** use this (non-modal overlay, PA-2).

## Gaps Identified

### Gap 1: No pointer capture for drag/resize
**Current:** every mouse event routes to the top-most hit view; a fast/clamped drag or the 1-cell resize corner loses the gesture.
**Required:** the dragged window keeps receiving move/drag/up until release.
**Fix:** additive `setCapture(view)`/`releaseCapture()` on the loop; `hitTestRoute` short-circuits to the target (PA-5/AR-82).

### Gap 2: No frame-produced hook
**Current:** the loop drives `flush()` but exposes nothing when a frame is produced; async `endModal`/command frames would never reach the terminal.
**Required:** `run()` must push every frame (sync + async) to `host.render`.
**Fix:** additive `EventLoopOptions.onFrame?(buffer)` fired after every flush (PA-6/AR-84).

### Gap 3: No active/inactive window theme role
**Current:** core `Theme.window` is a single role.
**Required:** distinguish the active (top-most focused) window from background windows.
**Fix:** additive `windowInactive` role (PA-1/AR-73).

### Gap 4: Menu popups would be clipped / no overlay layer
**Current:** `DrawContext` clips a child to its parent's rect; there is no top-z overlay, and a flex
`col` would squash an overlay sibling to ~0 height (PF-02).
**Required:** popups paint over windows, taller than the 1-row MenuBar.
**Fix:** a `position:'absolute'` full-viewport `overlay` layer in the app root (Phase 0 / PA-2/PA-15).

### Gap 5: Free-floating windows are clobbered by the flex reflow (PF-01 — critical)
**Current:** `reflow.ts:30-33` overwrites **every** `view.bounds` from the global flex `layout()`
pass; `layout/layout.ts` is pure flex (no overlap, no per-child placement). A `Desktop extends Group`
holding windows as flex children cannot place overlapping windows at arbitrary `(x,y)`, and the WM's
`bounds = …; invalidateLayout()` gesture path triggers the very reflow that discards the geometry
(confirmed by an independent challenger).
**Required:** windows free-float, overlap, and keep their WM-set geometry across reflows.
**Fix:** RD-02 additive `position:'absolute'` + `rect` placement (Phase 0); the WM mutates
`window.layout.rect`, which reflow re-honors (PA-15).

### Gap 6: Role-only theme extras (`pattern`/`border`/`title`) unreachable (PF-03)
**Current:** `DrawContext.color(role)` returns `{fg,bg}` only (`theme-style.ts:15-17`); `Group.draw`
space-fills `background` (`group.ts:38-42`) — the desktop `pattern` and frame `border`/`title` colors
can't be read.
**Required:** the desktop pattern (AR-80/ST-06) and active/inactive frame border/title (AR-73).
**Fix:** RD-03 additive `DrawContext.role<K>(name): Theme[K]` (Phase 0 / PA-16); `Desktop.draw`
overrides the fill to paint the pattern.

## Dependencies

### Internal
- RD-04 `EventLoop` (`createEventLoop`, dispatch/focus/command/modal/`renderRoot`).
- RD-03 `View`/`Group`/`RenderRoot`/`DrawContext`/theme-role resolution.
- RD-02 `layout()` + `Size2D`/`Rect` (window/desktop geometry, content inset via `padding`).
- RD-01 owner scopes (`Window.close` → `unmount` → `onCleanup`).

### External
- `@jsvision/core`: `createHost`/`Host`/`RuntimeAdapter`/`ResizeEvent`, `ScreenBuffer`/`serialize`, `Theme`/`defaultTheme`/`ThemeRole`, `Keymap`/`createKeymap`, `Logger`, `CapabilityProfile`. Zero third-party runtime deps.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Capture seam interacts badly with modality (capture during a modal) | Low | Med | While a modal is active, the capture target must be within the modal scope; release capture when a modal opens/closes (spec ST + impl test) |
| Frame-in-flex layout conflict | Low | Med | Resolved by PA-8 — Frame is a drawing/geometry helper, not a flex child; content insets via `padding:1` |
| `onFrame` double-diff cost (RenderRoot serialize + host.render serialize) | Low | Low | The live path uses only `host.render(buffer())`; the RenderRoot's internal `serialize()` is for tests — harmless |
| Tile cells below min on a tiny desktop | Med | Low | Clamp cells to min; cells may overflow the desktop edge (RD-02 overflow AR-28); 0/1-window degenerate handled (AR-87) |
| Real-TTY behaviors not CI-verifiable | High | Low | Lifecycle/quit/restore/suspend-resume driven by a fake `RuntimeAdapter` (PA-14); real-TTY demo is manual, ungated |
| Absolute placement regresses the RD-02 flex pass | Low | High | Phase 0 lands behind FX-01…FX-04 spec oracles + the existing RD-02 18-ST suite must stay green; absolute children are a strictly-additive branch in `layoutContainer` (flow path unchanged) |
| Absolute window rect drifts from `bounds` | Low | Med | After reflow `window.bounds === window.layout.rect` by construction; the WM reads/writes `layout.rect`, never `bounds` directly (PA-15) |

## Target Layout

```
packages/ui/src/
  app/        index.ts · application.ts (createApplication, layout, command wiring)
              · run.ts (host wiring, onFrame→render, quit→exit, restore, suspend/resume)
  desktop/    index.ts · desktop.ts (Desktop, raise, addWindow/removeWindow, activeWindow)
              · gestures.ts (drag/resize/zoom state + capture handling) · arrange.ts (cascade/tile/switch)
  window/     index.ts · window.ts (Window, zoom/close, content inset) · frame.ts (chrome draw + hit-zone geometry helper)
  menu/       index.ts · builders.ts (menuBar/subMenu/item/separator + tilde) · menubar.ts (MenuBar pre-process)
              · popup.ts (MenuPopup presentational) · controller.ts (navigation state machine)
  status/     index.ts · statusline.ts (StatusLine + statusLine/statusItem builders) · commands.ts (Commands constants)
  index.ts    + explicit named re-exports of the above
packages/core/src/engine/color/theme.ts   + windowInactive role (cross-package)
packages/ui/src/layout/{types,layout}.ts   + position:'absolute' + rect placement (Phase 0 / PF-01)
packages/ui/src/view/{types,draw-context}.ts   + DrawContext.role<K> raw-role access (Phase 0 / PF-03)
packages/ui/src/view/group.ts   + Desktop.draw pattern fill (Phase 0 / PF-03)
packages/ui/src/event/{types,event-loop,hit-test}.ts   + setCapture/releaseCapture + settable onFrame
packages/examples/shell-demo/   headless demo:shell (+ real-TTY interactive demo)
```
