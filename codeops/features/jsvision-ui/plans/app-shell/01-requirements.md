# Requirements: App Shell

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-05](../../requirements/RD-05-app-shell.md)

## Feature Overview

RD-05 is the Phase-0 integration keystone: the first RD to touch a live TTY and the first to
produce a windowed desktop driven by a real keyboard and mouse. It composes (does not subclass)
the RD-04 `EventLoop` into a concrete `Application` with a `run()` lifecycle, an owned `Desktop`
window manager, `Window`/`Frame` chrome, nested `MenuBar`/`MenuPopup`, and a static `StatusLine`.
All behavioral decisions are locked upstream (RD-05 AR-67…AR-87); this plan adds only the
plan-level realization choices (PA-1…PA-14).

## Functional Requirements

### Must Have

**Application & lifecycle (AR-71, AR-75, AR-83, AR-86)**
- [ ] `createApplication(opts)` composes the loop (`createEventLoop`), an owned `Desktop`, optional `MenuBar`, optional `StatusLine`, and a full-screen `overlay`, laid out full-screen (menu row · desktop fill · status row · overlay top-z). Exposes `desktop`, `loop`, `run()`.
- [ ] `run(): Promise<number>` builds `createHost({caps,onInput,onResize,onSuspend,onResume})`, routes `onInput→dispatch` / `onResize→resize` / the loop's `onFrame`→`host.render`, paints the first frame, runs until `'quit'`, resolves the exit code (`0` default or the `emitCommand('quit',code)` arg — AR-86).
- [ ] Guaranteed `host.stop()` restore on **every** exit path (normal quit, thrown error, signal).
- [ ] Suspend/resume handled by core's host: `onSuspend` fires before the host soft-restores; on SIGCONT the **host** re-asserts modes + full-repaints, then fires `onResume` (notify-only — AR-83).
- [ ] Injectable `RuntimeAdapter` (default real Node) so the full lifecycle runs headlessly with a fake runtime.

**Desktop window manager (AR-67, AR-78, AR-80, AR-87)**
- [ ] `Desktop extends Group`: children = z-order (back-to-front), fills its area with the core `desktop` role + pattern, always the bottom layer; `addWindow`/`removeWindow`.
- [ ] Mouse-down in a window **raises** it to top of z-order **and** focuses it; `activeWindow()` = top-most focused.
- [ ] Drag-move (title bar) via pointer capture; clamped (title row stays visible, ≥1 frame col inside — PA-4).
- [ ] Free drag-resize (SE corner) via pointer capture, down to min 10×3, content reflows live.
- [ ] Zoom toggles maximized ↔ restored geometry.
- [ ] Cascade/Tile re-arrange all non-modal visible windows (un-zoom first; tile clamps cells to min; 0/1-window degenerate handling — PA-4/AR-87).
- [ ] Window switching: `next`/`prev` + Alt-`N` cycles focus + raises.

**Window & Frame (AR-67, AR-73, AR-74)**
- [ ] `Window extends Group`: reactive `title`, optional `number` (1–9), flags `movable`/`resizable`/`zoomable`/`closable`; `zoom()`, `close()`; content children inset inside the frame (layout `padding:1` — PA-8).
- [ ] `Frame` (Window-internal helper, PA-8): draws border, centered title, number, close box `[■]`, zoom box `[↑]`/`[↓]`, SE resize corner; `Window.onEvent` maps the hit-zones.
- [ ] Active/inactive frame theming via the additive `windowInactive` role (PA-1/AR-73).
- [ ] `close` removes the window + disposes its owner scope (`onCleanup` fires); next window becomes active.

**Menus (AR-68, AR-77)**
- [ ] Declarative builders `menuBar([...])`, `subMenu(title,[...])`, `item(title,command,key?)`, `separator()`; tilde `~X~` hotkey marker.
- [ ] `MenuBar` pinned to row 0, draws titles with hotkeys highlighted, is a **pre-process** view.
- [ ] Activation: F10, title click, Alt+hotkey; opening drops a `MenuPopup` into the overlay.
- [ ] `MenuPopup` nested navigation: ↑↓ (skip separators/disabled), Enter activate, ←→ switch top-level, Esc close one level, sub-`subMenu` opens nested child popup, item hotkey activates.
- [ ] Activating an item emits its `command` via `emitCommand`; a disabled command greys + is non-activatable.

