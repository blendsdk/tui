# Testing Strategy — View/Group Spine

> **CodeOps Skills Version**: 2.0.0

Specification-first (CLAUDE.md): write `*.spec.test.ts` from RD-03 acceptance criteria →
confirm red → implement → green → add `*.impl.test.ts` for internals/edges → verify.
**Spec tests are immutable oracles**: each ST below derives from an RD-03 AC (or a plan PA for
the two primitives), never from implementation behavior. If a spec test fails after
implementation, the implementation is wrong.

Tests are vitest `unit` (`*.{spec,impl}.test.ts`) importing the API by name from
`../src/view/index.js` (or `@jsvision/ui` for the packaging spec); the demo is `e2e`. File
layout per [02-current-state.md](02-current-state.md) §Test file layout. Render assertions use a
real `ScreenBuffer` + `serialize()` against a fixed `caps` (real objects, not mocks); the
scheduler is asserted via an **injected synchronous scheduler** that counts/forces flushes.

## Specification test cases (ST → AC, 1:1)

| ST | File | Input → Expected | Trace |
|----|------|------------------|-------|
| ST-01 | view.tree.spec | a `Group` with two child `View`s: after two flushes the children are the **same instances** that drew on frame 1 (retained identity) | AC-1 / AR-40 |
| ST-02 | view.reflow.spec | `mount`+`resize({80,24})` a `col` Group of `[fixed 3, fr 1]` rows → each view's `bounds` equals RD-02 `layout()`'s rect for its box; a nested child's `bounds` is parent-relative | AC-2 / AR-33 |
| ST-03 | view.reflow.spec | hiding a child (`state.visible=false`) + reflow → its siblings reflow to fill the freed space and the hidden view is **not** drawn (no cells emitted for it) | AC-3 / AR-41 |
| ST-04 | view.drawcontext.spec | a view at bounds `(5,2,4,3)` drawing `text(0,0,'X')` lands at absolute `(5,2)`; `text(-1,0,'A')`, `text(4,0,'B')` (past far edge) and a write past an ancestor's rect emit **nothing** into neighbors | AC-4 / AR-39 |
| ST-05 | view.render.spec | two overlapping sibling views (later drawn last) → the later overpaints the earlier in the overlap region (back-to-front); no cover-detection needed | AC-5 / AR-34, AR-38 |
| ST-06 | view.render.spec | a `Group` with `background:'window'` fills its rect with that role's style before children draw → no stale cells show through under a moved/over-painted child | AC-6 / AR-38 |
| ST-07 | view.scheduler.spec | `view.bind(() => sig(), apply)` on a mounted test view: changing `sig` re-runs `apply` and recomposes **only that view's** subtree (spy: other views' `draw` not called), coalesced into one flush | AC-7 / AR-31, AR-32 |
| ST-08 | view.scheduler.spec | with an injected synchronous scheduler, N `invalidate()` calls within one tick produce **exactly one** flush (flush counter == 1) | AC-8 / AR-32 |
| ST-09 | view.scheduler.spec | a draw-only `invalidate()` recomposes **without** running reflow (reflow spy not called); an `invalidateLayout()` runs a reflow (spy called once) | AC-9 / AR-32, AR-33 |
| ST-10 | view.scheduler.spec | `createRenderRoot(size, { caps, schedule })` routes **all** flush scheduling through the injected `schedule` (no `queueMicrotask` — assert the injected fn received every flush) | AC-10 / AR-32 |
| ST-11 | view.tree.spec | removing a subtree (`Group.remove`) disposes descendants' scopes and runs their `onCleanup` (spy); a signal that fed a removed view triggers no further `apply`/repaint | AC-11 / AR-36, AR-43 |
| ST-12 | view.dynamic.spec | `Show<View>` and `For<T, View>` mount/unmount view subtrees in a `Group` (toggle `Show`; reorder/remove `For` items) with no parallel reconciler; unmounted items' `onCleanup` fired | AC-12 / AR-36 |
| ST-13 | view.drawcontext.spec | `ctx.color('button')` equals `themeRoleToStyle(defaultTheme.button)` and `ctx.color('buttonFocused')` the focused role; a widget picks the role from its `focused` state | AC-13 / AR-35 |
| ST-14 | view.render.spec | a test `View` whose `draw()` throws is logged via the injected logger (spy) and its subtree skipped; sibling views still render (their cells present in the frame) | AC-14 / AR-42 |
| ST-15 | view.tree.spec | `View.onEvent` exists and is overridable, and calling it performs **no** dispatch/focus state change in RD-03 | AC-15 / AR-30 |
| ST-16 | view.drawcontext.spec | all glyph output of a frame flows through `ScreenBuffer`+`serialize()`; the serialized bytes contain no RD-03-emitted raw escape (only `serialize`'s own SGR), and text routes through `sanitize` | AC-16 / Security § |
| ST-17 | view.packaging.spec | zero-size viewport, a zero-size view, and an over-large clip each produce clipped no-op draws and zero-size `bounds` **without throwing** | AC-17 / Security § |
| ST-18 | view.packaging.spec | `View`, `Group`, `DrawContext`, `RenderRoot`, `createRenderRoot`, `Point`, `ViewState`, `ThemeRoleName` (+ reused `Rect`/`Size2D`) import from `@jsvision/ui`; `runWithOwner`/`getOwner`/`Owner` import from `@jsvision/ui`; `yarn check:deps` passes | AC-18 / AR-37 |
| ST-19 | view.render.spec | a `RenderRoot` mounts a small test view tree, reflows it, and produces a **non-empty serialized frame** with no RD-04 (the Phase-0 spine) | AC-19 / AR-32, AR-40 |
| ST-20 | view.packaging.spec | no external-input/injection/auth surface beyond terminal output (guarded by core `sanitize`); a frame + reflow are bounded single passes over a finite tree; reactivity inherits the 1000-iteration runaway guard | AC-20 / Security § |
| ST-21 | reactive.ownership.spec | (primitive) `runWithOwner(o, fn)` runs `fn` under owner `o` (a `createRoot` created inside is disposed when `o` is disposed), returns `fn`'s value, and restores the previous ambient owner | PA-1 / AR-43 |
| ST-22 | render-buffer-clone.spec (core) | (primitive) `b.clone()` deep-copies dims + every cell (incl. a wide glyph's lead + continuation): `serialize(clone, b, {caps})` body is empty; mutating the clone leaves `b` unchanged | PA-8 / AR-44 |

## Implementation tests (`*.impl.test.ts`) — internals & edges (not exhaustive)

- **reactive.ownership.impl**: `runWithOwner(null, …)` leaves a computation unowned (dev-warn); nested `runWithOwner` restores; a throw in `fn` still restores the previous owner.
- **view.tree.impl**: `add` before vs after the Group is mounted (deferred vs immediate child mount); deep nesting disposes depth-first; `onMount` fires once, after first reflow; double-`remove` is a safe no-op.
- **view.drawcontext.impl**: clip-drop at each of the four edges; a wide glyph straddling the clip edge is dropped whole (no half-cell); `fill` covers exactly the view rect; `box`/`shadow` clip to the view rect; `themeRoleToStyle` ignores `hotkey`/`border`/`title`/`pattern`.
- **view.reflow.impl**: `visible:false` on a nested container omits its whole subtree; `measure` deferral to a view; fresh box tree per pass (no cross-pass cache); degenerate viewport → zero bounds, no throw.
- **view.render.impl**: partial recompose redraws only the dirty subtree (cache reused); reflow invalidates the compose cache (a moved view triggers full compose); a `Group` bg fill under an overlapping child; error-isolation logs once per throwing view and continues siblings.
- **view.scheduler.impl**: `bind` with `{ relayout: true }` runs a reflow; `onMount`→`bind`→initial `apply`+`invalidate` schedules exactly one extra coalesced frame; `invalidate` before mount is a no-op.
- **view.dynamic.impl**: `For` key reorder reuses node instances (retained identity through a move); `Show` else-branch mount/unmount; a removed `For` item's bound signal triggers no work.
- **render-buffer-clone.impl (core)**: clone of an empty buffer; clone after `box`/`shadow`; independence under subsequent `set` on either copy.

> Packaging has **no separate `.impl`**: the re-export shape, degenerate-safety, and the
> security/bounded-pass checks are covered by ST-17/ST-18/ST-20 in `view.packaging.spec.test.ts`.

## E2E (demo, PA-3)

- `packages/examples/test/view-demo.e2e.test.ts`: spawns `demo:view` (as the probe e2e does);
  asserts it exits 0 and prints a non-empty themed ASCII frame (a Group with a background role +
  child views laid out by the reflow pass). Mirrors `reactive-demo`/`layout-demo`.

## Security tests (mandatory subset)

- **Injection boundary** (ST-16): RD-03 emits no raw escapes; text routes through `ScreenBuffer`
  → `sanitize`. **Degenerate inputs** (ST-17): zero/over-large geometry → no-ops, never throws.
- **Availability/bounded** (ST-20): a frame flush + reflow are single bounded passes over a
  finite tree; reactivity inherits RD-01's fixed 1000-iteration runaway guard (AR-18). No
  external-input/auth surface — categories N/A, recorded honestly (RD-03 §Security).

## Verification

- Targeted: `yarn workspace @jsvision/ui test` (and `@jsvision/core test` for ST-22) — `test -- <file>` while iterating; demo via `yarn workspace @jsvision/examples test:e2e`.
- Full gate before done: `yarn verify` + `yarn test:e2e` + `yarn workspace @jsvision/ui check:deps` + `yarn lint`.
