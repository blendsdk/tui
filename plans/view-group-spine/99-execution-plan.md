# Execution Plan — View/Group Spine

> **Implements**: RD-03 · **Plan**: `plans/view-group-spine/`
> **CodeOps Skills Version**: 2.0.0

Specification-first ordering is **non-negotiable**: every feature phase runs three sessions —
**(A) Spec Tests → confirm RED → (B) Implementation → confirm GREEN → (C) Impl Tests & Hardening**.
Spec tests derive from RD-03 ACs (the immutable oracles in
[07-testing-strategy.md](07-testing-strategy.md)). Commits reference **/gitcm** (commit) or
**/gitcmp** (commit + push) — never raw git. Verify with `yarn verify`; iterate with
`yarn workspace @jsvision/ui test`. Commit scope per area: `reactive` (runWithOwner), `render`
(clone), `view` (the spine), `examples` (demo).

Seven phases: enabling primitives → tree+lifecycle → DrawContext+theming → reflow → render
root+compose → scheduler+partial recompose → dynamic children+packaging+demo. Each phase
produces files ≤ 500 lines (PA-4) with full JSDoc on public symbols.

---

## Phase 1 — Enabling primitives (`runWithOwner`, `ScreenBuffer.clone`)

The two additive primitives on done subsystems (03-01). Self-contained; unblock the spine.

### Session 1A — Spec tests (RED)
- [ ] T1.1 — Extend `reactive.ownership.spec.test.ts` with **ST-21** (`runWithOwner` nests + restores). (PA-1)
- [ ] T1.2 — Add `packages/core/test/render-buffer-clone.spec.test.ts` with **ST-22** (`clone()` exactness incl. wide/continuation cells). (PA-8)
- [ ] T1.3 — Run `yarn workspace @jsvision/ui test` + `@jsvision/core test` → confirm ST-21/ST-22 **fail (RED)**; all existing tests stay green.

### Session 1B — Implementation (GREEN)
- [ ] T1.4 — `reactive/owner.ts`: add `runWithOwner(owner, fn)` (try/finally `setOwner`); `reactive/index.ts`: export `runWithOwner`, `getOwner`, type `Owner`. (03-01 §1, PA-1, AR-43)
- [ ] T1.5 — `render/buffer.ts`: add `public clone(): ScreenBuffer` (deep-copy cells). (03-01 §2, PA-8, AR-44)
- [ ] T1.6 — Run tests → ST-21/ST-22 **GREEN**; RD-01 ownership + core render suites still green.

### Session 1C — Impl tests & hardening
- [ ] T1.7 — Impl tests: `runWithOwner(null,…)`/nested-restore/throw-restore (reactive.ownership.impl); clone empty/box/independence (render-buffer-clone.impl). (07 §impl)
- [ ] T1.8 — `yarn verify` + `lint` green; no file > 500 lines. **/gitcm** — `feat(reactive): runWithOwner explicit-parent scope (RD-03 AR-43)` + `feat(render): ScreenBuffer.clone() frame snapshot (RD-03 AR-44)` (two commits, per scope).

---

## Phase 2 — Geometry + retained tree + lifecycle (`geometry.ts`, `types.ts`, `view.ts`, `group.ts`)

The `View`/`Group` classes, state flags, `onEvent` stub, owner-scope wiring (add/remove/mount/
unmount via `runWithOwner`), `onMount`/`onCleanup`. Covers AC-1, AC-11, AC-15. (No rendering yet
— scope/lifecycle asserted directly.)

### Session 2A — Spec tests (RED)
- [ ] T2.1 — Add `view.tree.spec.test.ts` (**ST-01** retained identity, **ST-11** scope disposal + onCleanup, **ST-15** onEvent stub). (AC-1,11,15)
- [ ] T2.2 — Run tests → tree specs **RED**.