**Status line (AR-72, AR-77)**
- [ ] Builders `statusLine([...])`, `statusItem(text,command,key?)`; tilde `~X~` marker.
- [ ] `StatusLine` pinned to the bottom row, draws items; click or accelerator emits the command; disabled greys (static list; help-context ranges deferred).

**Standard commands & theming (AR-73, AR-76, AR-85)**
- [ ] `Commands` constants module: `quit`/`close`/`zoom`/`next`/`prev`/`cascade`/`tile` (`resize`/`move` dropped — AR-85/PF-004).
- [ ] Additive `windowInactive` role on core `Theme` + `defaultTheme` (the only cross-package edit); existing roles reused.

**Foundation extensions (Phase 0 — PF-01/PF-02/PF-03/PF-06; PA-15/PA-16)**
- [ ] Additive RD-02 `LayoutProps.position:'absolute'` + `rect`: an absolute child is removed from flex flow and placed at its parent-content-relative rect; its children flow within it; survives reflow (so the WM positions windows via `layout.rect` and the overlay is a full-viewport top-z layer).
- [ ] Additive RD-03 `DrawContext.role<K>(name): Theme[K]`: raw-role access for the desktop `pattern` and frame `border`/`title` colors (which `color()` flattens away).

**Loop seams (PF-001/AR-82, PF-003/AR-84, PF-004)**
- [ ] Additive `EventLoop.setCapture(view)`/`releaseCapture()` — captured mouse routes wholesale to the target (PA-5).
- [ ] Additive **settable** `EventLoop.onFrame?(buffer)` member — fired after every flush (tick/resize/mount) so `run()` pushes frames; set by `run()` after the host exists (PA-6/PA-18/PF-04).

**Packaging (AR-81)**
- [ ] Pure TS, zero runtime deps (Node built-ins + `@jsvision/core`), ESM/NodeNext; `packages/ui/src/{app,desktop,window,menu,status}/`; explicit named re-exports via `@jsvision/ui`; `yarn check:deps` passes.

### Should Have
- [ ] Headless `demo:shell` (deterministic synthetic-dispatch ASCII walkthrough — AR-70/PA-13).
- [ ] Real-TTY interactive demo (manual `run()` proof — AR-70/PA-13).
- [ ] `activeWindow()` introspection.

### Won't Have (Out of Scope)
- Leaf form controls (`Button`/`Input`/`ListView`/`Dialog`) → RD-06 (AR-79).
- `ScrollBar`/`Scroller` → RD-06 (AR-69).
- Rich `Dialog` widget → RD-06 (RD-05 reuses `execView`/`endModal`).
- Context-sensitive status-line help ranges (AR-72).
- Typed broadcast/message bus + timer-queue wrapper (AR-58).
- Keyboard move/resize mode + `Commands.resize`/`move` (AR-85/PF-004).

## Technical Requirements

### Performance
- One coalesced `flush()` per dispatch tick / gesture step / command cascade (inherits RD-04 AR-54); a drag step, a menu key, or a command each produce exactly one frame.

### Compatibility
- ESM-only, NodeNext `.js` specifiers; Node 20/22/24; output flows through RD-03 → core `serialize`/`sanitize` (no new parsing). The only **cross-package** edit is the additive `windowInactive` role; the two RD-02/RD-03 contract extensions (absolute placement, `DrawContext.role` — Phase 0/PF-01/PF-03) and the two loop seams are additive **intra-package**.

