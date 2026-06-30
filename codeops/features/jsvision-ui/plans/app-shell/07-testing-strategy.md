# Testing Strategy: App Shell

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals
- **Spec tests (ST-01…ST-22)** — one immutable oracle per RD-05 AC-1…AC-22, derived from the
  requirements/AR, never from implementation. Filed `app-shell.<concern>.spec.test.ts`.
- **Implementation tests** — edge cases, geometry math, internals. Filed `app-shell.<concern>.impl.test.ts`.
- **E2E** — the headless `demo:shell` via `tsx` (`shell-demo.e2e.test.ts`), mirroring `event-demo`/`view-demo`.
- The live-TTY `run()` paths (host wiring, quit→exit, restore-on-throw, suspend/resume) are exercised with an
  **injected fake `RuntimeAdapter`** (PA-14) — deterministic, no real terminal. The real-TTY interactive demo is
  **manual, not a CI gate** (AR-70).

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> Derived EXCLUSIVELY from `01-requirements.md`, the `03-XX` specs, RD-05 AC-1…AC-22, and the Ambiguity
> Register. **IMMUTABLE ORACLE RULE:** if a spec test fails after implementation, the implementation is wrong.

### Foundation extensions (03-00 — Phase 0, gate Phases 3/4)

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| FX-01 | A container with a flow child + an `absolute` child (`position:'absolute'`, `rect`) | The absolute child is placed at its `rect`; the flow child is sized/placed as if the absolute child were absent (flow reserves no space for it) | 03-00 §A / PA-15 |
| FX-02 | A container with two `absolute` children whose rects overlap | Both keep their full rects (overlap allowed); paint order = child-array order | 03-00 §A / PA-15 |
| FX-03 | An `absolute` child that itself has flow children (+ `padding`) | The child's children flow within the child's rect, padding honored | 03-00 §A / PA-15 |
| FX-04 | Lay out, then re-`layout()` at a new viewport (resize) | Each `absolute` child is re-placed at its `rect` — **no** flex snap-back | 03-00 §A / PA-15 |
| FX-05 | `ctx.role('desktop').pattern` and `ctx.role('window').border` | Return the role-only extras (the pattern glyph / border color), not just `{fg,bg}` | 03-00 §B / PA-16 |

### Application & lifecycle (03-01)

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-01 | `createApplication({ caps })` then read `.desktop`/`.loop`/`.run` | Returns an `Application`; `desktop` is a `Desktop`, `loop` is the composed `EventLoop`, `run` is a function; the mounted root composes menu row · desktop fill · status row + an absolute full-viewport `overlay` layer present as a child (carrying `position:'absolute'` + full-viewport `rect` props), **hit/paint-inert (`state.visible=false`) until a popup mounts** (PF-10) | AC-1 / AR-71,75 |
| ST-02 | `run()` with a fake runtime; feed a synthetic key/command stream | `onInput→dispatch`, `onResize→resize` wired; focus/commands/frames advance with **no real TTY**; `host.start()` was called (raw+alt) | AC-2 / AR-71 / PA-14 |
| ST-03 | Emit `'quit'` (no arg, then `emitCommand('quit', 3)`) | `run()` resolves `0` (no arg) / `3` (arg); dispatching stops after quit | AC-3 / AR-71,76,86 |
| ST-04 | An **escaping** error ends the run on the fake runtime: the fake fires `onUncaughtException` (host backstop), or `host.start()`/the first-frame push throws | `host.stop()` ran (cooked/main-screen/cursor restored); the fake records `restored===true` on the throw path. **Note (PF-11):** a *view-handler* (`onEvent`/`draw`) throw is **isolated** by the loop's `deliver` (AR-66, `event-loop.ts:209-215`) — it does **not** end the run and does **not** restore; restore-on-throw is verified only on the escaping path (03-01 error table row 2). | AC-4 / AR-71,66 |
| ST-05 | Fire SIGTSTP then SIGCONT via the fake | `onSuspend` fired before the soft restore; on SIGCONT the **host** re-asserted modes + full-repainted, then fired `onResume`; the app's `onResume` did not re-assert modes (no duplicate enter-mode writes) | AC-5 / AR-71,83 |

