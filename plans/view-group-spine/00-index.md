# View/Group Spine — Implementation Plan (Index)

> **Implements**: RD-03
> **Feature**: `@jsvision/ui` view/group spine — the retained `View`/`Group` tree that
> binds RD-01 (reactivity) + RD-02 (layout) into a self-drawing, themed, independently
> renderable widget tree on `@jsvision/core`'s `ScreenBuffer`. Stateless clipped
> `DrawContext`, theme-role resolution, a coalescing repaint pump, and the layout reflow
> pass. Ships the complete `View` shape (onEvent stub + state flags); dispatch/focus
> **logic** is RD-04.
> **Status**: Planned (ready for exec_plan)
> **Created**: 2026-06-29
> **CodeOps Skills Version**: 2.0.0

---

## Overview

The view/group spine is the **keystone of Phase 0**: the first `@jsvision/ui` layer that
is not UI-independent. It reimagines Turbo Vision's `TView`/`TGroup`/`TDrawBuffer`/`TPalette`
as a **retained tree** of persistent objects that keep identity between frames, each with a
`draw(ctx)` method and a clipped, view-local paint API. Per the **disciplined-hybrid** model:
subclass `View` + override `draw()` for custom widgets; reactivity is a widget-attribute
feature via `bind`; structure changes go through RD-01's `Show`/`For`; color resolves through
named theme roles.

It closes the two seams the pillars left open: the **reactive seam** (AR-09) — each `View`
owns an RD-01 scope and a `bind()` helper, and a coalescing, injectable scheduler turns
invalidation into one recomposed frame per tick (AR-02) — and the **layout seam** — RD-03 owns
the reflow pass that builds a `LayoutBox` tree from the view tree, runs RD-02 `layout()`, and
writes parent-relative rects back onto each `view.bounds`.

The build is **additive** on three done subsystems and introduces two small, user-approved
**enabling primitives**: `runWithOwner` on RD-01 (so an imperatively-added child's scope nests
under its parent — AR-43) and `ScreenBuffer.clone()` on core (a faithful previous-frame
snapshot for the damage diff under partial recompose — PA-8). New code lives under
`packages/ui/src/view/`, re-exported through the single `@jsvision/ui` entry point; no
third-party/native runtime deps.

## Document map

| Doc | Purpose |
|-----|---------|
| [00-ambiguity-register.md](00-ambiguity-register.md) | Zero-Ambiguity Gate — plan decisions PA-1…PA-8 + inherited RD AR-30…AR-46 |
| [01-requirements.md](01-requirements.md) | Scope, in/out, success criteria (sourced from RD-03) |
| [02-current-state.md](02-current-state.md) | What exists, patterns to mirror, target file/test layout |
| [03-01-enabling-primitives.md](03-01-enabling-primitives.md) | The two additive primitives: RD-01 `runWithOwner`/`getOwner`/opaque `Owner`; core `ScreenBuffer.clone()` |
| [03-02-view-group-tree.md](03-02-view-group-tree.md) | `View`/`Group`, state flags, `onEvent` stub, owner-scope wiring (add/remove/mount/unmount), `bind`/`invalidate`/`invalidateLayout`, lifecycle |
| [03-03-geometry-drawcontext-theming.md](03-03-geometry-drawcontext-theming.md) | `Point` + pure clip helpers; the stateless clipped `DrawContext`; the `ThemeRole → Style` adapter |
| [03-04-reflow-scheduler-render-root.md](03-04-reflow-scheduler-render-root.md) | The reflow pass; coalescing scheduler + dirty phases; `RenderRoot` (mount/resize/flush/serialize, caps, double-buffer); compose walker (clip + back-to-front + bg + error isolation); `Show`/`For` dynamic children |
| [07-testing-strategy.md](07-testing-strategy.md) | Specification test cases ST-01…ST-20 (↔ RD-03 AC-1…AC-20) + ST-21/ST-22 (the primitives) |
| [99-execution-plan.md](99-execution-plan.md) | Phases, sessions, task checklist (spec-first ordering) |

## Key decisions (at a glance)

| Decision | Choice | Ref |
|----------|--------|-----|
| RD-03/RD-04 boundary | complete `View` shape (onEvent stub + state), logic in RD-04 | AR-30 |
| Reactive seam | per-view scope + `bind()`; effect under the scope | AR-31 |
| Redraw pump | coalescing, **injectable** scheduler (default `queueMicrotask`) | AR-32 |
| Layout seam | RD-03 owns the reflow pass; fresh box tree + box→view map | AR-33, PA-7 |
| Clipping | bounds-clip + back-to-front; occlusion deferred | AR-34 |
| Theming | one theme; `ctx.color(role) → Style` via `{fg,bg}` adapter | AR-35, PA-6 |
| Dynamic children | reuse `Show`/`For` (`N=View`); nested scopes | AR-36 |
| Geometry | reuse `Rect`/`Size2D` + `Point` + pure helpers | AR-37 |
| Composition | single shared `ScreenBuffer`, clip+offset, view-local coords | AR-38 |
| Owner nesting | additive RD-01 `runWithOwner`; scope at add-time | AR-43, PA-1 |
| Frame snapshot | additive core `ScreenBuffer.clone()`; partial recompose | AR-44, PA-8 |
| bind timing | `bind` in `onMount`; pre-mount bind throws `TuiError` | PA-2 |
| File layout | granular split under `src/view/` (mirror reactive/layout) | PA-4 |
| Runnable demo | ship `demo:view` (mirror `demo:reactive`/`demo:layout`) | PA-3 |

## To begin implementation

Use the **exec_plan** skill on `view-group-spine`. Commits reference **/gitcm** / **/gitcmp**;
the verify command is `yarn verify` (per the project CLAUDE.md). Scoped per-package iteration:
`yarn workspace @jsvision/ui test` (and `@jsvision/core test` for the `clone()` primitive).
Commit scope: `view` for the spine, `reactive` for `runWithOwner`, `render` for
`ScreenBuffer.clone()`, `examples` for the demo.