### Session 2B — Implementation (GREEN)
- [ ] T2.3 — `geometry.ts`: `Point` + `intersect`/`translate`/`contains`. `types.ts`: `ViewState`, `ThemeRoleName`, `DrawContext`/`RenderRootOptions` type stubs. (03-03, 03-02, AR-37)
- [ ] T2.4 — `view.ts`: abstract `View` — state defaults, `bounds`, `onEvent` stub, `onMount`/`onCleanup`, `invalidate`/`invalidateLayout` (root-delegating), `bind` (throws pre-mount), scope seams. (03-02, AR-30,31,46, PA-2)
- [ ] T2.5 — `group.ts`: `Group` — `children`, `background`, `add`/`remove`, `mountView` seam (`runWithOwner`+`createRoot` nesting), recursive mount/dispose. Barrel `view/index.ts` + explicit re-exports in `src/index.ts`. (03-02, AR-36,40,43, PA-1)
- [ ] T2.6 — Run tests → tree specs **GREEN** (scope nesting/disposal works for imperative add/remove).

### Session 2C — Impl tests & hardening
- [ ] T2.7 — `view.tree.impl.test.ts` (add before/after mount, depth-first dispose, onMount-once, double-remove no-op). (07 §impl)
- [ ] T2.8 — `yarn verify` + `lint` green; files ≤ 500 lines. **/gitcm** — `feat(view): View/Group retained tree + owner-scope lifecycle`.

---

## Phase 3 — DrawContext + theming (`draw-context.ts`, `theme-style.ts`)

The stateless clipped paint facade + the `ThemeRole→Style` adapter. Covers AC-4, AC-13, AC-16.

### Session 3A — Spec tests (RED)
- [ ] T3.1 — Add `view.drawcontext.spec.test.ts` (**ST-04** clipped view-local paint, **ST-13** color resolution, **ST-16** output-via-core/sanitize). (AC-4,13,16)
- [ ] T3.2 — Run tests → drawcontext specs **RED**.

### Session 3B — Implementation (GREEN)
- [ ] T3.3 — `theme-style.ts`: `themeRoleToStyle(role): Style` (`{fg,bg}`; ignore extras). (03-03, PA-6, AR-45)
- [ ] T3.4 — `draw-context.ts`: `makeDrawContext(buffer, origin, clip, theme)` → `text`/`fillRect`/`fill`/`box`/`shadow`/`color`/`size`, offset+clip, all writes via `ScreenBuffer`. (03-03, AR-38,39)
- [ ] T3.5 — Run tests → drawcontext specs **GREEN**.

### Session 3C — Impl tests & hardening
- [ ] T3.6 — `view.drawcontext.impl.test.ts` (four-edge clip-drop, wide-glyph straddle dropped whole, `fill` exact, `box`/`shadow` clip, adapter ignores extras). (07 §impl)
- [ ] T3.7 — `yarn verify` + `lint` green. **/gitcm** — `feat(view): stateless clipped DrawContext + theme-role resolution`.

---

## Phase 4 — Reflow pass (`reflow.ts`)

View tree → `LayoutBox` tree (+ box→view map) → RD-02 `layout()` → parent-relative `bounds`;
`visible:false` omission. Covers AC-2, AC-3. (Driven directly via a minimal harness; the full
pump lands in Phase 5/6.)

### Session 4A — Spec tests (RED)
- [ ] T4.1 — Add `view.reflow.spec.test.ts` (**ST-02** bounds writeback + parent-relative, **ST-03** visible:false omitted + siblings refill). (AC-2,3)
- [ ] T4.2 — Run tests → reflow specs **RED**.

### Session 4B — Implementation (GREEN)
- [ ] T4.3 — `reflow.ts`: `reflow(root, viewport)` — build fresh `LayoutBox` tree + `Map<LayoutBox,View>` (skip `visible:false`), call `layout()`, write rects to `view.bounds`. (03-04, AR-33,41, PA-7)
- [ ] T4.4 — Run tests → reflow specs **GREEN**.

### Session 4C — Impl tests & hardening
- [ ] T4.5 — `view.reflow.impl.test.ts` (nested hidden subtree omitted, `measure` deferral, fresh tree per pass, degenerate viewport → zero bounds no throw). (07 §impl)
- [ ] T4.6 — `yarn verify` + `lint` green. **/gitcm** — `feat(view): reflow pass — view tree → RD-02 layout → bounds`.

---

## Phase 5 — Render root + compose walker (`render-root.ts`)

