# Ambiguity Register — View/Group Spine (RD-03)

> **Plan**: `plans/view-group-spine/`
> **Status**: ✅ GATE PASSED — all items resolved, user-confirmed 2026-06-29
> **CodeOps Skills Version**: 2.0.0

This plan implements **RD-03** (`requirements/RD-03-view-group-spine.md`), whose
*behavioral* decisions are locked upstream as **AR-30…AR-46** in
`requirements/00-ambiguity-register.md` (AR-43…AR-46 were added by the RD-03
preflight, `requirements/00-preflight-report.md`) and are inherited verbatim — not
re-litigated here. This register captures only the **plan-level** decisions the RD left
open (the two additive-primitive API shapes, bind timing, file/test layout, the
role→Style adapter, the reflow box↔view mapping, the partial-recompose + double-buffer
strategy, the demo), numbered `PA-NN`, plus a traceability map of the inherited decisions.

## Plan-level decisions (PA-NN)

| PA # | Category | Question | Options Considered | Decision | Status |
|------|----------|----------|--------------------|----------|--------|
| PA-1 | RD-01 API (additive) | What is the shape of the `runWithOwner` primitive AR-43 requires? | (a) **Solid-parity**: add `runWithOwner(owner, fn)` in `reactive/owner.ts` (temporarily `setOwner`, try/finally), re-export the existing `getOwner()` (`scheduler.ts:41`) and the `Owner` type (`types.ts:134`, as **opaque**) through `reactive/index.ts` — purely additive, does **not** touch `createRoot`'s already-tested contract; (b) extend `createRoot` to `createRoot(fn, parent?)` passing the new scope's owner into `fn` (rejected: mutates the established `createRoot` contract that RD-01 ownership spec tests already exercise — regression risk on a *done* subsystem) | **(a) `runWithOwner` + `getOwner` + opaque `Owner`** | ✅ Resolved (user) |
| PA-2 | View lifecycle / DX | A View's owner scope is created at add-time (AR-43); what happens to `bind()` before the view is mounted? | (a) **bind in `onMount`**: a View has no scope until added/mounted; reactive setup (`bind`/effects) happens in `onMount` (fires after wiring + first reflow); constructor sets static props only; calling `bind()` on an unmounted view throws a `TuiError` (fail-fast — a silently-dropped bind would mean the UI never updates); (b) buffer pre-mount `bind()` calls and replay them under the scope at mount (rejected: hidden per-view buffer + replay machinery for marginal constructor-DX gain) | **(a) bind in `onMount`; pre-mount bind throws `TuiError`** | ✅ Resolved (user) |
| PA-3 | Scope / Demo | Ship a runnable `demo:view` example, or only the AC-19 standalone-render test? | (a) **include `demo:view`**: add `packages/examples/view-demo/` + a `demo:view` script (`tsx`) + a probe-style e2e, mirroring RD-01's `demo:reactive` and RD-02's `demo:layout` (consistent with the Phase-0 "demo target" framing); (b) defer the runnable demo to the RD-05 app shell (rejected: breaks the per-RD demo precedent; the spine is the first independently-renderable layer and benefits from a visible walkthrough) | **(a) include `demo:view`** | ✅ Resolved (user) |
| PA-4 | Architecture / Files | Source + test file layout for RD-03 under `packages/ui/src/view/` | (a) **granular split** mirroring `reactive/`/`layout/`: `geometry.ts`, `types.ts`, `view.ts`, `group.ts`, `draw-context.ts`, `reflow.ts`, `render-root.ts`, `theme-style.ts`, barrel `index.ts`; tests split by concern (~200–500 lines/file); (b) one `view.ts` (rejected: an XL subsystem would blow past 500 lines) | **(a) granular split** (see 02-current-state.md §Target layout) | ✅ Resolved (dominant) |
| PA-5 | Tests / Location | Where do the two additive-primitive spec tests live? | `runWithOwner` extends `reactive.ownership.{spec,impl}.test.ts` (it is an RD-01 ownership primitive); `ScreenBuffer.clone()` gets a core `render-buffer-clone.spec.test.ts` under `packages/core/test/` (only viable per the per-subsystem test convention) | **As stated** — primitive tests live with their owning subsystem | ✅ Resolved (dominant) |
| PA-6 | Theming | Exact `ThemeRole → Style` mapping for `ctx.color(role)` (AR-45) | core `Style = {fg, bg, attrs?}` (`render/types.ts:54`), `ThemeRole = {fg, bg, hotkey?}` (+ `border`/`title`/`pattern` on some roles); the adapter maps `{ fg: role.fg, bg: role.bg }`, leaves `attrs` unset (`Attr.none`), and **ignores** role-only extras (`hotkey`/`border`/`title`/`pattern`) — those are RD-05 chrome concerns | **`{fg, bg}` map; extras ignored; `attrs` default** | ✅ Resolved (dominant) |
| PA-7 | Reflow | How does the reflow pass map RD-02 `layout()` output back to views? | build a **fresh** `LayoutBox` tree each pass from the live (visible) view tree, keeping a per-pass `Map<LayoutBox, View>`; call `layout(rootBox, viewport)` → `Map<LayoutBox, Rect>`; write each rect to its mapped `view.bounds`. `visible:false` views (and their subtrees) are omitted from the box tree (AR-41), satisfying RD-02's "fresh tree, distinct instances" precondition by construction | **Fresh box tree + per-pass box→view map; hidden views omitted** | ✅ Resolved (dominant) |
| PA-8 | Render / Composition | How are repaint-only frames recomposed, and how is the `serialize()` previous-frame obtained? | **partial recompose**: a coalescing flush recomposes only the dirty views' subtrees (AC-7) using each view's **cached absolute origin + clip** from the last full compose (caches invalidated by reflow, which forces a full compose); the previous frame is a `ScreenBuffer.clone()` snapshot taken before the dirty draws, fed to `serialize(current, previous, {caps})` (AR-44). A repainting view must fully cover its rect (a `Group` fills its `background`); otherwise stale cells persist until the next reflow — a documented v1 behavior | **Partial recompose + cached per-view context + `clone()` snapshot** | ✅ Resolved (user, via clone decision) |

