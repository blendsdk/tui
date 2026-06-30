# Ambiguity Register — Event Loop + Focus + Modality + Commands (RD-04)

> **Plan**: `plans/event-loop/`
> **Status**: ✅ GATE PASSED — all items resolved, user-confirmed 2026-06-30
> **CodeOps Skills Version**: 3.0.0

This plan implements **RD-04** (`requirements/RD-04-event-loop.md`), whose *behavioral*
decisions are locked upstream as **AR-47…AR-66** in
`requirements/00-ambiguity-register.md` (AR-60…AR-66 were added by the RD-04 preflight,
`requirements/00-preflight-report-RD-04.md`) and are inherited verbatim — **not**
re-litigated here. This register captures only the **plan-level** decisions the RD left
open ("finalized in planning") plus the file/module layout, numbered `PA-NN`, with a
traceability map of the inherited decisions below.

## Plan-level decisions (PA-NN)

| PA # | Category | Question | Options Considered | Decision | Status |
|------|----------|----------|--------------------|----------|--------|
| PA-1 | Behavioral / dispatch | A key chord bound in the keymap (`'ctrl+q'`→`'quit'`) — is the raw key **consumed** or **also** dispatched? | (a) **instead-of (consume)**: a bound chord converts to a `CommandEvent` dispatched through the 3-phase machine; the raw `KeyEvent` is **not** also delivered; a disabled bound command drops the key; (b) in-addition: command fires *and* the raw key dispatches (rejected by user: double-handling risk) | **(a) consume** — bound chord ⇒ command only; unbound key ⇒ plain key dispatch | ✅ Resolved (user) |
| PA-2 | Naming / API (additive View) | How does a view opt into the pre/post-process sweeps? RD-04 referenced "groups flagged pre-process/post-process" without defining the flag. | (a) **two additive boolean View options** `preProcess?`/`postProcess?` (TV `ofPreProcess`/`ofPostProcess`), both default `false`, independent; (b) single `dispatchPhase?: 'pre'\|'post'` enum (rejected by user: can't express a view in both sweeps as TV allows) | **(a) two booleans `preProcess`/`postProcess`** (default false) | ✅ Resolved (user) |
| PA-3 | Behavioral / commands | `emitCommand('foo')` for a command never listed in `opts.commands` nor `enableCommand`'d — dispatched or dropped? | (a) **enabled by default (lenient)**: unknown commands dispatch unless explicitly disabled; `opts.commands` is an upfront hint; `enableCommand(name,false)` is the off switch (matches "enabled on first use", TV-parity); (b) strict registry: only registered commands dispatch, else no-op + dev-warn (rejected by user: registration friction) | **(a) enabled by default; explicit disable is the only block** | ✅ Resolved (user) |
| PA-4 | Behavioral / modality | Does RD-04 ship built-in Esc/`'cancel'`/`'ok'`→`endModal` wiring, or is `endModal` called only explicitly? | (a) **explicit only**: `endModal(result)` is called by app/modal handlers; no built-in default-command/Esc mapping — default-button + Esc-cancel ergonomics → RD-05's app shell; the `demo:events` modal calls `endModal` from its own test-view handler; (b) built-in defaults (rejected by user: bakes app-shell policy into the mechanism layer) | **(a) explicit only; default drivers → RD-05** | ✅ Resolved (user) |
| PA-5 | Behavioral / focus | `focusView(view)` when `view` is non-focusable (hidden/disabled/`!focusable`) — no-op or redirect? | (a) **no-op**: a focus request to a non-focusable view changes nothing (predictable, no surprise focus jumps); (b) redirect to the nearest focusable descendant/ancestor (rejected: surprising implicit movement; "focus exactly this or nothing" is clearer; a caller wanting nearest-focusable can use `focusNext`) | **(a) no-op** | ✅ Resolved (dominant) |
| PA-6 | Behavioral / modality | A click outside the active modal subtree — ignored or "bell"? | (a) **ignored** (dropped no-op): RD-04 emits **nothing** to the terminal directly (Security §; all output flows through RD-03→core), so a BEL has no output seam in this layer; an audible/visual bell is an RD-05 concern; (b) bell (rejected: no output path in RD-04; would need a seam RD-05 owns) | **(a) ignored — bell deferred to RD-05** | ✅ Resolved (dominant) |
| PA-7 | Architecture / files | Source + test layout for RD-04. | (a) **new granular module `packages/ui/src/event/`** mirroring `reactive/`/`view/`: `types.ts` (envelope + EventLoop types), `dispatch.ts` (3-phase), `commands.ts` (registry + keymap glue), `focus.ts` (current-chain + traversal), `hit-test.ts` (mouse), `modal.ts` (stack/execView/endModal), `event-loop.ts` (`createEventLoop` — builds the RenderRoot, owns the schedule seam, `dispatch`/`resize`/`onIdle`), barrel `index.ts`; tests split by concern; re-exported through `@jsvision/ui`. `event/` (singular) matches `view/`/`layout/`. (b) one `event-loop.ts` (rejected: an L subsystem would blow past 500 lines) | **(a) granular `src/event/` split** (see 02-current-state §Target layout) | ✅ Resolved (dominant) |
| PA-8 | Architecture / additive surface | Where do the additive `View`/`Group` fields + the event-handler contract types live (to avoid a `view/`↔`event/` import cycle)? | (a) **additive edits to the RD-03 done files** (`view/view.ts`: `focusable`/`preProcess`/`postProcess` defaults + retype `onEvent(ev: DispatchEvent)`; `view/group.ts`: internal `current: View\|null`) **and** declare the handler-contract types (`CommandEvent`/`AppEvent`/`DispatchEvent`) in **`view/types.ts`** so `View.onEvent` references them with **no** `view/`→`event/` cycle; `event/` imports them and owns the loop machinery; both re-export through `@jsvision/ui`; (b) declare the envelope in `event/` and type `onEvent(ev: unknown)` with a cast in widgets (rejected: an `as DispatchEvent` unsafe cast violates the type-safety standard) | **(a) additive RD-03 edits; contract types in `view/types.ts`** | ✅ Resolved (dominant) |
| PA-9 | Scope / demo | Ship a runnable `demo:events`, mirroring `demo:view`? | (a) **include `demo:events`**: `packages/examples/event-demo/` + a `demo:events` script (`tsx`) + a probe-style e2e — synthetic `dispatch()` sequence showing Tab focus, Enter→`'ok'` command, and a modal `execView` resolving, printing ASCII frames (AR-59); mirrors `demo:view`; (b) defer to RD-05 (rejected: AR-59 already chose the headless demo as the RD-04 acceptance vehicle) | **(a) include `demo:events`** | ✅ Resolved (AR-59) |
| PA-10 | Behavioral / focus (preflight PF-003) | Does a real `tab`/`shift+tab` **KeyEvent** dispatched through `dispatch()` move focus inside RD-04, or is the key→`focusNext` binding deferred to RD-05/the app? | (a) **built-in in RD-04**: the dispatch pipeline maps an unbound `tab`→`focusNext` and `shift+tab`→`focusPrev` (consumed; not also delivered to the 3-phase key path), so a real keystroke moves focus — matching AR-57 "Tab advances current"; a `tab` chord explicitly bound in the user keymap wins (consume, PA-1) so apps can still repurpose it; (b) programmatic-only, defer the key binding to RD-05 (rejected by user: AR-57's "Tab advances" reads as live behavior; deferring leaves the headless demo unable to show Tab via a dispatched key) | **(a) built-in `tab`/`shift+tab`→focus traversal** (consumed; keymap binding overrides) | ✅ Resolved (user); shift+tab end-to-end unblocked — core decodes backtab (RT-1, PF-010) |
| PA-11 | Architecture / loop (preflight PF-001, PF-009) | Which public methods drive the one-coalesced-frame tick? RD-04 originally specified only `dispatch`/`resize` as flushing. | (a) **single internal `runTick(work)`**: every public mutator (`dispatch`, `emitCommand`, `focusNext`/`focusPrev`/`focusView`, `endModal`, `execView`, `resize`) routes through one tick — *do work (enqueue an event or mutate focus/modal) → drain the cascade queue → `onIdle?.()` → exactly one `renderRoot.flush()`* — with re-entrant calls joining the active tick (the "if already draining: return" guard); (b) flush only in `dispatch`/`resize` (rejected: a standalone `loop.focusNext()`/`emitCommand()` — both shown in the usage example and called directly by ST-04/ST-09 — would never paint, and `emitCommand` would enqueue with nothing to drain) | **(a) one `runTick` shared by every public mutator** | ✅ Resolved (PF-001; `execView` added PF-009) |
| PA-12 | Behavioral / modality (preflight PF-002) | While a modal is active, does the Phase-2 focused-chain bubble stay inside the top modal subtree? | (a) **clamp Phase 2 to the scope root**: the focused-leaf→ancestor bubble stops at the top modal subtree root (the dispatch `scope`), never the tree root, so the outer tree is truly inert (ST-13); (b) bubble to the tree root (rejected: `parent` pointers cross the modal boundary, so an outer desktop/root group would receive captured input — violates AR-53 capture and ST-13) | **(a) Phase-2 bubble clamped to the modal scope root** | ✅ Resolved (PF-002) |

> **No cross-package primitive this time.** Unlike RD-03 (which added `runWithOwner` +
> `ScreenBuffer.clone()`), RD-04 builds **entirely** on the existing public surface of
> `@jsvision/core` (input `InputEvent`/`KeyEvent`/…, `createKeymap`/`Keymap`, `TuiError`,
> `Logger`/`createLogger`, `CapabilityProfile`, `Theme`) and RD-03 (`RenderRoot.mount`/
> `resize`/`flush`/`serialize`/`buffer`, the construct-time `schedule` seam, `View`/`Group`).
> The loop suppresses the render root's self-flush by constructing it with a **deferring
> `schedule`** and driving `renderRoot.flush()` itself once per dispatch tick (AR-61).

## Inherited requirements decisions (RD-04 AR-NN) — traceability

Already resolved in `requirements/00-ambiguity-register.md`; listed so plan docs can
back-reference them. Not re-opened.

| AR # | Decision (summary) |
|------|--------------------|
| AR-47 | RD-04 ships the **dispatch mechanism** (`EventLoop`); concrete `Application`/`run()`/shell → RD-05 |
| AR-48 | Focus = **per-group `current` chain**; global focus is the root→leaf path of `current` pointers |
| AR-49 | **pure `dispatch(event)`** entry, injectable source; real `createHost` wiring → RD-05 |
| AR-50 | **top-most-first** mouse hit-test in RD-04 + focus-on-click |
| AR-51 | faithful **3-phase** pre/focus/post dispatch + `handled` short-circuit |
| AR-52 | typed **command layer** — `CommandEvent` + registry + enable/disable + key→command keymap |
| AR-53 | **modal stack** + `endModal(result)` → resolves the `execView` `Promise` |
| AR-54 | the **loop drives `RenderRoot` frames** (one frame per dispatch tick) |
| AR-55 | central **`EventLoop`** (`createEventLoop`); `run()`/host wiring → RD-05 |
| AR-56 | additive **`focusable`** option; predicate `visible && !disabled && focusable` |
| AR-57 | **Tab/Shift-Tab** traversal over the current-chain (wrap); click-to-focus |
| AR-58 | **`onIdle`** hook only; broadcast + timer-queue → RD-05 |
| AR-59 | headless **`demo:events`** acceptance vehicle; interactive TTY → RD-05 |
| AR-60 | (preflight PF-401) **`DispatchEvent` envelope** carries the mutable `handled` (+ view-local mouse coords); core `InputEvent` stays readonly |
| AR-61 | (preflight PF-402) the loop **builds** the `RenderRoot` (`createEventLoop(viewport, opts)`) and controls its construct-time `schedule` seam |
| AR-62 | (preflight PF-403) **reuse core `createKeymap`/`Keymap`** (the `'ctrl+q'` grammar); no bespoke chord parser |
| AR-63 | (preflight PF-404) **normalize 1-based→0-based** mouse coords at the dispatch boundary |
| AR-64 | (preflight PF-405) a **dispatch tick** = one `dispatch(event)` + its synchronous command cascade; one coalesced flush per tick |
| AR-65 | (preflight PF-406) `focusable` **defaults `false`**; eligibility honours `!visible`/`disabled` **ancestors** (subtree semantics) |
| AR-66 | (preflight PF-407) injectable **`EventLoopOptions.logger`** for `onEvent`/`draw()` error logging |

> **Gate enforcement:** every design/scope/algorithm decision in the plan documents
> back-references a `PA-NN` (plan) or `AR-NN` (requirements) entry above. Zero items
> deferred; the user confirmed PA-1…PA-4 on 2026-06-30; PA-5…PA-9 are single-dominant-option
> decisions recorded for traceability (PA-9 inherits AR-59). **PA-10…PA-12 were added by the plan
> preflight (`00-preflight-report.md`, PF-001/PF-002/PF-003, 2026-06-30):** PA-10 user-confirmed;
> PA-11/PA-12 are single-viable-fix corrections to under-specified seams.

> **Iteration-3 preflight corrections (PF-008/PF-009/PF-010, 2026-06-30, user-applied):**
> **PF-009** — `execView` joins the `runTick` set (PA-11 above) so opening a modal self-drives one
> coalesced frame rather than leaning on `serialize()`'s force-flush. **PF-008** — the `onEvent`
> retype (PA-8) narrows the base parameter to `DispatchEvent`, which makes the *direct call* in the
> RD-03 spec oracle `view.tree.spec.test.ts:94` (`v.onEvent({ type:'key', value:'x' })`) a TS2345
> error; the user approved a **type-adaptation** of that call argument to a valid `DispatchEvent`
> (`{ event: { type:'key', … }, handled:false }`) — the ST-15 assertion ("the stub changes no
> state") is preserved, so this is an API-change adaptation, not a spec weakening. The edit is now
> listed in 99 T1.3. **PF-010 (cross-layer dependency)** — the built-in `shift+tab`→`focusPrev`
> arm (PA-10) is correct as a pure mechanism, but the core RD-06 decoder currently **drops** real
> backtab (`ESC [ Z`, CSI final `Z`/`0x5A` is absent from `keys.ts` `FINAL_KEYS`), so
> `{ key:'tab', shift:true }` was **not producible from real terminal input** — plain Tab worked
> end-to-end, Shift-Tab did not. Decision: **keep the built-in arm** and **fix the core decoder**.
> ✅ **Done** — core now decodes `CSI Z` → `{ key:'tab', shift:true }` (commit `d3d409d`), so
> Shift-Tab works end-to-end once RD-04 lands. Tracked + closed as **RT-1** below.

## Runtime decisions (exec_plan) — RT-NN

Wiring details specified at the *shape* level but left to implementation; to be resolved
during `exec_plan` with sound engineering and recorded here (tag `(runtime)`), per the
zero-ambiguity-during-execution rule. None may change a behavioral AR/PA decision.

| RT # | Phase | Question | Decision | Why |
|------|-------|----------|----------|-----|
| RT-1 | Cross-layer (RD-06) | Real Shift-Tab/backtab (`ESC [ Z`) was dropped by the core decoder, so the PA-10 `shift+tab`→`focusPrev` arm couldn't fire from a live terminal. | ✅ **RESOLVED** — core now decodes `CSI Z` → `{ key:'tab', shift:true }` (`packages/core/src/engine/input/keys.ts` `classifyCsi`, commit `d3d409d`, `input-keyboard.impl` backtab test). RD-04 keeps the built-in arm unchanged; **shift+tab now works end-to-end** once RD-04 lands. (ST-04 still feeds a *synthetic* `{key:'tab',shift:true}` at the RD-04 layer — like every RD-04 unit test — but the event is now producible from real bytes.) | Backtab is a near-universal terminal sequence; the gap was in core, not in RD-04's mechanism (PF-010). |