`RenderRoot` (buffers + `clone` snapshot + caps + theme + logger), `mount`/`resize`/`flush`/
`serialize`, and the compose walker (clip + back-to-front + bg fill + draw-error isolation),
**full-compose** path first. Covers AC-5, AC-6, AC-14, AC-19, AC-16-render.

### Session 5A — Spec tests (RED)
- [ ] T5.1 — Add `view.render.spec.test.ts` (**ST-05** back-to-front overlap, **ST-06** Group bg fill, **ST-14** draw-error isolation, **ST-19** standalone render). (AC-5,6,14,19)
- [ ] T5.2 — Run tests → render specs **RED**.

### Session 5B — Implementation (GREEN)
- [ ] T5.3 — `render-root.ts`: `createRenderRoot(size, {caps,theme?,schedule?,logger?})`; persistent `current` buffer; `mount` (recursive mount + first reflow + full compose); `resize`; `serialize()` (`clone`→`serialize(current,previous,{caps})`). (03-04, AR-32,38,44, PA-8)
- [ ] T5.4 — Compose walker: clip (`intersect`), back-to-front child recursion, `Group` bg via `draw`, per-view `try/catch`→logger + skip subtree, compose-context cache. (03-04, AR-34,38,42)
- [ ] T5.5 — Run tests → render specs **GREEN**. Split `compose.ts` out of `render-root.ts` if nearing 500 lines (PA-4).

### Session 5C — Impl tests & hardening
- [ ] T5.6 — `view.render.impl.test.ts` (bg under overlap, error logged once + siblings continue, full-compose cache populated). (07 §impl)
- [ ] T5.7 — `yarn verify` + `lint` green; files ≤ 500 lines. **/gitcm** — `feat(view): render root + compose walker (clip, back-to-front, bg, error isolation)`.

---

## Phase 6 — Coalescing scheduler + partial recompose (`render-root.ts`)

The dirty set + injectable scheduler + the two dirty-phases + partial recompose using the cached
compose contexts; `bind` wired to repaint. Covers AC-7, AC-8, AC-9, AC-10.

### Session 6A — Spec tests (RED)
- [ ] T6.1 — Add `view.scheduler.spec.test.ts` (**ST-07** bind→repaint-only-subtree, **ST-08** coalescing one flush, **ST-09** relayout vs repaint, **ST-10** injectable scheduler). (AC-7,8,9,10)
- [ ] T6.2 — Run tests → scheduler specs **RED**.

### Session 6B — Implementation (GREEN)
- [ ] T6.3 — `render-root.ts`: dirty set + `needsReflow`; `scheduleFlush`/`flush` (reflow-or-partial branch); `markRepaint`/`markRelayout`; `topmostDirty`; partial `composeSubtree` from cached context (reflow invalidates the cache). Wire `View.invalidate`/`invalidateLayout`/`bind` through the root. (03-04, AR-32,33, PA-8)
- [ ] T6.4 — Run tests → scheduler specs **GREEN**.

### Session 6C — Impl tests & hardening
- [ ] T6.5 — `view.scheduler.impl.test.ts` (`{relayout:true}` reflows; onMount→bind→one extra coalesced frame; pre-mount invalidate no-op; reflow busts the cache). (07 §impl)
- [ ] T6.6 — `yarn verify` + `lint` green. **/gitcm** — `feat(view): coalescing scheduler + partial recompose (repaint/relayout phases)`.

---

## Phase 7 — Dynamic children + packaging + demo + final gate

`Show`/`For` (`N=View`) dynamic children, the full public surface, the runnable `demo:view`, and
the cross-cutting guarantees. Covers AC-12, AC-17, AC-18, AC-20 (+ AC-19 e2e).

### Session 7A — Spec tests (RED)
- [ ] T7.1 — Add `view.dynamic.spec.test.ts` (**ST-12** Show/For N=View mount/unmount). Add `view.packaging.spec.test.ts` (**ST-17** degenerate, **ST-18** packaging/imports + check:deps, **ST-20** security/bounded). (AC-12,17,18,20)
- [ ] T7.2 — Run tests → dynamic + packaging specs **RED**.

