# 99 — Execution Plan (RD-11: Containers, Scrolling & Lists)

> **Implements**: jsvision-ui/RD-11 · **Feature**: jsvision-ui · **Plan**: containers-scrolling-lists
> **CodeOps Skills Version**: 3.1.0
> **Progress**: 27 / 34 tasks (79%) · **Last Updated**: 2026-07-01 (Phase 4 Dialog complete)

Spec-first per component (spec oracles RED → implement → GREEN → impl tests → verify). Every TV-derived
component (Phases 1–4) carries the **NON-NEGOTIABLE fidelity gate**: a `[ ] BEFORE-decode` task (GATE 1,
before any draw/geometry code) and a `[ ] AFTER-diff` task (GATE 2, before the component is marked `[x]`)
— see [`codeops/tv-fidelity-gate.md`](../../../../tv-fidelity-gate.md). Every visual component ships a
kitchen-sink story (Phase 5) — see [`codeops/kitchen-sink-gate.md`](../../../../kitchen-sink-gate.md).
Commits via `/gitcm` (or `/gitcmp`); commit mode owned by exec_plan.

**Verify command:** `yarn verify` (targeted: `yarn workspace @jsvision/ui test -- <pattern>`); full done
gate also runs `yarn test:e2e` + `yarn check:deps` + `yarn lint`.

---

## Master Progress Checklist

### Phase 0 — Foundations (additive primitives)  ·  [00-* + 03-01](03-01-foundations.md)
- [x] **P0.1** (spec) `theme-roles.spec.test.ts` (ST-13) + packaging skeleton spec (ST-15 partial) — RED. <!-- 2026-07-01 -->
- [x] **P0.2** Add the six theme roles to core `Theme` + `defaultTheme` with the **decoded** colours (PA-10) + JSDoc decode chain; mirror the core `ROLE_SLOTS` spec map. GREEN ST-13. <!-- 2026-07-01 -->
- [x] **P0.3** Add `Commands.ok/cancel/yes/no` (PA-12); create `scroll/`·`list/`·`dialog/` barrels + wire explicit re-exports in `src/index.ts` (skeleton exports). <!-- 2026-07-01 -->
- [x] **P0.4** Add the `attachModalHost`/`ModalHost` seam to `event/types.ts` + inject it in `execView` (PA-1); impl test: non-`ModalHostAware` view untouched. <!-- 2026-07-01 -->
- [x] **P0.5** Verify (typecheck+build+unit) green; `check:deps` clean. <!-- 2026-07-01 -->
  <!-- verify: 364 ui + all core tests pass; check:deps clean -->


### Phase 1 — ScrollBar  ·  [03-02](03-02-scrollbar.md)  (TV `tscrlbar.cpp`)
- [x] **P1.1** `[x] BEFORE-decode` — re-open `tscrlbar.cpp` + `tvtext1.cpp:113`; record glyphs, `drawPos`, `getPos/getSize`, hit-zones, `scrollStep`, palette in the spec/JSDoc. <!-- 2026-07-01: decode confirmed vs source, recorded in scroll-bar.ts JSDoc -->
- [x] **P1.2** (spec) `scrollbar.spec.test.ts` ST-01/ST-02 (+ ST-14 scrollbar rows) — RED. <!-- 2026-07-01; ST-14 aggregate file built at G.1 -->
- [x] **P1.3** Implement `scroll/scroll-bar.ts` (`ScrollBar`): `draw`=`drawPos(getPos())`, glyphs by orientation, roles; `onEvent` arrow/page/thumb-drag(capture)/wheel; binding+clamp. GREEN ST-01/02. <!-- 2026-07-01; +PA-16 capture seam -->
- [x] **P1.4** Impl tests (`scrollbar.impl.test.ts`): rounding, `getSize` floor, wheel, drag mapping, disabled zones. <!-- 2026-07-01: 11 scrollbar tests green -->
- [x] **P1.5** `[x] AFTER-diff` — re-open `tscrlbar.cpp`, diff cell-by-cell (glyphs, pos min/mid/max, `▓` disabled, colours); record decode in commit. Verify. <!-- 2026-07-01: GATE-2 recorded in scroll-bar.ts; 2 behavioral adaptations noted -->

