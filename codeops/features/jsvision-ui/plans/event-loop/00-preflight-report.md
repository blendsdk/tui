# Preflight Report — Event Loop + Focus + Modality + Commands (RD-04 plan)

> **Artifact**: `plans/event-loop/` (implementation plan for jsvision-ui/RD-04)
> **Date**: 2026-06-30
> **Reviewer**: preflight (CodeOps 3.0.0) — codebase-grounded audit
> **Scope**: all 9 plan docs (00-index, 00-ambiguity-register, 01-requirements,
> 02-current-state, 03-01…03-04, 07-testing-strategy, 99-execution-plan)
> **Session independence**: this preflight runs in a fresh session, separate from the plan's
> authoring session (mild same-model bias remains; mechanism claims were re-derived from source,
> not from the plan's prose).

---

## Codebase Context Summary

The plan is **additive** on three done-and-verified subsystems (`packages/ui/src/{reactive,layout,view}/`)
plus published `@jsvision/core`. Every `file:line` claim in the plan was verified against source:

| Plan claim | Source | Verdict |
|---|---|---|
| `View.onEvent(_ev: unknown)` stub at `view.ts:71` | `packages/ui/src/view/view.ts:71` | ✅ exact |
| `View.state` `:38`, `bounds` `:36`, `invalidate` `:76`, `invalidateLayout` `:81`, `parent` `:48` | `view/view.ts` | ✅ exact |
| `Group.children` ordered z-order array `:23` | `view/group.ts:23` | ✅ exact |
| Scheduler construct-time `private readonly` `:124,139`; coalesce `scheduled` flag `:173-177`; compose walker `:81-93` | `view/render-root.ts` | ✅ exact |
| `RenderRootOptions = {caps, theme?, schedule?, logger?}` | `view/types.ts:51-60` | ✅ exact |
| Core mouse coords 1-based `events.ts:28`; `InputEvent` union `:58` | `core/.../input/events.ts` | ✅ exact |
| `createKeymap`/`Keymap` exported | `core/.../engine/index.ts:37,49`; `keymap.ts:22,40` | ✅ exact |
| `intersect`/`contains`/`translate`/`Point` reusable | `view/geometry.ts` | ✅ exact |
| examples has `@jsvision/ui` dep, `demo:view` + `view-demo.e2e` mirror | `packages/examples/{package.json,test}` | ✅ exact |
| no `packages/ui/src/event/` yet | filesystem | ✅ greenfield |

**Frame-ownership mechanism (highest design risk) re-derived and found sound:** a deferring
`schedule` (no-op w.r.t. running the flush) leaves `scheduled = true` without flushing; the loop's
explicit `renderRoot.flush()` composes and resets `scheduled = false` (`render-root.ts:173-180`).
One coalesced flush per tick holds. `mount()`'s internal `flush()` (`:151`) and `serialize()`'s
force-flush (`:213`) are the only other flush sites — relevant to the flush-counter tests (PF-006).

---

## Findings

### 🟠 PF-001 (MAJOR) — Frame production for non-dispatch public mutators is unspecified

`dispatch()` (03-01) and `resize()` (03-01) are the only public methods the plan specifies as
draining the cascade + driving the single `renderRoot.flush()`. But `focusNext`/`focusPrev`/
`focusView`, `emitCommand`, and `endModal` also mutate focus/command/modal state and call
`view.invalidate()` — and the plan never says they flush. With the deferring scheduler, a standalone
`loop.focusNext()` (exactly what 00-index.md:64 and the usage example show) sets `scheduled = true`
but **never flushes**, so no frame is produced until the next `dispatch`/`serialize`/`resize`.

Worse, 03-02 describes `emitCommand → registry.emit` as **enqueue-only** ("enqueue onto the current
dispatch tick", 03-02:62) while the drain loop lives solely in `dispatch()` (03-01). A standalone
`emitCommand('ok')` — which **ST-09 calls directly** — would enqueue with nothing to drain it, so
the handler never fires. ST-06 (focus flip → one frame) and ST-12 (`execView`/`endModal`) have the
same dependency on a flush that the plan doesn't attribute to these methods.

**Recommend (single viable fix):** specify one internal `runTick(work)` that every public mutator
routes through — *do work (enqueue an event or mutate focus/modal) → drain the cascade queue →
`onIdle?.()` → one `renderRoot.flush()`*, with re-entrant calls joining the active tick (the
"if already draining: return" guard already drafted in 03-01). This mirrors `resize()`'s explicit
flush and makes ST-06/ST-09/ST-12 deterministic without leaning on `serialize()`'s side-effect.
*Dropped:* "these are only ever called inside a dispatch handler" — contradicted by the plan's own
standalone `loop.focusNext()`/`emitCommand()` usage and by ST-04/ST-09 calling them directly.

### 🟠 PF-002 (MAJOR) — Modal input capture vs. Phase-2 focus-chain bubble boundary

03-04 claims that while a modal is active **"all key/mouse/command phases run only within the top
modal subtree; the outer tree is inert"** (and ST-13 asserts the outer tree receives nothing). The
pre/post sweeps honor this via `preOrder(scope = top modal subtree)`, and hit-testing via
`scopeRoot`. But **Phase 2** is specified as *"the focused leaf, then its ancestors up the
current-chain (leaf→root)"* (03-02:32) with no scope clamp. With a modal active, the focused leaf
sits inside the modal subtree, and its `parent`/current-chain ancestors continue **past the modal
root up to the desktop/root**, so an outer ancestor group can receive the event — violating capture
and failing ST-13.

**Recommend (single viable fix):** specify that Phase 2's ancestor bubble **stops at the scope root**
(the top modal subtree root) whenever a modal is active — i.e. the leaf→root walk is clamped to
`scope`, not the tree root. Add this to 03-02's Phase-2 description and note it in ST-13's oracle.
*Dropped:* relying on the focus chain "naturally" staying inside the modal — it doesn't; `parent`
pointers cross the modal boundary.

### 🟡 PF-003 (MINOR) — Tab/Shift-Tab key → `focusNext`/`focusPrev` binding is unspecified

RD-04 AC-4 frames traversal as *"Tab advances focus to the next focusable sibling."* The plan
realizes this purely as the **programmatic** `focusNext`/`focusPrev` methods, and ST-04 exercises
those methods directly — but nothing in the dispatch pipeline (03-02 `route`) maps a `tab` /
`shift+tab` **KeyEvent** to them. The usage example shows both `loop.focusNext()` and a separate
`dispatch({key:'tab'})` (00-index.md:64-65), leaving it ambiguous whether a real Tab keystroke moves
focus in RD-04 or is wired by the app/RD-05.

**Recommend:** make the scope decision explicit in 00-ambiguity-register as a new PA entry — either
(a) the loop binds `tab`→`focusNext` / `shift+tab`→`focusPrev` as a built-in (add a matching
AC/ST), or (b) RD-04 ships only the programmatic methods and the literal Tab-key binding is an
RD-05/app-handler concern (state it in "Won't Have"). Given AR-57's "Tab advances current," (a) is
the lower-surprise choice, but either is defensible — the plan just must pin one.

### 🟡 PF-004 (MINOR) — ST-02 testability before the Phase-3 focus manager exists

ST-02 (Phase 2 spec) asserts the 3-phase order including the **focused** phase + focus-chain bubble.
But the focus manager that *sets* `Group.current` / `state.focused` (`focusLeaf`/`focusView`) is
Phase 3. The plan doesn't say how Phase 2's spec test establishes a focused leaf to verify the
middle phase fires between pre and post.

**Recommend:** note in 07-testing-strategy (ST-02) and Phase-2 that the spec test wires the focus
chain by **directly setting `Group.current` + `leaf.state.focused`** (the data-model fields land in
Phase 1, T1.3), since the focus *manager* lands in Phase 3. This keeps ST-02 green in Phase 2
without an out-of-order dependency and without reading implementation behavior.

### 🟡 PF-005 (MINOR) — Execution-plan task-count denominator is wrong

99-execution-plan.md header reads **"Progress: 0/30 tasks (0%)"**, but the plan defines **33**
numbered tasks (T1.1–T5.7; verified: 7+7+6+6+7). The wrong denominator will misreport progress
during exec_plan.

**Recommend:** change the header to `0/33 tasks`. (The phase table's "15 sessions" is correct and
separate.)

### 🔵 PF-006 (OBSERVATION) — Flush-counter tests must account for `mount()` and `serialize()` flushes

ST-16 / ST-19 assert flush counts via "a spy wrapping the loop-built root's `flush`." Note that
`renderRoot.mount()` calls `flush()` once internally (`render-root.ts:151`, the initial paint) and
`serialize()` forces a pending flush (`:213`). A spy installed before `mount()` will see the mount
frame, and asserting via `serialize()` deltas triggers an extra flush. Worth a one-line note in
07-testing-strategy so the exec implementer offsets/resets the spy after mount and reads counts, not
`serialize()`, for the "exactly one flush per tick" oracle.

### 🔵 PF-007 (OBSERVATION) — Mouse delivery `{...ev, local}` copies `handled`

03-03 delivers a hit via `deliver(hit, {...ev, local})` — a **new** envelope. A handler setting
`handled` mutates the copy, not the original `ev`. This is moot today (mouse/wheel skip the 3-phase
bubble, so nothing re-reads `handled` afterward), but if future wheel/mouse bubbling is added the
spread would silently drop the consumed flag. Harmless now; note it near the hit-test so it isn't
a latent surprise.

---

## Outcome

### Iteration 1 — ❌ BLOCKED (2 MAJOR + 3 MINOR + 2 OBSERVATION)

### Iteration 2 — ✅ PASSED (all findings resolved, 2026-06-30)

User decisions: **PF-003 → built-in Tab in RD-04**; **apply all fixes now**. Resolutions:

| Finding | Resolution | New decision / edits |
|---|---|---|
| 🟠 PF-001 | **Fixed** — single internal `runTick(work)` shared by every public mutator (drain → `onIdle` → one flush; re-entrant joins active tick) | **PA-11** added; 03-01 (runTick model + error table), 01-req, 99-plan T1.4/T2.4/T3.4/T5.3, 03-03 tick-ownership note |
| 🟠 PF-002 | **Fixed** — Phase-2 focused-chain bubble clamped to the modal `scopeRoot` | **PA-12** added; 03-02 `route` + error table + integration bullet, 03-04 capture note, 07 impl test, 99 T5.3 |
| 🟡 PF-003 | **Fixed** — built-in `tab`/`shift+tab`→`focusNext`/`focusPrev` (consumed; keymap-bound `tab` overrides) | **PA-10** (user-confirmed); 03-02 `route` branch, ST-04 extended, 01-req, 99 T3.1/T3.4, 00-index |
| 🟡 PF-004 | **Fixed** — ST-02 note: Phase-2 spec wires the focus chain by setting `Group.current`/`state.focused` directly (manager lands Phase 3) | 07 ST-02 row |
| 🟡 PF-005 | **Fixed** — task denominator `0/30` → `0/33` (verified 33 tasks) | 99 header |
| 🔵 PF-006 | **Noted** — flush-counter caveat: install the spy after `mount()`; don't read counts via `serialize()` | 07 frame-counter note |
| 🔵 PF-007 | **Noted** — `{...ev, local}` copies `handled`; harmless today (mouse skips bubbling) | 03-03 note |

**Final: ✅ PREFLIGHT PASSED** — all 7 findings resolved (5 fixed, 2 noted), 0 unresolved 🔴/🟠.
The plan is codebase-grounded, internally consistent, and ready for `exec_plan`. Roadmap RD-04 plan
row advances to 🔬 **Plan Preflighted**.

---

## Preflight Report — Iteration 3 (re-scan, fresh session, 2026-06-30)

> **Status**: ✅ PASSED — 3 MAJOR + 1 OBSERVATION, all resolved (user applied all fixes 2026-06-30)
> **Previous iterations**: PF-001…PF-007 — all resolved; **re-verified present and holding**
> (PA-11 `runTick` in 03-01; PA-12 Phase-2 clamp in 03-02; PA-10 built-in Tab in 03-02/ST-04;
> task count `0/33` correct: 7+7+6+6+7).
> **This iteration**: 4 new findings (PF-008…PF-011), numbering continued from PF-007.
> **Why a passing plan re-blocked**: this session re-derived every load-bearing claim from source
> rather than trusting Iteration 2's verification table. Three claims that Iteration 2 asserted as
> sound (the `onEvent` retype's override-compatibility, "every public mutator runTicks", and
> "a real Tab/Shift-Tab keystroke moves focus") fail against the actual code.

### Codebase re-verification (Iteration 3)

| Plan claim | Source checked | Verdict |
|---|---|---|
| `onEvent` retype is "override-compatible … RD-03 ST-15 subclass keeps compiling" (02-current-state:138, 03-01:55) | `packages/ui/test/view.tree.spec.test.ts:18,94,101,106`; `view/view.ts:71` | 🔴 **Subclass override compiles (bivariance) — but the base *direct call* at :94 does NOT** |
| "Every public mutator … routes through `runTick`" (03-01:115) lists dispatch/emitCommand/focus*/endModal/resize | `03-01:134-139`; `render-root.ts:173-177,212-218` | 🟠 **`execView` omitted; relies on `serialize()` force-flush, not its own flush** |
| "a real keystroke moves focus — matching AR-57" for `tab`/`shift+tab` (03-02:44-49) | `keys.ts:32,39-46,85,175-190`; `events.ts:137-165` | 🟠 **Plain Tab: yes. Shift-Tab (CSI `Z`/backtab): dropped by core — `{key:'tab',shift:true}` not producible** |

---

### 🟠 PF-008 (MAJOR) — `onEvent` retype breaks an existing RD-03 **spec oracle** at typecheck

**Dimension:** 13 (Codebase Alignment — Test Impact / Impact Blindness) · 3 (Contradiction with the risk table)
**Location:** 02-current-state.md:138 (risk "onEvent retype breaks an RD-03 subclass | Low | Low");
03-01:55-56 (retype `onEvent(ev: DispatchEvent)`); 99-execution-plan T1.3 (lists edits to
view.ts/group.ts/types.ts/view-index — **not** the test).
**Codebase Evidence:** `packages/ui/test/view.tree.spec.test.ts:18` (`class TestView extends View`
overrides only `draw()`, **not** `onEvent`), `:94` (`v.onEvent({ type: 'key', value: 'x' })` —
a direct call on the base stub); base `View.onEvent(_ev: unknown)` at `view/view.ts:71`;
`DispatchEvent = { event; handled; local? }` (plan 03-01:39-43).
**The Problem:** PA-8/T1.3 retypes the base `onEvent` parameter from `unknown` to `DispatchEvent`.
The plan's mitigation analyzes only **subclass override** compatibility — and that part is correct
(view.tree.spec.test.ts:101 `override onEvent(ev: unknown)` stays valid under TS method
bivariance). But it misses the **direct call site** at `:94`: `{ type: 'key', value: 'x' }` is not
assignable to `DispatchEvent` (missing `event`, `handled`) → **TS2345**, so `yarn verify`
(typecheck) fails the moment T1.3 lands — Phase 1 can never go green. Worse, `view.tree.spec.test.ts`
is a `*.spec.test.ts` **immutable oracle**; under the spec-first rule its call site can't be edited
to match new code without explicit approval, and the plan never lists it as a touched file.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Update the ST-15 call arg at :94 to a valid `DispatchEvent` (`{ event: { type:'key', … }, handled:false }`), preserving the "stub changes no state" assertion; record the spec-oracle edit + approval in T1.3 (type-adaptation forced by the AC-backed retype, not a weakening) | Smallest change; keeps PA-8; unblocks verify; assertion semantics intact | Touches a spec oracle (needs the user's explicit sign-off, which this finding requests) |
| B | Keep base `onEvent(_ev: unknown)`; narrow inside dispatch/widgets | No spec-test edit | Reopens PA-8 (rejected: forces `as DispatchEvent` casts in widgets — type-safety violation) |

**Recommendation:** Option **A** — the retype is an intentional, AC-backed API change; ST-15's
argument is type-adapted while its oracle assertion ("no state change") is preserved, so it's a
governance-visible adaptation, not a weakening. Add view.tree.spec.test.ts to T1.3's edit list and
note the approval here. (Confidence: High — TS2345 is deterministic given :18/:94 and the retype.
Hardening: verified `TestView` has no `onEvent` override and the literal lacks `event`/`handled`.)

**User Decision:** Resolved — **Option A** (user: "apply all fixes per your recommendations",
which explicitly grants the spec-oracle sign-off PF-008 requested). **Applied:** view.tree.spec.test.ts
added to 99 T1.3 with the type-adaptation recorded; risk table (02-current-state) + Compatibility
(01-requirements) + Code Analysis (02) corrected to distinguish override-bivariance from the
direct-call narrowing; PA-8 note in the register.

### 🟠 PF-009 (MAJOR) — `execView` is the one public mutator not routed through `runTick`

**Dimension:** 3 (Logical Contradiction) · 4 (Completeness) · 13 (Alignment)
**Location:** 03-01:115-118 (PA-11: "**Every** public mutator that can change focus/command/modal
state … routes through a single internal `runTick`"); 03-01:134-139 (the `runTick` map —
`execView` absent); 03-04:30-38 (`execView` pseudocode — no `runTick`/`flush`);
01-requirements.md:43-45 ("One coalesced frame per public mutator" — also omits `execView`).
**Codebase Evidence:** `render-root.ts:173-177` (deferring `scheduleFlush` sets `scheduled=true`,
never runs the flush), `:212-214` (`serialize()` force-flushes a pending frame), `:217-218`
(`buffer()` returns `current` with **no** flush).
**The Problem:** `execView` pushes the modal frame and focuses the modal's first focusable (an
internal focus mutation, not the public `focusView`), so it dirties the buffer but **does not
self-drive a flush**. It therefore relies on the next `serialize()` force-flush to paint the opened
modal — exactly the `serialize()`-side-effect dependency PF-001/PA-11 set out to eliminate, and it
makes PA-11's literal "every public mutator" claim false. Impact is bounded (a host/test reading via
`serialize()` — as the demo does, 03-04:94 — does see the modal), but a `buffer()`-reading host sees
an un-composed frame until a later tick, and the stated invariant is contradicted.

**Recommendation (single viable fix):** add `execView` to the `runTick` set — wrap its synchronous
push-modal + focus-modal mutation in `runTick` (one coalesced frame paints the opened modal), then
return the `Promise`; add `execView` to PA-11's enumeration, 01-requirements' "one frame per
mutator" list, and the 03-04 pseudocode. *Dropped:* "rely on the next `serialize()`/dispatch" —
contradicted by PA-11 and PF-001's own rationale. (Confidence: High — challenger confirmed the
omission and the `serialize()` rescue. Hardening: independent agent verified `execView`'s focus step
is internal, not the public `focusView`, so no incidental `runTick`.)