### Session 7B — Implementation (GREEN)
- [ ] T7.3 — `group.ts`/`render-root.ts`: dynamic-child reconcile effect (read `Show`/`For` accessor under the group's scope, diff → `mountView`/`remove`, schedule reflow). (03-04, AR-36)
- [ ] T7.4 — Finalize the `view/index.ts` barrel + explicit re-exports in `src/index.ts` (all public symbols); degenerate-geometry hardening (zero/over-large → no-ops). (AR-37, AC-17,18)
- [ ] T7.5 — `packages/examples/view-demo/main.ts` + `"demo:view"` script; `view-demo.e2e.test.ts`. (PA-3)
- [ ] T7.6 — Run tests → dynamic + packaging specs **GREEN**; `demo:view` prints a themed frame.

### Session 7C — Final gate
- [ ] T7.7 — `view.dynamic.impl.test.ts` (For key reorder reuses instances, Show else-branch, removed item no work). Full `yarn verify` + `yarn test:e2e` + `check:deps` + `yarn lint` green; no dead code; no file > 500 lines.
- [ ] T7.8 — Update `plans/00-roadmap.md` RD-03 row → stage `Done` (roadmap skill). **/gitcmp** — `feat(view): dynamic children + packaging + demo:view — RD-03 complete`.

---

## Master Progress Checklist

**Phase 1 — Enabling primitives**
- [ ] 1A Spec (RED): T1.1–T1.3
- [ ] 1B Impl (GREEN): T1.4–T1.6
- [ ] 1C Impl tests & harden: T1.7–T1.8 ✅ commit

**Phase 2 — Geometry + retained tree + lifecycle**
- [ ] 2A Spec (RED): T2.1–T2.2
- [ ] 2B Impl (GREEN): T2.3–T2.6
- [ ] 2C Impl tests & harden: T2.7–T2.8 ✅ commit

**Phase 3 — DrawContext + theming**
- [ ] 3A Spec (RED): T3.1–T3.2
- [ ] 3B Impl (GREEN): T3.3–T3.5
- [ ] 3C Impl tests & harden: T3.6–T3.7 ✅ commit

**Phase 4 — Reflow pass**
- [ ] 4A Spec (RED): T4.1–T4.2
- [ ] 4B Impl (GREEN): T4.3–T4.4
- [ ] 4C Impl tests & harden: T4.5–T4.6 ✅ commit

**Phase 5 — Render root + compose walker**
- [ ] 5A Spec (RED): T5.1–T5.2
- [ ] 5B Impl (GREEN): T5.3–T5.5
- [ ] 5C Impl tests & harden: T5.6–T5.7 ✅ commit

**Phase 6 — Coalescing scheduler + partial recompose**
- [ ] 6A Spec (RED): T6.1–T6.2
- [ ] 6B Impl (GREEN): T6.3–T6.4
- [ ] 6C Impl tests & harden: T6.5–T6.6 ✅ commit

**Phase 7 — Dynamic children + packaging + demo + gate**
- [ ] 7A Spec (RED): T7.1–T7.2
- [ ] 7B Impl (GREEN): T7.3–T7.6
- [ ] 7C Final gate: T7.7–T7.8 ✅ commit + push

## Estimates

| Phase | Sessions | Est. |
|-------|----------|------|
| 1 — Enabling primitives | 3 | 2–3 h |
| 2 — Geometry + tree + lifecycle | 3 | 5–7 h |
| 3 — DrawContext + theming | 3 | 4–6 h |
| 4 — Reflow pass | 3 | 3–4 h |
| 5 — Render root + compose | 3 | 6–8 h |
| 6 — Scheduler + partial recompose | 3 | 5–7 h |
| 7 — Dynamic children + packaging + demo | 3 | 4–6 h |
| **Total** | **21** | **29–41 h** |

## Done = all of

20 spec tests (ST-01…ST-20) green + ST-21/ST-22 (primitives) · impl tests green · demo e2e green
· `yarn verify` green · `check:deps` passes · `yarn lint` clean · `View`/`Group`/`DrawContext`/
`RenderRoot`/`createRenderRoot`/`Point`/`ViewState`/`ThemeRoleName` (+ `runWithOwner`/`getOwner`/
`Owner`) importable from `@jsvision/ui` and `ScreenBuffer.clone()` from `@jsvision/core` · every
`view/` file ≤ 500 lines with JSDoc · `demo:view` runs · roadmap synced.