### Phase 2 — Scroller  ·  [03-03](03-03-scroller.md)  (TV `tscrolle.cpp`)  · depends on P1
- [x] **P2.1** `[x] BEFORE-decode` — re-open `tscrolle.cpp`; record `scrollDraw`/`setLimit`/`delta`/range+`pageStep` math. <!-- 2026-07-01: confirmed vs source, recorded in scroller.ts JSDoc -->
- [x] **P2.2** (spec) `scroller.spec.test.ts` ST-03/ST-04 — RED. <!-- 2026-07-01 -->
- [x] **P2.3** Implement `scroll/scroller.ts` (`Scroller`): Group clipping content child at `-delta`, auto-owned bar(s) in reserved edges, `delta↔bar.value`, `setLimit` range/`pageStep`, keyboard deltas, clamp. GREEN ST-03/04. <!-- 2026-07-01; +PA-17 draw-positioning, PA-18 wheel-on-bar, ScrollBar.setRange -->
- [x] **P2.4** Impl tests: content-smaller-than-viewport disabled bar, `both` edges, clamp, `pageStep`. <!-- 2026-07-01: 9 scroller tests green (incl. drag, wheel, horizontal) -->
- [x] **P2.5** `[x] AFTER-diff` — re-open `tscrolle.cpp`, confirm delta/range/clamp; record. Verify. <!-- 2026-07-01: GATE-2 recorded in scroller.ts -->


### Phase 3 — ListView / ListBox  ·  [03-04](03-04-listview.md)  (TV `tlstview.cpp`/`tlistbox.cpp`/`stddlg.cpp`)  · depends on P1
- [x] **P3.1** `[x] BEFORE-decode` — re-open `tlstview.cpp`+`tlistbox.cpp`+`stddlg.cpp`; record draw loop, getColor 1–5, `focusItem` keep-visible, mouse `newItem`, select broadcast, single-col no-divider, mono-only markers, sorted search. <!-- 2026-07-01: decode recorded in list-rows.ts JSDoc -->
- [x] **P3.2** (spec) `listview.spec.test.ts` ST-05/06/07 + `listbox.spec.test.ts` ST-08 (+ ST-14 list rows) — RED. <!-- 2026-07-01; ST-14 aggregate at G.1 -->
- [x] **P3.3** Implement `list/virtual.ts` (visible-window + keep-visible math) + `list/list-rows.ts` (focusable rows-renderer, colours, no focus glyph PA-5). <!-- 2026-07-01 -->
- [x] **P3.4** Implement `list/list-view.ts` (`ListView<T>` = Group[rows + owned ScrollBar], PA-2; keyboard/mouse/select, sorted display, linear type-ahead PA-3) + `list/list-box.ts` (`ListBox` string preset PA-15). GREEN ST-05/06/07/08. <!-- 2026-07-01 -->
- [x] **P3.5** Impl tests: keep-visible edges, empty `<empty>`, focused clamp on shrink, type-ahead reset/Backspace, sorted stability, virtual-row bounds (security). <!-- 2026-07-01: 12 tests (virtual.impl + listview.impl) green -->
- [x] **P3.6** `[x] AFTER-diff` — re-open the three `.cpp`, diff row colours/`topItem`/select/no-divider/no-marker; record. Verify. <!-- 2026-07-01: GATE-2 in list-rows.ts; ST-06 oracle corrected (focused>selected priority) per fidelity directive -->


