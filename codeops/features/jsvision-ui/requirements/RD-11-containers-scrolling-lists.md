# RD-11: Containers, Scrolling & Lists — ScrollBar · Scroller · ListView · Dialog

> **Document**: RD-11-containers-scrolling-lists.md
> **Status**: 🟡 **Stub** — scope reserved; author fully via `add_requirement` once RD-06's control shape is settled (AR-93)
> **Created**: 2026-06-30
> **Project**: jsvision UI (`@jsvision/ui`)
> **Depends On**: RD-06 (Essential controls — `Dialog` hosts the leaf controls), RD-05 (App shell — `Window`/`Frame`, `execView`/`endModal` modality), RD-04/RD-03/RD-02/RD-01 (done), `@jsvision/core` (the additive ScrollBar/ListViewer theme roles land here)
> **Split from**: RD-06 (AR-93) — the focused-core split spun these container/scrolling/list controls out so RD-06 stays small and demoable in a plain `Window`.
> **CodeOps Skills Version**: 3.1.0

---

## Why this is a stub

Per AR-93 (the user-approved split), the Phase-1 controls were divided: RD-06 holds the **leaf
controls + validators** (demoable in a `Window`), and the **container/scrolling/list** controls + the
rich **`Dialog`** are reserved here. RD-11 is authored **after** RD-06 because its `Dialog` hosts
RD-06's controls (`Button`/`Input`/`Cluster`) and its result-mapping depends on their shapes — drafting
it before RD-06 lands would churn. This stub exists so the scope is **captured and not lost**; it is
not yet a gated, AC-complete RD.

## Reserved scope (component map §3–4 → TV `dialogs.h`/`scrollbar.h`/`view.h`)

| Control | TV source | Notes |
|---------|-----------|-------|
| `ScrollBar` | `TScrollBar` | Terminal-intrinsic vertical/horizontal bar; page-area + control-arrow theme roles (cpDialog slots 4–5). |
| `Scroller` | `TScroller` / `TScrollGroup` | A scrollable viewport `Group` clipping oversized content; pairs with a `ScrollBar`. |
| `ListView` | `TListViewer` (base) + `TListBox` (collection) | Virtual scroll (render only visible rows via `getText(i)`); bound to an items array/signal; the `TSortedListBox` sorted/type-ahead variant is an option, not a new class. Theme roles = ListViewer slots 26–29. |
| `Dialog` | `TDialog` | Modal/modeless container + standard control palette; the `execView` (RD-04) target; hosts RD-06 controls; standard-button result mapping. |

## When authored, RD-11 must

- Replicate each control's drawing/geometry from its TV source per the **NON-NEGOTIABLE TV-fidelity
  directive** (glyphs, columns, thumb math, hit-zones).
- Add the faithful `cpGrayDialog` **ScrollBar (4–5)** + **ListViewer (26–29)** theme roles to core
  `Theme` (the RD-06-deferred slots), same additive cross-package pattern as AR-97.
- Define `Dialog` result mapping over RD-04 `execView`/`endModal` and the standard buttons.
- Run its own Zero-Ambiguity Gate (scope, virtual-scroll model, `Scroller`↔`ScrollBar` wiring,
  `Dialog` modality/result API, demo = the `tvforms`/`palette` clones).

> **Next step:** when RD-06 is underway/done, run `make_requirements add_requirement` for RD-11 to
> author this fully (condensed discovery + gate + ACs), then `make_plan`.