### Desktop window manager (03-02)

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-06 | A desktop with two overlapping windows, composed | Desktop fills with the `desktop` role + pattern; windows paint back-to-front in child (z) order | AC-6 / AR-80,67 |
| ST-07 | Mouse-down in a non-top window | It moves to the top of z-order (paints over former coverers) **and** is focused; `activeWindow()` returns it | AC-7 / AR-67,78 |
| ST-08 | Drag the title bar by Δ, including past the desktop edge | Window repositions by Δ, **clamped** (title row visible, ≥1 frame col inside); mouse-up ends the drag (capture released) | AC-8 / AR-67 / PA-4,5 |
| ST-09 | Drag the SE corner to a new size (and below min) | Window resizes to the dragged size, floored at 10×3; content reflows to the new interior | AC-9 / AR-74 / PA-4 |
| ST-10 | Zoom box / `zoom` command twice | First maximizes to fill the desktop; second restores the **exact** prior geometry | AC-10 / AR-67 |
| ST-11 | `cascade()` then `tile()` with N windows (incl. one zoomed; and N=0,1) | Un-zooms first; cascade staggers +1/+2 from top-left; tile packs a grid clamped to min; N=0 no-op, N=1 fills | AC-11 / AR-67,87 / PA-4 |
| ST-12 | `next`/`prev` commands and Alt-`N` | Cycles focus across windows raising the newly-active one; Alt-N focuses+raises the window with `number===N` | AC-12 / AR-67 |
| ST-13 | `close()` the active window | Removed from the desktop; its `onCleanup` fires; the next top-most window becomes active | AC-13 / AR-67,71 |

### Window & Frame (03-03)

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-14 | A window draws; click the close box, then the zoom box | Border, centered title, number, close box `[■]`, zoom box `[↑]`/`[↓]`, SE resize corner all render; close-box click closes; zoom-box click toggles zoom | AC-14 / AR-67,74 |
| ST-15 | Two windows; raise the background one | The newly-active frame renders the `window` (active) role, the now-background frame the `windowInactive` role; raising flips the two | AC-15 / AR-73 |

### Menus (03-04)

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-16 | `menuBar([subMenu('~F~ile',[item('E~x~it',Commands.quit,'Alt+X'),separator()])])`; then F10, a title click, and Alt+F | Builds the bar with the `F` hotkey highlighted; F10, the click, and Alt+F each open the File popup in the overlay | AC-16 / AR-68,77 |
| ST-17 | In an open popup: ↑/↓, Enter, ←/→, Esc, and a `sub` item | ↑/↓ move skipping separators/disabled; Enter emits the highlighted command + closes; ←/→ switch top-level; Esc closes one level; a `sub` item opens a nested child popup | AC-17 / AR-68 |
| ST-18 | Activate an item; disable its command (`enableCommand(name,false)`); re-enable | Activation emits the command through the loop; disabled → greyed + non-activatable; re-enabling restores it (shared menu+status) | AC-18 / AR-68,72 |

### StatusLine, frames, packaging, capture (03-05)

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-19 | `statusLine([statusItem('~Q~uit',Commands.quit,'Alt+X')])`; click the item / press its accelerator; disable it | Draws the item (Q highlighted); a click or the accelerator emits `quit`; a disabled item greys | AC-19 / AR-72,77 |
| ST-20 | A drag step, a menu nav key, a command cascade — each one dispatch | Each produces **exactly one** `RenderRoot.flush()` (one `onFrame`) | AC-20 / AR-71 / PA-6 |
| ST-21 | Import the public symbols; run `check:deps`; diff the cross-package surface | `createApplication`/`Desktop`/`Window`/`MenuBar`/`StatusLine`/builders/`Commands` import from `@jsvision/ui`; `check:deps` passes; the **only** cross-package edit is `windowInactive` on core `Theme` | AC-21 / AR-73,81 |
| ST-22 | Begin a drag, then move the cursor **off** the title/corner (and onto another window) | The dragged window keeps receiving move/up via `setCapture` and tracks the cursor; release on up | AC-22 (capture) / AR-82 / PA-5 |

> **⚠️ AUTHORING RULE:** Derive expectations from the specs above — never from imagined implementation output.
> ST-22 maps to the RD's drag/resize ACs (8/9) realized through the capture seam; it is listed separately so the
> capture mechanism has a dedicated oracle.

## Test Categories

### Specification Tests (from ST-cases above)
> Written BEFORE implementation. Filed `app-shell.<concern>.spec.test.ts` (+ one core spec).

