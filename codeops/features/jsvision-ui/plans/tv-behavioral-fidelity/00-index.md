# TV Behavioral Fidelity Implementation Plan

> **Feature**: Complete RD-05's Turbo Vision fidelity for the four **behaviors** the drawing pass (commit `1caa188`) deferred — status-line press-feedback + emit-on-release, TV-exact cascade + tile geometry, and the functional left-grow resize gesture.
> **Status**: Planning Complete
> **Created**: 2026-06-30
> **Implements**: jsvision-ui/RD-10
> **CodeOps Skills Version**: 3.1.0

## Overview

The TV **drawing**-fidelity pass (`1caa188`) brought every existing chrome component's rendering
into 1:1 agreement with `magiblot/tvision` but deliberately deferred four **behavioral** items.
RD-10 ships them as a single fidelity-completion increment, **superseding** AR-87 (the compact WM
preset) and the emit-on-press status behavior with the user's explicit approval (AR-88…AR-92).

The work is three independent behaviors on the existing RD-05 shell — no new widgets, one additive
core role:

1. **Status press/release** (`tstatusl.cpp` `drawSelect`) — repaint the held item black-on-green on
   mouse-down, track the drag via the loop's pointer-capture seam, emit the command on mouse-**up**
   only if still over the same enabled item. Re-adds the `statusSelected` core role.
2. **Cascade + tile geometry** (`tdesktop.cpp`) — replace the AR-87 preset with TV's exact
   `doCascade` (+1/+1 stagger, extend to the desktop corner) and the `mostEqualDivisors`/
   `dividerLoc`/`calcTileRect` tile (proportional no-remainder split, n=2 stacks), with TV's
   `tileError` ⇒ no-op when the 10×3 minimum won't fit.
3. **Left-grow resize** (`tframe.cpp` `dmDragGrowLeft`) — make the already-drawn bottom-left grip
   `└─` functional: a new `resize-left` gesture moves the left + bottom edges while anchoring the
   right, plus a `resize-left` frame hit-zone.

All three reuse existing RD-05 machinery (the pointer-capture seam, the gesture/`invalidateLayout`
flow, the `DrawContext` paint boundary); the loop is **not** re-shaped. The only cross-package edit
is re-adding the additive `statusSelected` `Theme` role.

## Document Index

| Doc | Purpose |
|-----|---------|
| [00-ambiguity-register.md](00-ambiguity-register.md) | Zero-Ambiguity Gate — plan decisions PA-1…PA-9 + inherited AR-88…AR-92 (✅ GATE PASSED) |
| [01-requirements.md](01-requirements.md) | Scope, in/out, source RD-10 |
| [02-current-state.md](02-current-state.md) | The exact current code each behavior changes (`file:line`) |
| [03-01-status-press-release.md](03-01-status-press-release.md) | Status press feedback + emit-on-release + `statusSelected` role + capture seam |
| [03-02-cascade-tile-geometry.md](03-02-cascade-tile-geometry.md) | TV-exact cascade + tile (`arrange.ts`) + tileError no-op |
| [03-03-left-grow-resize.md](03-03-left-grow-resize.md) | `resize-left` gesture + frame hit-zone + Desktop/Window wiring |
| [07-testing-strategy.md](07-testing-strategy.md) | Spec test cases ST-01…ST-09 + the ST-11/status oracle rewrites |
| [99-execution-plan.md](99-execution-plan.md) | Phases, sessions, task checklist (spec-first) |

## Key facts

- **Complexity**: M. Three self-contained behaviors + one theme role.
- **Cross-package edits**: one (additive core `Theme.statusSelected`). Everything else is intra-`packages/ui`.
- **Superseded**: AR-87 (cascade/tile preset) and emit-on-press status (AR-88…AR-90) — the ST-11
  desktop oracle and the status press/emit specs are rewritten to the TV-faithful expectations.
- **No new runtime dependency**; `yarn verify`/`check:deps`/`lint` stay green.

## Next step

Run the **exec_plan** skill on `tv-behavioral-fidelity` (spec-first: rewrite the oracles RED →
implement → GREEN → impl tests → final gate).