### Security
- No new untrusted-input surface, no network/persistence. Input arrives as the decoder's typed `InputEvent` union; degenerate geometry (off-desktop drags, out-of-range numbers, empty-space clicks) is a clamped no-op, never throws. All glyphs reach the screen via RD-03 `DrawContext` → core `sanitize` (escape-injection guarded as in RD-03). Command names are opaque string keys compared by equality (no `eval`/shell). `run()` guarantees terminal restore on every exit path. Handler/draw throws are isolated + logged via the injectable screen-safe logger (RD-03 AR-42 / RD-04 AR-66).

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|--------------------|--------|-----------|--------|
| Active/inactive theme shape | new `windowInactive` role · variant fields on `window` | new `windowInactive` role | symmetric with `dialog`; one role = one state | PA-1 / AR-73 |
| Menu popup home | overlay layer · Desktop child · execView modal | dedicated overlay layer (non-modal) | escapes the 1-row clip, paints over windows, doesn't mingle with WM windows | PA-2 / AR-68 |
| Initial viewport | optional+auto-default · required · defer to run() | optional `viewport?`, stdout→80×24 | createApplication exposes loop/desktop synchronously; first resize corrects | PA-3 |
| WM parameters | compact · roomier | compact (10×3, title-row clamp, +1/+2) | smallest usable frame; predictable clamp | PA-4 / AR-67/74 |
| Capture semantics | full-capture-to-target · partial | full capture until release, focus-on-click suppressed | a gesture owns the pointer wholesale | PA-5 / AR-82 |
| onFrame timing | after every flush · after dispatch only | after every flush (tick/resize/mount) | async `endModal`/command frames must paint | PA-6 / AR-84 |
| Desktop↔loop wiring | inject narrow seam · loop back-ref on every View | inject narrow seam into Desktop | keeps the view tree loop-agnostic | PA-7 |
| Frame realization | Window-internal helper · `View` subclass | Window-internal helper | avoids Frame-in-flex conflict; refines RD's indicative sketch | PA-8 |
| Menu nav model | MenuBar-owned controller · per-popup handling | single controller, presentational popups | centralizes nested ←→/Esc-one-level | PA-9 |
| WM gesture state | on Desktop · on Window | on Desktop | manager owns z-order/clamp/loop seam | PA-10 |
| File layout | granular `{app,desktop,window,menu,status}/` · one file | granular split | ≤500-line files; matches `view/`/`event/` | PA-11 |
| Command wiring | Application registers + Desktop handles · per-Window | Application + Desktop | cascade/tile/next/prev are desktop-wide | PA-12 / AR-76 |
| Demos | both · headless only | headless `demo:shell` + real-TTY | deterministic CI + live proof | PA-13 / AR-70 |
| Test approach | fake-runtime lifecycle + synthetic dispatch · real TTY | fake runtime + synthetic dispatch | deterministic; real-TTY ungated | PA-14 / AR-70 |

> **Traceability:** every decision references its Ambiguity Register entry (`00-ambiguity-register.md`). PA-1…PA-14 are this plan's; AR-67…AR-87 are inherited from RD-05.

## Acceptance Criteria

Inherited verbatim from RD-05 AC-1…AC-22 (the immutable oracles); see [07-testing-strategy.md](07-testing-strategy.md) for the ST-01…ST-22 mapping. Summary:

1. [ ] App composition (`createApplication` → desktop/loop/run, full-screen layout). (AR-71,75)
2. [ ] `run()` host wiring (fake runtime drives focus/commands/frames, no TTY). (AR-71)
3. [ ] Quit → exit code (`0`/arg). (AR-71,76,86)
4. [ ] Restore on every exit path (incl. throw). (AR-71)
5. [ ] Suspend/resume (host owns reassert+repaint; `onResume` notify-only). (AR-71,83)
6. [ ] Desktop background + back-to-front z-order. (AR-80,67)
7. [ ] Raise on click. (AR-67,78)
8. [ ] Drag-move (clamped). (AR-67)
9. [ ] Free drag-resize (≥min, reflow). (AR-74)
10. [ ] Zoom toggle. (AR-67)
11. [ ] Cascade/Tile (clamp-to-min, un-zoom, 0/1 handling). (AR-67,87)
12. [ ] Window switching (next/prev/Alt-N). (AR-67)
13. [ ] Close (remove + dispose scope; next active). (AR-67,71)
14. [ ] Frame chrome (border/title/number/close/zoom/resize; box clicks). (AR-67,74)
15. [ ] Active/inactive frame theming (raise flips two frames). (AR-73)
16. [ ] Menu builders + activation (F10/click/Alt+F). (AR-68,77)
17. [ ] Nested menu navigation. (AR-68)
18. [ ] Menu/status command + enable/disable greying. (AR-68,72)
19. [ ] Status line (draw/click/accelerator/grey). (AR-72,77)
20. [ ] One frame per interaction. (AR-71)
21. [ ] Packaging (check:deps; importable; only cross-package edit = `windowInactive`). (AR-73,81)
22. [ ] Demos (headless `demo:shell` + real-TTY). (AR-70)