| Test File | ST Cases Covered | Component |
|-----------|------------------|-----------|
| `packages/ui/test/layout.absolute.spec.test.ts` | FX-01…FX-04 | RD-02 absolute placement (Phase 0) |
| `packages/ui/test/view.drawcontext-role.spec.test.ts` | FX-05 | RD-03 `DrawContext.role()` (Phase 0) |
| `packages/ui/test/app-shell.lifecycle.spec.test.ts` | ST-01…ST-05 | Application/run (fake runtime) |
| `packages/ui/test/app-shell.desktop.spec.test.ts` | ST-06…ST-13 | Desktop WM |
| `packages/ui/test/app-shell.window.spec.test.ts` | ST-14, ST-15 | Window/Frame + theming |
| `packages/ui/test/app-shell.menu.spec.test.ts` | ST-16, ST-17, ST-18 | Menus |
| `packages/ui/test/app-shell.status.spec.test.ts` | ST-18, ST-19, ST-20 | StatusLine + one-frame |
| `packages/ui/test/app-shell.seams.spec.test.ts` | ST-22 (+ ST-20 frame count) | Capture / onFrame |
| `packages/ui/test/app-shell.packaging.spec.test.ts` | ST-21 | Packaging |
| `packages/core/test/theme-windowinactive.spec.test.ts` | (supports ST-15/ST-21) | Core Theme role |

### Implementation Tests (edge cases, internals)
> Written AFTER implementation. Filed `app-shell.<concern>.impl.test.ts`.

| Test File | Description | Priority |
|-----------|-------------|----------|
| `layout.absolute.impl.test.ts` | rect clamp/normalize (negative/non-finite); mixed flow+absolute container; absolute overflow past parent | High |
| `view.drawcontext-role.impl.test.ts` | `role()` resolves for every `ThemeRoleName`; `Desktop.draw` pattern fill | High |
| `app-shell.lifecycle.impl.test.ts` | viewport default resolution; `onFrame`=flush count; idempotent `host.stop()`; quit-arg coercion; first-frame paint | High |
| `app-shell.desktop.impl.test.ts` | clamp boundaries; tile grid math + cell-clamp; cascade stagger; un-zoom-before-arrange; capture release on modal open | High |
| `app-shell.window.impl.test.ts` | `frameZoneAt` boundaries; flag gating; reactive title repaint; content inset; close disposes scope (onCleanup spy) | High |
| `app-shell.menu.impl.test.ts` | tilde parsing; separator/disabled skipping; nested open/close; popup on-screen clamp; click-outside close + focus restore; pre-process consumption | High |
| `app-shell.status.impl.test.ts` | tilde parsing; item hit-zones; greying | Med |
| `app-shell.seams.impl.test.ts` | capture short-circuit + focus-on-click suppression; release on unmount; `onFrame` after tick/resize/mount | High |

### Integration Tests

| Test | Components | Description |
|------|-----------|-------------|
| Compose + dispatch | Application+Desktop+Window+Menu+Status | A synthetic session: add windows → raise/drag/zoom → open a menu + fire a command → status click; assert buffer + frame count |

### End-to-End Tests

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| `demo:shell` (headless) | Run the `tsx` demo via `shell-demo.e2e.test.ts` | Prints deterministic ASCII frames for the scripted walkthrough; exit 0 |
| Real-TTY interactive | Manual: launch `run()`; drag/resize/zoom, navigate menus, quit | Quits cleanly with the terminal restored (**manual, not gated** — AR-70) |

## Test Data

### Fixtures Needed
- A **fake `RuntimeAdapter`** (records writes/exit code/`restored`, drives signals + the synthetic input stream, **and can fire `onUncaughtException`/`onUnhandledRejection` for the ST-04 escaping-throw path** — PF-11) — mirrors core's host test fake (PA-14).
- Small fixed viewports (e.g. 40×12) for deterministic geometry assertions.
- Helper to build synthetic `MouseEvent`/`KeyEvent` `DispatchEvent`s (reuse the RD-04 test helpers).

### Mock Requirements
- Only the OS boundary is faked (the `RuntimeAdapter`). Everything else uses real objects (real loop, real desktop/windows/menus, real `ScreenBuffer`) per the testing standard.

## Verification Checklist
- [ ] FX-01…FX-05 (Phase 0) defined + RED before the absolute-placement / role implementation
- [ ] All ST-01…ST-22 defined with concrete input/output pairs
- [ ] Every ST traces to an AC / spec doc / AR entry
- [ ] Spec tests written BEFORE implementation
- [ ] Spec tests verified to FAIL (red) before implementation
- [ ] All spec tests pass (green) after implementation
- [ ] Implementation tests written for edge cases/internals
- [ ] All unit / integration / e2e tests pass; no regressions in RD-01…RD-04 + core suites
- [ ] `yarn check:deps` passes; every new file ≤ 500 lines
