# jsvision UI — Requirements Documents

> **Project**: `@jsvision/ui` — a reimagined Turbo Vision-style widget framework for terminal (TUI) applications in TypeScript, built on the `@jsvision/core` engine.
> **Status**: Draft (RD-01…RD-05 + RD-10 shipped; RD-06 — essential controls + validators — drafted, with RD-11 — containers/scrolling/lists — stubbed as its sibling; RD-07…RD-09 widget tiers in backlog — see the roadmap)
> **Created**: 2026-06-29
> **Architecture**: TypeScript (ESM-only, NodeNext, `strict`), zero runtime dependencies; the **disciplined hybrid** model — a retained widget tree with fine-grained signal reactivity (no virtual DOM). Lives in `packages/ui/`.
> **CodeOps Skills Version**: 2.0.0

---

## Overview

`@jsvision/ui` is the UI layer of jsvision: a widget framework that reimagines
Borland Turbo Vision's architecture (view tree, windows, focus, modality, scrolling)
with a modern, idiomatic TypeScript API, on top of the already-built `@jsvision/core`
engine (rendering, input, host, color, capability detection).

The programming model is the **disciplined hybrid**: a retained widget tree is the
single spine; reactivity is a *widget-attribute feature* via fine-grained signals
(Solid-style, not a React/VDOM reconciler); structure changes go through two
primitives (`Show`/`For`); events are callbacks/commands; color resolves through named
theme roles. The full scope, component triage, and phasing live in the component map
([`../plans/tui-ui/01-component-map.md`](../plans/tui-ui/01-component-map.md)); the
lifecycle of each RD is tracked in the roadmap
([`../plans/00-roadmap.md`](../plans/00-roadmap.md)).

This set is authored incrementally (`add_requirement` per RD) rather than via one
up-front discovery, because the high-level scope is already settled in the component
map and the programming-model decision.

## Domain Glossary

| Term | Definition |
|------|-----------|
| **Signal** | A reactive container holding a value; reads inside a tracking context subscribe to it, writes notify subscribers. |
| **Computed** | A derived signal whose value is a pure function of other signals; lazy + memoized. |
| **Effect** | A side-effecting computation that re-runs when its tracked dependencies change. |
| **Owner / scope** | A node in the disposal tree; disposing it disposes all computations (and runs `onCleanup`) created under it. |
| **Glitch-freedom** | The guarantee that no effect/computed observes a partially-updated graph (dependents run in topological order). |
| **Tracking context** | The dynamic scope (inside a computed/effect) where signal reads are recorded as dependencies. |
| **Retained tree** | The persistent widget object graph (vs. immediate-mode redraw); widgets keep identity between frames. |
| **Disciplined hybrid** | The chosen model: retained tree + signals (attribute reactivity) + `Show`/`For` + callbacks + theme roles. |
| **View / Group** | The retained-tree base node (`View`, abstract) and its one concrete container (`Group`); custom widgets subclass `View` and override `draw()`. |
| **DrawContext** | The stateless, view-local, auto-clipped paint API handed to `draw(ctx)`; mirrors core's `ScreenBuffer` and resolves theme roles via `ctx.color(role)`. |
| **Reflow** | RD-03's pass that builds a `LayoutBox` tree from the view tree, runs RD-02's `layout()`, and writes the resulting parent-relative rects back onto each `view.bounds`. |
| **Invalidate / coalescing scheduler** | `view.invalidate()` marks a view dirty and schedules one coalesced repaint per tick (scheduler injectable; default `queueMicrotask`); relayout and repaint are distinct dirty-phases. |
| **Theme role** | A named UI surface (`window`/`button`/`buttonFocused`/…) resolved to a `Style` at draw time; widgets pick the state-dependent role themselves. |

## Document Index

| # | Document | Description | Depends On |
|---|----------|-------------|------------|
| **AR** | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (audit trail) | — |
| **RD-01** | [Reactive core](RD-01-reactive-core.md) | Signals, computeds, effects, ownership/disposal, `batch`/`untrack`, and the structural primitives `Show`/`For` | — |
| **RD-02** | [Layout engine](RD-02-layout-engine.md) | Cell-native flex `row`/`col` engine: `fixed`/`fr`/`auto` sizing, `justify`/`align`, `gap`/`padding`; a pure `layout(boxTree, viewport) → rects` pass on the apportionment spike (ADR-008) | — (ADR-008) |
| **RD-03** | [View/Group spine](RD-03-view-group-spine.md) | Retained `View`/`Group` tree, stateless clipped `DrawContext`, theme-role resolution; closes the reactive seam (per-view scope + `bind` + coalescing scheduler) and owns the layout reflow pass. Logic-deferred `onEvent`/focus → RD-04 | RD-01, RD-02 |
| **RD-04** | [Event loop + focus + modality + commands](RD-04-event-loop.md) | The host-agnostic dispatch mechanism: `EventLoop` with pure `dispatch(event)`, faithful 3-phase dispatch, the per-group `current` focus chain (Tab/click), top-most-first mouse hit-testing, a typed command layer (registry + key→command keymap), and async modality (`execView`/`endModal`). Drives RD-03's `RenderRoot` one frame per input tick. Concrete `Application`/`run()`/shell → RD-05 | RD-03 (RD-01, RD-02) |
| **RD-05** | [App shell](RD-05-app-shell.md) | The integration keystone: `Application`/`run()` (real `createHost` ↔ `dispatch` wiring + lifecycle, quit→exit code, guaranteed restore), the `Desktop` window manager (z-order raise · drag · free-resize · zoom · cascade/tile · Alt-N), `Window`/`Frame` (chrome + active/inactive theming), full nested `MenuBar`/`MenuPopup`, and a static `StatusLine`. Composes RD-04's `EventLoop`. `ScrollBar`/`Scroller` + leaf controls → RD-06 | RD-04 (RD-01, RD-02, RD-03) |
| **RD-06** | [Essential controls + validators](RD-06-essential-controls.md) | The Tier-1 **leaf controls** + the validator model: `Text`, `Label`, `Button`, `Input`, `CheckGroup`, `RadioGroup` (+ internal `Cluster` base) + validators `filter`/`range`/`lookup`. Adds the faithful `cpGrayDialog` control theme roles to core. Selection+clipboard, `picture`/mask, `MultiCheckGroup` deferred (tracked → RD-07) | RD-05 (RD-04, RD-03, core) |
| **RD-11** | [Containers, scrolling & lists](RD-11-containers-scrolling-lists.md) | 🟡 **Stub** (sibling of RD-06, split per AR-93; authored later): `ScrollBar`, `Scroller`, `ListView` (+ `ListBox`), and the rich `Dialog` (hosts RD-06 controls via `execView`) | RD-06, RD-05 |
| RD-07…RD-09 | *(backlog — see roadmap)* | High-value controls (History/Tree/ComboBox/Tabs/Table/Progress + the RD-06-deferred completions), editor family, files package | per phase |
| **RD-10** | [TV behavioral fidelity](RD-10-tv-behavioral-fidelity.md) | Completes RD-05's TV fidelity for the four **behaviors** the drawing pass (`1caa188`) deferred: status-line press-feedback + emit-on-release, TV-exact cascade + tile geometry (supersedes AR-87), and the functional left-grow resize gesture. Behavior-only; one additive `statusSelected` core role | RD-05 |