**User Decision:** Resolved — single-viable fix applied. `execView` joins the `runTick` set across
PA-11 (register), 01-requirements, 03-01 (map + error table), 03-04 (pseudocode + note), and
99 T5.3/T5.6; 07 adds the one-frame-on-open impl test (flush-spy, incl. a no-focusable-child modal).

### 🟠 PF-010 (MAJOR) — Built-in **Shift-Tab** is unreachable from real terminal input (core drops backtab)

**Dimension:** 2 (Implicit Assumption) · 13 (Stale Assumption / Dependency Reality)
**Location:** PA-10 (00-ambiguity-register); 03-02:27-28 (`ev.event.shift ? focus.prev() :
focus.next()`); 03-02:44-49 ("a real keystroke moves focus — matching AR-57"); ST-04
(03-02:117-120 / 07 ST-04 — synthetic `shift+tab`).
**Codebase Evidence:** `packages/core/src/engine/input/keys.ts:32` (`[0x09,'tab']` → `namedKey(…,
NO_MODS)`), `:85` (`NO_MODS` = all-false), `:39-46` (`FINAL_KEYS` has no `0x5A`/`'Z'`), `:175-190`
(`classifyCsi` drops any unrecognized CSI final); `events.ts:137-165` (`KEY_NAMES` has no
`backtab`). Real Shift-Tab is `ESC [ Z` (CSI final `Z`), so the core RD-06 decoder **drops** it —
no decode path produces `{key:'tab', shift:true}`.
**The Problem:** PA-10's plain-`tab` arm works end-to-end (0x09 → `{key:'tab'}`), but the
`shift+tab` arm cannot be reached from real decoded bytes, so **AC-4's "Shift-Tab" won't reverse
focus in the actual TUI**, and the plan's "a real keystroke moves focus — matching AR-57" is false
for Shift-Tab. ST-04's `shift+tab` case passes only because it constructs a synthetic event —
a green test for an unreachable real scenario (false confidence). RD-04 is a pure mechanism, so the
mechanism itself is correct; the defect is a cross-layer dependency the plan asserts as satisfied.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Record the cross-layer dependency in PA-10/03-02 (shift+tab depends on core decoding CSI `Z` → `{key:'tab',shift:true}`, which it doesn't yet); file an RD-06 follow-up to add `0x5A`→tab+shift; keep the built-in arm; label ST-04's shift+tab case mechanism-level pending that enhancement | Fixes the real gap where it belongs (backtab is standard; a tiny core addition); keeps PA-10/AC-4 intact end-to-end | Adds a core (RD-06) follow-up item; backward Tab nav not truly live until that lands |
| B | Descope: keep `focusPrev` programmatic only, move "literal Shift-Tab key" to Won't-Have (RD-05/app); drop the shift+tab arm from `route` + ST-04 | Honest to current core; no dead branch | Loses live backward Tab traversal; asymmetric with the plain-Tab arm |

**Recommendation:** Option **A** — backtab (`CSI Z`) is a near-universal terminal sequence and the
decoder's omission is the actual defect; a one-line `FINAL_KEYS`/classify addition in core makes the
shift+tab arm live and keeps PA-10/AC-4 coherent. Pin the dependency explicitly so ST-04's
shift+tab case is understood as mechanism-level until core decodes backtab. (Confidence: High —
challenger exhausted every decode path. Hardening: confirmed no Alt/Ctrl/modifier route sets
`shift:true` on tab.)

**User Decision:** Resolved — **Option A**. Built-in `shift+tab` arm kept; cross-layer dependency
recorded in PA-10 + 03-02 (caveat block) + **RT-1** (core RD-06 follow-up to decode `CSI Z` →
`{key:'tab', shift:true}`); ST-04's shift+tab labeled mechanism-level (07 + 99 T3.1) until the
follow-up lands. **Action item — ✅ DONE:** core RD-06 enhancement landed (commit `d3d409d`) —
`classifyCsi` decodes `CSI Z` → `{key:'tab', shift:true}` + `input-keyboard.impl` backtab test;
RT-1 closed. Shift-Tab is now end-to-end once RD-04 ships.

### 🔵 PF-011 (OBSERVATION) — `FocusEvent` routing is unspecified

**Dimension:** 4 (Completeness)
**Location:** 03-02:14-42 (`route` handles `KeyEvent`, `MouseEvent`/`WheelEvent`, `CommandEvent`;
03-02:16 calls out "keyboard/paste/command" — `FocusEvent` unmentioned).
**Codebase Evidence:** `core/.../input/events.ts:51-55` (`FocusEvent` terminal focus in/out),
`:58` (`InputEvent` union includes it → it's a valid `AppEvent`).
**The Problem:** A terminal `FocusEvent` reaching `dispatch()` isn't a key/mouse/wheel/command, so it
falls through to the 3-phase sweeps and is delivered to widgets — plausibly unintended (it's
app/terminal-level focus, not widget input). Harmless today (handlers ignore unknown kinds), but the
intended handling (deliver to the focused leaf / ignore / app-level hook → RD-05) isn't pinned.
**Recommendation:** one-line note in 03-02 on `PasteEvent` (already 3-phased intentionally) **and**
`FocusEvent` routing intent. Non-blocking.

**User Decision:** Resolved — note added to 03-02 (paste = intentional 3-phase; `FocusEvent` =
default 3-phase, app-level focus-in/out policy → RD-05).

---

## Iteration 3 Outcome — ✅ PREFLIGHT PASSED — all 4 findings resolved (2026-06-30)

User decision: **"apply all fixes per your recommendations"** (covers the PF-008 spec-oracle
sign-off). All four findings resolved:

| Finding | Severity | Resolution |
|---|---|---|
| PF-008 | 🟠 MAJOR | **Fixed** — spec-oracle call arg at `view.tree.spec.test.ts:94` type-adapted (assertion preserved); added to 99 T1.3; risk/compat/code-analysis text corrected (02, 01) |
| PF-009 | 🟠 MAJOR | **Fixed** — `execView` added to the `runTick` set (register PA-11, 01-req, 03-01 map+error table, 03-04 pseudocode+note, 99 T5.3/T5.6, 07 impl test) |
| PF-010 | 🟠 MAJOR | **Fixed (Option A)** — built-in arm kept; cross-layer dep recorded (PA-10, 03-02, **RT-1**). **Core RD-06 follow-up ✅ DONE** (commit `d3d409d`: `classifyCsi` decodes `CSI Z`→`{key:'tab',shift:true}` + test) — RT-1 closed, Shift-Tab end-to-end |
| PF-011 | 🔵 OBS | **Noted/Fixed** — paste/focus routing intent documented in 03-02 |

PF-001…PF-007 re-verified present and holding. **Final: ✅ PREFLIGHT PASSED** — 0 unresolved
🔴/🟠. The plan is codebase-grounded and internally consistent; ready for `exec_plan`. The one
cross-layer carry-out (RT-1: core decoding backtab `ESC [ Z` for end-to-end Shift-Tab) is **already
landed** (commit `d3d409d`). Roadmap RD-04 plan row stays at 🔬 **Plan Preflighted**.