> **Additive primitives this plan introduces** (both user-approved; each is a Phase-1
> task with its own spec test, committed under its owning subsystem's scope):
> - **`runWithOwner(owner, fn)` + `getOwner()` + opaque `Owner`** on RD-01 (`reactive`), PA-1 / AR-43.
> - **`ScreenBuffer.clone()`** on core RD-04 (`render`), PA-8 / AR-44 — deep-copies the
>   internal cell array (exact, incl. wide-lead/continuation cells) for the damage-diff snapshot.
>
> A third small refinement: `RenderRootOptions.logger?: Logger` (default a disabled
> `createLogger()`) makes draw-error isolation (AR-42) injectable so AC-14 can assert a
> log was emitted (`render/serialize.ts`-style testability; traced to AR-42).

## Inherited requirements decisions (RD-03 AR-NN) — traceability

Already resolved in `requirements/00-ambiguity-register.md`; listed so plan docs can
back-reference them. Not re-opened.

| AR # | Decision (summary) |
|------|--------------------|
| AR-30 | RD-03 ships the **complete** `View`/`Group` shape (overridable `onEvent` stub + `visible`/`disabled`/`focused` state); dispatch/focus **logic** → RD-04 |
| AR-31 | Each `View` owns an RD-01 scope + a `bind(reader, apply?)` helper (effect under the scope, runs `apply` + invalidate) — closes AR-09 |
| AR-32 | RD-03 owns a **coalescing, injectable** scheduler; `invalidate()` → dirty set → one flush/tick (default `queueMicrotask`) — closes AR-02 |
| AR-33 | RD-03 owns the **reflow pass** (view tree → `LayoutBox` → `layout()` → parent-relative `bounds`); relayout/repaint are distinct dirty-phases |
| AR-34 | **bounds-clip + back-to-front** paint; occlusion/cover-detection deferred (damage-diff neutralizes overdraw) |
| AR-35 | **one app-level theme**; `ctx.color(role)` resolves a named role → `Style`; per-subtree override deferred behind a seam |
| AR-36 | dynamic children reuse RD-01 `Show`/`For` (`N=View`); nested scopes ⇒ leak-free unmount; `onMount`/`onCleanup` hooks |
| AR-37 | reuse RD-02's public `Rect`/`Size2D` (+ `Padding`); add `Point` + pure helpers (`intersect`/`translate`/`contains`) |
| AR-38 | composite into the **single shared** core `ScreenBuffer` with clip+offset (view-local coords), back-to-front |
| AR-39 | **stateless**, auto-clipped, view-local `DrawContext` facade; out-of-clip writes dropped |
| AR-40 | `View` **abstract**, `Group` the one **concrete** container (fills an optional bg role); **no leaf widgets** |
| AR-41 | `visible:false` ⇒ **`display:none`** — skipped in draw AND omitted from the `LayoutBox` tree |
| AR-42 | `draw()` throw ⇒ **isolate + log** via the screen-safe logger, skip the subtree, finish the frame |
| AR-43 | (preflight PF-001) additive RD-01 **`runWithOwner(owner, fn)`**; child scopes created under the parent at add-time |
| AR-44 | (preflight PF-002) `RenderRoot` carries a required **`caps: CapabilityProfile`** + retains the **previous `ScreenBuffer`** for `serialize()` |
| AR-45 | (preflight PF-003) **`ThemeRoleName = keyof Theme`** (RD-03-owned) + a `ThemeRole → Style` adapter |
| AR-46 | (preflight PF-005) `bind` repaints by default; layout-affecting binds **opt in** to a reflow |

> **Gate enforcement:** every design/scope/algorithm decision in the plan documents
> back-references a `PA-NN` (plan) or `AR-NN` (requirements) entry above. Zero items
> deferred; the user confirmed PA-1/PA-2/PA-3 and the `clone()` decision (PA-8) on
> 2026-06-29; PA-4…PA-7 are single-dominant-option decisions recorded for traceability.