## Dependency Graph

```
RD-01 Reactive core ──┐   (UI-independent; the reactivity layer every later
                      │    RD binds widget properties to)
RD-02 Layout engine ──┤   (UI-independent; pure box-tree → integer rects, on
                      │    ADR-008. Independent of RD-01.)
                      ▼
            RD-03 View/Group spine (binds signals → widget invalidation via
                      │              per-view scope + `bind`; coalescing redraw
                      │              scheduler; owns the reflow pass → RD-02;
                      │              retained tree + clipped DrawContext + theme roles.
                      ▼              Ships the View shape; onEvent/focus LOGIC → RD-04)
            RD-04 Event loop + focus + modality + commands (the host-agnostic
                      │              dispatch mechanism: pure dispatch(event), 3-phase
                      │              dispatch, per-group current focus chain, mouse
                      │              hit-test, typed commands, execView modality; drives
                      ▼              RD-03's RenderRoot. Implements onEvent; Application → RD-05)
            RD-05 App shell — Application/run() + Desktop/Window/Frame/MenuBar/StatusLine
                      │              (composes RD-04's EventLoop; wires createHost → dispatch;
                      │               window manager: raise/drag/resize/zoom/cascade/tile; full
                      │               nested menus; static status line; quit→exit; restore-on-exit.
                      ▼               ScrollBar/Scroller + leaf controls → RD-06)
            RD-06 Essential controls + validators (leaf controls Text/Label/Button/Input/
                      │              CheckGroup/RadioGroup + filter/range/lookup validators + the
                      │              faithful cpGrayDialog control theme roles; demoable in a Window)
                      ▼
            RD-11 Containers, scrolling & lists (ScrollBar/Scroller/ListView/Dialog —
                      │              Dialog hosts RD-06 controls via execView; split from RD-06 per AR-93)
                      ▼
            … widgets (RD-07+) — high-value controls, editor, files …
```

RD-01 and RD-02 are the two independent, UI-independent pillars at the root (either can
be built first); the view/group spine (RD-03) consumes both — it binds signals to widget
invalidation and feeds widget layout boxes to the layout pass. RD-03 ships the **complete**
`View`/`Group` shape (including an overridable `onEvent` stub + `focused`/`disabled` state),
but the event-dispatch and focus-traversal **logic** is RD-04, which extends the same class
without re-shaping it.

## Suggested Implementation Order

| Phase | Documents | Description |
|-------|-----------|-------------|
| **0 — Spine pillars** | RD-01 (reactive core), RD-02 (layout engine) | The two UI-independent pillars; either can go first. |
| **0 — Spine** | RD-03…RD-05 | View/Group, event loop/focus/modality, app shell. |
| **1 — Essential controls** | RD-06 → RD-11 | Leaf controls + validators (RD-06), then containers/scrolling/lists + Dialog (RD-11). |
| **2+ — Widgets** | RD-07… | High-value controls, then editor/files. |
| **Fidelity** | RD-10 | Behavior-only completion of RD-05's TV fidelity; independent of the widget tiers — may run before or after RD-06+. |

(Full phasing in the [roadmap](../plans/00-roadmap.md) and [component map](../plans/tui-ui/01-component-map.md).)

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Reactivity model | Fine-grained signals (Solid-style), no VDOM | Surgical updates fit the retained tree + the engine's damage-diff renderer; no reconciler/`react` dep (AR-09) |
| Signal API | Callable accessor + `.set`/`.update` | Clean reads, discoverable writes; matches the project's earlier API sketch (AR-01) |
| Effect timing | Synchronous + explicit `batch()` | Glitch-free, predictable, testable; redraw coalescing handled by the view layer (AR-02) |
| Disposal | Owner-scope tree + `onCleanup` | Automatic teardown on `Show`/`For` unmount; no leaks (AR-03) |

## How to Use These Documents

1. Pick a requirements document (e.g., RD-01).
2. Run the make_plan skill — it uses the RD as input to create an implementation plan.
3. Run the exec_plan skill for the feature and implement iteratively (spec tests first).
