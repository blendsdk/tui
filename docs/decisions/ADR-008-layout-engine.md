# ADR-008: Layout engine for the UI layer — build cell-native vs adopt Yoga/Taffy

> **Date**: 2026-06-28
> **Status**: 🔬 Proposed — OPEN, recorded for re-analysis when the UI/widget layer begins
> **Source**: Design discussion (pre-`make_requirements`), captured for later review

## Context

The foundation (`@jsvision/core`) does **no layout** — widgets/apps address cells
by `(x, y)` and hand-draw into a `ScreenBuffer` (see the keyboard/mouse playground
demo). The upcoming UI/widget layer needs _some_ layout system: nesting, resizing,
and dynamic content make absolute coordinates untenable.

The question on the table: **do we adopt a layout library (Yoga, or something else)
for a flexbox-ish / flex-grid-ish engine, or build our own?** This was explicitly
discussed _setting aside_ the native-compilation concern — i.e., on technical merit,
not packaging.

## The decisive technical factor: cells are integers, layout engines think in floats

Yoga and essentially every web layout engine compute in **floating-point pixels**.
On a screen a sub-pixel error is invisible; in a terminal **every box must land on an
integer column/row**. Rounding each flex child independently makes the children's
widths not sum to the container width → **1-cell gaps or overlaps at flex
boundaries**. Ink (which uses Yoga) exhibits exactly this class of off-by-one quirk.

The correct fix is **integer apportionment**: distribute leftover cells one at a time
to the children with the largest fractional remainders (largest-remainder / Hamilton
method) so a row/column fills _exactly_ to the edge, every time. A cell-native engine
does this by construction. Yoga can be coerced toward integers (`pointScaleFactor=1`),
but that rounds a float result after the fact rather than apportioning — papering over
a model mismatch. **This argument holds even if Yoga shipped as one clean binary.**

## Options Considered

| Option                          | Model                           | Runtime                    | Grid?           | Cell-integer fit                | Notes                                                                      |
| ------------------------------- | ------------------------------- | -------------------------- | --------------- | ------------------------------- | -------------------------------------------------------------------------- |
| **Build cell-native (pure TS)** | flex subset (+ grid/dock later) | zero dep                   | yes, if added   | **native — apportion in cells** | ~few hundred LOC; tunable; paradigm-fit; we maintain it                    |
| **Yoga** (`yoga-layout`)        | flexbox only                    | WASM (no node-gyp anymore) | ❌ no grid      | float→round (gaps)              | Battle-tested (React Native, Ink); black box; can't tune rounding          |
| **Taffy**                       | flexbox **+ CSS grid**          | Rust→WASM                  | ✅ yes          | float→round                     | Modern, maintained (Bevy/Dioxus); strongest "buy" option if grid is needed |
| **kiwi.js** (Cassowary)         | linear constraints              | pure JS                    | via constraints | float→round                     | Very expressive (Ratatui-style); different mental model; heavier API       |

### What reference TUI frameworks actually chose (no consensus on flexbox)

- **Ink** (JS) → Yoga / flexbox. Proves it is _viable_, cell-rounding warts and all.
- **Textual** (Python) → **its own engine**, CSS-like with grid + dock + fractional
  `fr` units. Widely loved; deliberately not flexbox-via-a-C-lib.
- **Ratatui** (Rust) → a **constraint solver** (Cassowary), not flexbox.
- **Turbo Vision** (the SDK's namesake) → **rect + edge-anchoring** (`growMode`); no
  flow layout at all.

The field splits into _borrow-Yoga_ (Ink) vs _build-for-the-medium_ (Textual,
Ratatui) — and the most-praised modern TUIs are in the build camp.

### flexbox-ish vs flexgrid-ish are different decisions

- **Flexbox** (1-D row/column, grow/shrink/basis, justify/align) covers toolbars,
  lists, side-by-side panels, responsive stacking — ~80% of TUI layout.
- **Grid / flexgrid** (2-D tracks: fixed / `fr` / auto) is what dashboards, tables,
  and form layouts want. **Yoga does not do grid; Taffy does.** Grid is actually
  _easier_ to make integer-correct than flexbox (same largest-remainder trick). If
  grid is a real requirement, that alone rules Yoga out.
- A strong toolkit usually offers **flex + grid + dock/anchor** (Textual's model),
  because different screens want different tools — "a layout library" ≠ "just flexbox".

## Decision (tentative — DEFERRED)

**Leaning: build a small cell-native layout engine** (`@jsvision/layout`) —
flexbox subset first, grid second — rather than adopt Yoga. **Not finalized**; to be
confirmed via `make_requirements` → `make_plan` when the UI layer starts.

Two guardrails make "build" low-risk:

1. **Clean seam** — layout is a pure function `(box tree, {cols, rows}) → integer
rects`; the renderer just paints into those rects. Small, golden-testable surface
   (the project's sweet spot), zero new deps.
2. **Low lock-in** — start flex-only; if a future need outgrows it, swap in **Taffy**
   (flex + grid) behind the same interface without touching widgets.

**Flip to "buy" (Taffy) only if** full CSS-spec fidelity is needed _fast_ and we don't
want to own/maintain the engine.

## Consequences

### Positive

- Integer-cell correctness by construction (no Yoga-style boundary gaps).
- Keeps the zero-dep, auditable, pure-TS identity; blends flex + grid + TV anchoring.
- A small, testable module behind a stable rect interface.

### Negative / Risks

- We build and maintain it; not full CSS-flexbox spec fidelity (wrap, min/max,
  aspect-ratio, baseline align take real effort).
- Risk of scope creep toward "reimplement CSS" — mitigated by shipping a deliberate
  _subset_ and a clean swap-to-Taffy escape hatch.

## To re-analyze later (open questions)

- Confirmed model(s): flex subset only, or flex **+** grid **+** dock from the start?
- Is full flexbox spec fidelity ever required (→ reconsider Taffy)?
- Spike first: the integer flex-distribution (apportionment) core — ~40 LOC + a golden
  test — to validate the cell-native approach before committing to the full package.
- Where the engine lives: `packages/layout` (`@jsvision/layout`) consuming
  `@jsvision/core` geometry, consumed by the future widget package.