### Phase 4 — Dialog + standard buttons  ·  [03-05](03-05-dialog.md)  (TV `tdialog.cpp`/`tgroup.cpp`)  · depends on P0 seam + RD-06
- [x] **P4.1** `[x] BEFORE-decode` — re-open `tdialog.cpp`+`tgroup.cpp`; record TWindow-frame reuse, `wfMove|wfClose`, `valid()` (cmCancel bypass + child sweep), command constants. <!-- 2026-07-01: decode in dialog.ts JSDoc; +cFrame/cTitle decode for PA-19 -->
- [x] **P4.2** (spec) `dialog.spec.test.ts` ST-09/10/11/12 — RED. <!-- 2026-07-01 -->
- [x] **P4.3a** Generalize the shared frame chrome for Dialog (PF-001, **edits existing files**): widen `FrameRole` to include `'dialog'`; add `closable`/`zoomable` to `FrameState` + gate the close/zoom icon draws on them (TV `TFrame` gates on `wfClose`/`wfZoom`); add a decoded `icon` field to the core `dialog` theme role. `Dialog.draw` calls the shared `drawFrame(...)` with the `dialog` role — DRY. (No new frame drawer.) <!-- 2026-07-01; +PA-19: dialog role corrected to TV-faithful white/white/brightGreen -->
- [x] **P4.3** Implement `dialog/dialog.ts` (`Dialog extends Window`: `dialog` role draw via P4.3a, flags PA-6, `attachModalHost`, **postProcess terminating-command catch gated on `isCommandEnabled`** (PF-007) → `valid()`-gate → `endModal`, the `valid()` child sweep PA-7/DEF-16, **and an `onEvent` override routing the frame close-zone + Esc → cancel→`valid()`-bypass→`endModal`, not `super`/`this.close()`**, PF-002) + `dialog/buttons.ts` (standard-button helpers PA-13). GREEN ST-09/10/11/12. <!-- 2026-07-01 -->
- [x] **P4.4** Impl tests: PA-1 non-host guard, children-without-valid treated valid, nested modal LIFO; **frame close `[×]`-click AND Esc each resolve `execView` to `cancel` (no hang) + bypass `valid()`** (PF-002); a disabled terminating command is ignored by the catch (PF-007); the `dialog` frame shows the close box + **no** zoom box (PF-001). <!-- 2026-07-01: 6 dialog impl + 3 modalhost impl green -->
- [x] **P4.5** `[x] AFTER-diff` — re-open `tdialog.cpp`+`tgroup.cpp`, confirm frame role/flags/valid-bypass/sweep/constants; record. Verify. <!-- 2026-07-01: GATE-2 in dialog.ts; verify 414 ui green -->


### Phase 5 — Kitchen-sink stories + Navigator + demo  ·  [03-06](03-06-kitchen-sink.md)
- [ ] **P5.1** Stories `containers/scrollbar`·`scroller`·`listview`·`dialog` (+ `stories/index.ts`); optional `StoryContext.execView` for the Dialog story. Smoke test (ST-16) green.
- [ ] **P5.2** Navigator upgrade in `shell.ts` ONLY: a `ListBox`-in-`Scroller` sidebar `[sidebar | canvas]`, select→`showStory`, Tab sidebar↔canvas, type-ahead filter; menu kept as redundant path (PA-11).
- [ ] **P5.3** `packages/examples/containers-demo/` + `demo:containers` script + `containers-demo.e2e.test.ts` (ASCII frame per step: scrollbar/scroller/listview/dialog-veto-then-ok).
- [ ] **P5.4** Verify: smoke test all stories, e2e green.

### Final — Full acceptance gate
- [ ] **G.1** `ST-15` packaging complete (all symbols exported, files ≤500 lines) + `fidelity.spec.test.ts` ST-14 green.
- [ ] **G.2** Full `yarn verify` + `yarn test:e2e` + `yarn check:deps` + `yarn lint` green; `yarn gate` (informational).
- [ ] **G.3** Update the roadmap (RD-11 → Done) + `DEFERRED.md` (DEF-16 → Shipped) + CLAUDE.md project structure (+ `demo:containers`); techdocs if applicable.

---

## Notes
- **Spec-first is non-negotiable:** never write a component's draw/geometry before its spec oracle exists
  and fails; never edit a spec oracle to match code — except the TV-fidelity exception (a mis-decoded
  oracle yields to a faithful `.cpp` decode; cite it).
- **Zero-ambiguity during execution:** any detail not covered here or in `00-ambiguity-register.md` stops
  work → present options → user decides → record as `PA-NN (runtime)` → resume.
- **File-size discipline:** if `list-view.ts` or `dialog.ts` approaches 500 lines, split (e.g. hoist the
  list keyboard map or the dialog command-routing into a sibling), per the layering standard.
- **Almost-additive (PF-001):** the edits to existing code are the theme roles, `Commands`, the
  `execView` modal-host injection, `src/index.ts` re-exports, the kitchen-sink `shell.ts`/`stories/
  index.ts`, **plus two small frame-chrome edits for Dialog** — `window/frame.ts` made dialog-aware
  (FrameRole + FrameState close/zoom gating) and an `icon` on the core `dialog` role (P4.3a). No
  subsystem is reshaped; the Dialog itself is a `Window` subclass (its `onEvent`/close/Esc handling is
  additive, PF-002).
