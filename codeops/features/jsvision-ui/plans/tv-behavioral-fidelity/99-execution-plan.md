# Execution Plan — TV Behavioral Fidelity

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md) · **Implements**: jsvision-ui/RD-10 · **Plan**: `plans/tv-behavioral-fidelity/`
> **Last Updated**: 2026-06-30
> **Progress**: 0/14 tasks (0%)
> **CodeOps Skills Version**: 3.1.0

## Overview

Complete RD-05's TV fidelity for the four deferred behaviors. **Specification-first ordering is
non-negotiable**: every feature phase runs three sessions — **(A) Spec Tests → confirm RED →
(B) Implementation → confirm GREEN → (C) Impl Tests & Hardening**. Spec tests derive from RD-10 ACs
(the immutable oracles ST-01…ST-09 in [07-testing-strategy.md](07-testing-strategy.md)); two existing
oracles (desktop ST-11, status emit) are **rewritten** to the TV-faithful behavior under AR-88…AR-90.
Commits reference **/gitcm** (commit) or **/gitcmp** (commit + push) — never raw git. Verify with
`yarn verify`; iterate with `yarn workspace @jsvision/ui test`. Commit scope: `color` (core theme),
`status` / `desktop` / `window` (ui subsystems), `app` (seam wiring), `examples` (demo).

**🚨 Update this document after EACH completed task!**

> Three feature phases (one per behavior) + a closing demo/gate phase. No new files; one additive
> cross-package edit (core `Theme.statusSelected`). The loop is composed, not re-shaped (it already
> exposes `setCapture`/`releaseCapture`).

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Status press feedback + emit-on-release (core role · capture seam · pressed-state) | 3 | 4–6 h |
| 2 | TV-exact cascade + tile geometry (`arrange.ts`) | 3 | 4–6 h |
| 3 | Left-grow resize gesture (`gestures`/`frame`/`window`/`desktop`) | 3 | 3–5 h |
| 4 | Demos + final gate (no-regression on `1caa188` drawing) | 1 | 1–2 h |
| **Total** | | **10** | **12–19 h** |

---

## Phase 1 — Status press feedback + emit-on-release  (AR-88 · spec 03-01)

### 1A — Spec tests (→ RED)
- [ ] **1.1** Rewrite `app-shell.status.spec.test.ts` (+ `.impl`) to ST-01…ST-03 (held-highlight,
  drag re-target/cancel, emit-on-release; remove the emit-on-down assertions) and add the core
  ST-04 `statusSelected` test. Confirm RED. Cite AR-88/PA-9.

### 1B — Implementation (→ GREEN)
- [ ] **1.2** Core: add the additive `statusSelected` role to `Theme` + `defaultTheme`
  (`core/.../theme.ts`); update the theme spec to include it (ST-04). (scope `color`)
- [ ] **1.3** Add `setCapture`/`releaseCapture` to `StatusLoopSeam`; wire them in
  `app/application.ts`. (scope `status`/`app`)
- [ ] **1.4** Implement the `pressed`-state model in `StatusLine` (down→capture+highlight,
  captured move→re-target, up→release+emit-iff-same-enabled) + the `draw` state table
  (`statusSelected`/`cSelDisabled`). Confirm GREEN. (scope `status`)

### 1C — Impl tests & hardening
- [ ] **1.5** Impl tests: disabled-item press shows `cSelDisabled` + no emit; bare-down-no-up no emit;
  drag off-bar then back; one-coalesced-frame-per-tick holds. `yarn workspace @jsvision/ui test` +
  core green. /gitcm.

## Phase 2 — TV-exact cascade + tile  (AR-89/AR-90 · spec 03-02)

### 2A — Spec tests (→ RED)
- [ ] **2.1** Rewrite the desktop **ST-11** in `app-shell.desktop.spec.test.ts` to ST-05 (cascade
  `(i,i)`/extend-to-corner, un-zoom, 0/1, too-small no-op) + ST-06 (tile partitions the desktop, **n=2
  stacks**, un-zoom, 0/1, too-small no-op). Confirm RED. Cite AR-89/AR-90/PA-6.

### 2B — Implementation (→ GREEN)
- [ ] **2.2** Port `iSqr`/`mostEqualDivisors`/`dividerLoc`/`calcTileRect` into `desktop/arrange.ts`
  (private helpers, verbatim from `tdesktop.cpp`). (scope `desktop`)
- [ ] **2.3** Replace `cascade()` (TV `doCascade`: `(i,i)`/`W−i × H−i`, tileError no-op) and `tile()`
  (TV `calcTileRect` per window, tileError no-op); drop the AR-87 preset constants. Confirm GREEN. (scope `desktop`)

### 2C — Impl tests & hardening
- [ ] **2.4** Impl tests: n=3/4 cell partition exactness + `leftOver` extra-row; cascade un-zoom; the
  too-small no-op for both; the z-order→cell mapping (flip `pos` if the fixture shows TV front-first).
  Green. /gitcm.

## Phase 3 — Left-grow resize gesture  (AR-91 · spec 03-03)

### 3A — Spec tests (→ RED)
- [ ] **3.1** Add ST-07 (`applyResizeLeft`/end-to-end drag: right edge fixed, left+bottom move, floor
  10×3) + ST-08 (`frameZoneAt` `resize-left` for SW grip, `resize` for SE, `border` when not resizable)
  in `app-shell.window.spec.test.ts` / a gestures impl test. Confirm RED.

### 3B — Implementation (→ GREEN)
- [ ] **3.2** Extend the `Gesture` union with `resize-left` + `applyResizeLeft` (`gestures.ts`); add the
  `'resize-left'` `FrameZone` + `frameZoneAt` branch + remove the "left grip not wired" caveat
  (`frame.ts`). (scope `window`)
- [ ] **3.3** Wire `Window.onEvent` (`resize-left`→`beginResizeLeft`), the `WindowManager`/`DesktopLoopSeam`
  method, and `Desktop.beginResizeLeft` + the captured-move dispatch branch (`window.ts`/`desktop.ts`).
  Confirm GREEN. (scope `window`/`desktop`)

### 3C — Impl tests & hardening
- [ ] **3.4** Impl tests: left-clamp reachability bound; height grows like SE; a non-resizable window's
  SW cells are `border`; capture released on up. Green. /gitcm.

## Phase 4 — Demos + final gate

- [ ] **4.1** Update `demo:shell` (and/or `tvision-demo`) to exercise cascade + tile so the TV geometry
  shows in the ASCII walkthrough; re-render the `1caa188` drawing spot-checks to prove no regression.
  Run the full gate: `yarn verify`, `yarn check:deps`, `yarn lint`. /gitcmp. (scope `examples`)

---

## Master Progress Checklist

- [ ] Phase 1 — Status press/release (1.1–1.5)
- [ ] Phase 2 — Cascade/tile geometry (2.1–2.4)
- [ ] Phase 3 — Left-grow resize (3.1–3.4)
- [ ] Phase 4 — Demos + final gate (4.1)

**Definition of done:** RD-10 AC-1…AC-11 met; ST-01…ST-09 + the rewritten ST-11/status oracles green;
`yarn verify`/`check:deps`/`lint` clean; one additive cross-package edit (`statusSelected`); the
`1caa188` drawing fidelity unregressed; roadmap row advanced to Done.

**Verify**: `yarn verify` (root) · iterate `yarn workspace @jsvision/ui test`
