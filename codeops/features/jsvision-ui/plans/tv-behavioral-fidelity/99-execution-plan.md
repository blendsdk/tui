# Execution Plan — TV Behavioral Fidelity

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md) · **Implements**: jsvision-ui/RD-10 · **Plan**: `plans/tv-behavioral-fidelity/`
> **Last Updated**: 2026-06-30
> **Progress**: 13/14 tasks (93%) — Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ complete
> **Runtime note**: PA-10 (status release target = item under the release point, TV-exact) corrects AR-88's "same item" paraphrase — recorded in `00-ambiguity-register.md`.
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
- [x] **1.1** Rewrite `app-shell.status.spec.test.ts` (+ `.impl`) to ST-01…ST-03 (held-highlight,
  drag re-target, emit on release of the item under the cursor; remove emit-on-down) and add the core
  ST-04 `statusSelected` test. **RED confirmed** (core ST-16 + 3 ui status specs fail). Cite AR-88/PA-9/PA-10. *(2026-06-30)*

### 1B — Implementation (→ GREEN)
- [x] **1.2** Core: added the additive `statusSelected` role to `Theme` + `defaultTheme`
  (`core/.../theme.ts`); theme ST-16 spec includes it (ST-04). (scope `color`) *(2026-06-30)*
- [x] **1.3** Added `setCapture`/`releaseCapture` to `StatusLoopSeam`; wired in `app/application.ts`. *(2026-06-30)*
- [x] **1.4** Implemented the `pressed`/`holding` model in `StatusLine` (down→capture+highlight,
  captured move→re-target, up→release+emit the item **under the release point** if enabled — PA-10) +
  the `draw` state table (`statusSelected`/`cSelDisabled`). GREEN. (scope `status`) *(2026-06-30)*

### 1C — Impl tests & hardening
- [x] **1.5** Impl tests: held disabled item paints `cSelDisabled` + no emit; bare-down-no-up no emit;
  updated the existing click/greying impl paths to press+release. ui status 10/10 green. *(2026-06-30)*

## Phase 2 — TV-exact cascade + tile  (AR-89/AR-90 · spec 03-02)

### 2A — Spec tests (→ RED)
- [x] **2.1** Rewrote the desktop **ST-11** in `app-shell.desktop.spec.test.ts` to RD-10 ST-05 (cascade
  `(i,i)`/`W−i×H−i`, un-zoom, 0/1, too-small no-op) + ST-06 (tile partitions the desktop via
  `assertPartitions`, **n=2 stacks**, n=3 partition, un-zoom, 0/1, too-small no-op). **RED confirmed**
  (2 failed). Cite AR-89/AR-90/PA-6. *(2026-06-30)*

### 2B — Implementation (→ GREEN)
- [x] **2.2** Ported `iSqr`/`mostEqualDivisors`/`dividerLoc`/`calcTileRect` into `desktop/arrange.ts`
  (private helpers, verbatim from `tdesktop.cpp:139-211`). (scope `desktop`) *(2026-06-30)*
- [x] **2.3** Replaced `cascade()` (TV `doCascade`: `(i,i)`/`W−i×H−i`, tileError no-op) and `tile()`
  (TV `calcTileRect` per window, tileError no-op); dropped the AR-87 preset constants. GREEN (9/9). (scope `desktop`) *(2026-06-30)*

### 2C — Impl tests & hardening
- [x] **2.4** Impl tests: n=3 no-remainder split + n=5 `leftOver` extra-row exactness; cascade
  `(i,i)`/corner-pin; un-zoom; too-small no-op (both). z-order→`pos` mapping (window `i` ⇒ `pos i`)
  confirmed by the GREEN oracles. ui 297 green. *(2026-06-30)*

## Phase 3 — Left-grow resize gesture  (AR-91 · spec 03-03)

### 3A — Spec tests (→ RED)
- [x] **3.1** Added ST-07 (end-to-end SW-grip drag via the loop: right edge fixed, left+bottom move,
  floor 10×3) + ST-08 (`frameZoneAt` `resize-left` for SW grip, `resize` for SE, `border` when not
  resizable) in `app-shell.window.spec.test.ts`. **RED confirmed** (2 failed). *(2026-06-30)*

### 3B — Implementation (→ GREEN)
- [x] **3.2** Extended the `Gesture` union with `resize-left` + `applyResizeLeft` (`gestures.ts`); added
  the `'resize-left'` `FrameZone` + `frameZoneAt` SW branch + removed the "left grip not wired" caveat
  (`frame.ts`). The lower clamp mirrors `applyResize` (width-floor only — PA-11). (scope `window`) *(2026-06-30)*
- [x] **3.3** Wired `Window.onEvent` (`resize-left`→`beginResizeLeft`), the `WindowManager`/`DesktopLoopSeam`
  method, and `Desktop.beginResizeLeft` + the captured-move dispatch branch (`window.ts`/`desktop.ts`).
  GREEN (6/6). (scope `window`/`desktop`) *(2026-06-30)*

### 3C — Impl tests & hardening
- [x] **3.4** Impl tests: top edge fixed + height grows like SE; capture released on up (a stray drag is
  inert); a non-resizable window's SW grip is inert (`border`, no gesture). ui 301 green. *(2026-06-30)*

## Phase 4 — Demos + final gate

- [ ] **4.1** Update `demo:shell` (and/or `tvision-demo`) to exercise cascade + tile so the TV geometry
  shows in the ASCII walkthrough; re-render the `1caa188` drawing spot-checks to prove no regression.
  Run the full gate: `yarn verify`, `yarn check:deps`, `yarn lint`. /gitcmp. (scope `examples`)

---

## Master Progress Checklist

- [x] Phase 1 — Status press/release (1.1–1.5) ✅ *(2026-06-30)*
- [x] Phase 2 — Cascade/tile geometry (2.1–2.4) ✅ *(2026-06-30)*
- [x] Phase 3 — Left-grow resize (3.1–3.4) ✅ *(2026-06-30)*
- [ ] Phase 4 — Demos + final gate (4.1)

**Definition of done:** RD-10 AC-1…AC-11 met; ST-01…ST-09 + the rewritten ST-11/status oracles green;
`yarn verify`/`check:deps`/`lint` clean; one additive cross-package edit (`statusSelected`); the
`1caa188` drawing fidelity unregressed; roadmap row advanced to Done.

**Verify**: `yarn verify` (root) · iterate `yarn workspace @jsvision/ui test`
