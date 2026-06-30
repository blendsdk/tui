# Execution Plan — Event Loop + Focus + Modality + Commands

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md) · **Implements**: jsvision-ui/RD-04 · **Plan**: `plans/event-loop/`
> **Last Updated**: 2026-06-30
> **Progress**: 0/33 tasks (0%)
> **CodeOps Skills Version**: 3.0.0

## Overview

Build the host-agnostic dispatch mechanism `EventLoop` for `@jsvision/ui`. Specification-first
ordering is **non-negotiable**: every feature phase runs three sessions — **(A) Spec Tests →
confirm RED → (B) Implementation → confirm GREEN → (C) Impl Tests & Hardening**. Spec tests derive
from RD-04 ACs (the immutable oracles ST-01…ST-20 in
[07-testing-strategy.md](07-testing-strategy.md)). Commits reference **/gitcm** (commit) or
**/gitcmp** (commit + push) — never raw git. Verify with `yarn verify`; iterate with
`yarn workspace @jsvision/ui test`. Commit scope: `view` (additive `View`/`Group` surface), `event`
(the loop), `examples` (demo).

**🚨 Update this document after EACH completed task!**

Five phases: foundation + loop/frame ownership → 3-phase dispatch + commands + keymap → focus
manager → mouse hit-test → modality + packaging + demo. Each phase produces files ≤ 500 lines
(PA-7) with full JSDoc on public symbols. **No** cross-package primitive (RD-04 builds on the
existing core + RD-03 surface).

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Foundation: types, additive View surface, loop + frame ownership | 3 | 5–7 h |
| 2 | 3-phase dispatch + commands + keymap | 3 | 5–7 h |
| 3 | Focus manager (current chain, traversal, predicate) | 3 | 5–7 h |
| 4 | Mouse hit-test + focus-on-click | 3 | 3–5 h |
| 5 | Modality + packaging + demo + final gate | 3 | 5–7 h |
| **Total** | | **15** | **23–33 h** |

---

## Phase 1 — Foundation: types, additive View surface, loop + frame ownership

Contract types (`view/types.ts`), additive `View.focusable`/`preProcess`/`postProcess` + `onEvent`
retype, `Group.current`, and `createEventLoop` building + owning the `RenderRoot` (deferring
scheduler, one-flush-per-tick `dispatch`, `resize`, `onIdle`, handler-error isolation). Dispatch
routes to a minimal target here; full 3-phase lands in Phase 2. Covers AC-1, AC-16, AC-17, AC-18,
AC-19. (Refs: 03-01, 03-04.)

### Session 1A — Spec tests (RED)
- [ ] T1.1 — Add `event.loop.spec.test.ts` (**ST-01** pure construct/dispatch, **ST-16** one flush/tick, **ST-17** resize→reflow+one frame, **ST-18** onIdle on drain, **ST-19** onEvent-throw isolated). (07 §spec; AC-1,16,17,18,19)
- [ ] T1.2 — Run `yarn workspace @jsvision/ui test` → confirm loop specs **fail (RED)**; all RD-01/02/03 suites stay green.

### Session 1B — Implementation (GREEN)
- [ ] T1.3 — `view/types.ts`: declare `CommandEvent`/`AppEvent`/`DispatchEvent` (PA-8, AR-60). `view/view.ts`: add `focusable`/`preProcess`/`postProcess` (default false) + retype `onEvent(ev: DispatchEvent)`. `view/group.ts`: add `@internal current: View|null`. Re-export contract types via `view/index.ts`. **Spec-oracle adaptation (PF-008, user-approved):** the base `onEvent` narrowing makes the *direct call* `view.tree.spec.test.ts:94` (`v.onEvent({type:'key',value:'x'})`) a TS2345; type-adapt that call argument to a valid `DispatchEvent` (`{ event:{type:'key',…}, handled:false }`) — the ST-15 assertion ("stub changes no state") is preserved, not weakened. (03-01; AR-56,60; PA-2,8; PF-008)
- [ ] T1.4 — `event/types.ts`: `EventLoop`/`EventLoopOptions`. `event/event-loop.ts`: `createEventLoop(viewport,opts)` — build `RenderRoot` with a **deferring** `schedule`; `mount`; the shared **`runTick(work)`** (do work → drain cascade → `onIdle` → one `flush`, re-entrant calls join the active tick, `draining` reset in `finally`); `dispatch` routes through `runTick`; `resize` (reflow + one `flush`); `onEvent`-error isolation via `logger`. `event/index.ts` barrel + `src/index.ts` re-exports. (03-01,03-04; AR-61,64,66; PA-7,11)
- [ ] T1.5 — Run tests → loop specs **GREEN** (one flush/tick, resize, idle, error isolation). 

### Session 1C — Impl tests & hardening
- [ ] T1.6 — `event.loop.impl.test.ts` (deferring schedule never self-flushes; re-entrant `emitCommand` coalesces; `renderRoot` accessor; `onEvent` retype compiles vs `onEvent(_ev: unknown)` subclass). (07 §impl)
- [ ] T1.7 — `yarn verify` + `lint` green; no file > 500 lines. **/gitcm** — `feat(view): additive focusable/preProcess/postProcess + DispatchEvent contract` + `feat(event): EventLoop skeleton — builds RenderRoot, one frame per tick` (two commits, per scope).

---

## Phase 2 — 3-phase dispatch + commands + keymap

The pre/focus/post router with `handled` short-circuit, the command registry (enable/disable +
enabled-by-default), and core-`Keymap` key→command (consume). Covers AC-2, AC-9, AC-10, AC-11.
(Refs: 03-02.)

### Session 2A — Spec tests (RED)
- [ ] T2.1 — Add `event.dispatch.spec.test.ts` (**ST-02** 3-phase order + handled, **ST-09** command dispatch, **ST-10** enable/disable + unknown-enabled, **ST-11** keymap consume). (AC-2,9,10,11)
- [ ] T2.2 — Run tests → dispatch specs **RED**.

### Session 2B — Implementation (GREEN)
- [ ] T2.3 — `event/dispatch.ts`: `route(ev)` — keymap consume (PA-1) → mouse/wheel branch stub (Phase 4) → pre (root→down) / focused-chain / post sweeps with `handled` short-circuit; `deliver` wraps `onEvent` in try/catch→logger. (03-02; AR-51,66; PA-1,2)
- [ ] T2.4 — `event/commands.ts`: registry (`Map` of explicit overrides; `isEnabled` defaults true, PA-3); `emit` (drop if disabled, else enqueue CommandEvent onto the tick); keymap glue (`keymap.lookup`→`emit`). Wire `emitCommand` (public) **through `runTick`** so a standalone call drains + flushes (PA-11), `enableCommand`/`isCommandEnabled`, + `route`'s key→command. (03-02; AR-52,62; PA-1,3,11)
- [ ] T2.5 — Run tests → dispatch specs **GREEN**.

### Session 2C — Impl tests & hardening
- [ ] T2.6 — `event.dispatch.impl.test.ts` (both-flag view in both sweeps; handled-in-pre skips focus+post; command handled in post; `opts.commands` seed; disabled bound key drops). (07 §impl)
- [ ] T2.7 — `yarn verify` + `lint` green. **/gitcmp** — `feat(event): 3-phase dispatch + command registry + keymap (consume)`.

---

## Phase 3 — Focus manager (current chain, traversal, predicate)

Per-group `current` chain, focusable predicate (+ ancestor subtree semantics), Tab/Shift-Tab (wrap),
`focusView`/`getFocused`, save/restore, focus-flip repaint. Phase 2's focused-chain sweep now uses
the real focus manager. Covers AC-3, AC-4, AC-5, AC-6. (Refs: 03-03.)

### Session 3A — Spec tests (RED)
- [ ] T3.1 — Add `event.focus.spec.test.ts` (**ST-03** current chain + getFocused + single focused, **ST-04** Tab/Shift-Tab wrap + skip **+ built-in `tab`/`shift+tab` KeyEvent moves focus & is not also plain-dispatched (PA-10)** — note ST-04's `shift+tab` uses a synthetic event at the RD-04 layer; it's producible end-to-end since core decodes backtab (PF-010/RT-1, resolved), **ST-05** predicate + subtree + Group-focusable, **ST-06** focus-flip invalidates exactly old+new, one frame). (AC-3,4,5,6; PA-10, PF-010)
- [ ] T3.2 — Run tests → focus specs **RED**.

### Session 3B — Implementation (GREEN)
- [ ] T3.3 — `event/focus.ts`: `isFocusable`/`noBlockingAncestor`/`isFocusableContainer` (AR-56,65); `focusLeaf` (set current-chain + flip 2 flags + invalidate); `getFocused`; `focusView` (no-op if non-focusable, PA-5); `focusNext`/`focusPrev` (wrap + descend into Group, AR-57); save/restore via the persisted `current` pointers. (03-03; AR-48,56,57,65; PA-5)
- [ ] T3.4 — Wire the loop's public focus methods through **`runTick`** (one frame each, PA-11); wire dispatch Phase-2 chain + the **built-in `tab`/`shift+tab`→`focus.next()`/`focus.prev()`** branch in `route` (consumed, keymap-bound `tab` overrides — PA-10) to the focus manager; run tests → focus specs **GREEN**.

### Session 3C — Impl tests & hardening
- [ ] T3.5 — `event.focus.impl.test.ts` (save/restore on group re-entry; descend focuses current/first; `focusView` non-focusable no-op; `focusNext` zero-focusable no-op; hidden-ancestor blocks a focusable leaf). (07 §impl)
- [ ] T3.6 — `yarn verify` + `lint` green. **/gitcmp** — `feat(event): per-group current focus chain + Tab traversal`.

---

## Phase 4 — Mouse hit-test + focus-on-click

1-based→0-based normalize, top-most-first walk (skip hidden/disabled subtrees), view-local on the
envelope, focus-on-click. Covers AC-7, AC-8. (Refs: 03-03.)

### Session 4A — Spec tests (RED)
- [ ] T4.1 — Add `event.mouse.spec.test.ts` (**ST-07** top-most-first hit-test + view-local + overlap-on-top, **ST-08** focus-on-click + empty-space steals-no-focus). (AC-7,8)
- [ ] T4.2 — Run tests → mouse specs **RED**.

### Session 4B — Implementation (GREEN)
- [ ] T4.3 — `event/hit-test.ts`: `hitTestRoute(ev)` — normalize (AR-63), `topMost` walk (reverse children, ancestor-clip via `intersect`, skip `!visible`/`disabled`, AR-65), `ev.local`, `focusOnClick` (climb to nearest focusable, AR-50,57). Wire `route`'s mouse/wheel branch to it. (03-03; AR-50,57,63,65)
- [ ] T4.4 — Run tests → mouse specs **GREEN**.

### Session 4C — Impl tests & hardening
- [ ] T4.5 — `event.mouse.impl.test.ts` (reverse-z overlap; hidden/disabled subtree skipped; `focusOnClick` climbs to ancestor; off-tree point → null no-op). (07 §impl)
- [ ] T4.6 — `yarn verify` + `lint` green. **/gitcmp** — `feat(event): top-most-first mouse hit-test + focus-on-click`.

---

## Phase 5 — Modality + packaging + demo + final gate

`execView`/`endModal` modal stack, input capture, nested LIFO, save/restore-around-modal; the full
public surface; `demo:events`; final gate. Covers AC-12, AC-13, AC-14, AC-15, AC-20. (Refs: 03-04.)

### Session 5A — Spec tests (RED)
- [ ] T5.1 — Add `event.modal.spec.test.ts` (**ST-12** execView resolves on endModal, **ST-13** input capture + outer inert + outside-click ignored, **ST-14** focus save/restore, **ST-15** nested LIFO). Add `event.packaging.spec.test.ts` (**ST-20** re-export shape + check:deps + bounded/no-injection). (AC-12,13,14,15,20)
- [ ] T5.2 — Run tests → modal specs **RED**; packaging ST-20 partially green (surface) until `event/index.ts` is finalized.

### Session 5B — Implementation (GREEN)
- [ ] T5.3 — `event/modal.ts`: `ModalFrame`, `modalStack`, `execView<R>` (push + saveFocus + focus modal + capture), `endModal<R>` (pop LIFO + restore focus + resolve, explicit-only PA-4). Wire **both** loop `execView` **and** `endModal` **through `runTick`** (PA-11) — `execView` wraps its synchronous push+focus in the tick so opening a modal paints exactly one frame without relying on `serialize()` (PF-009), then returns the `Promise`; `endModal` likewise. Confine dispatch `scopeRoot` + hit-test `scopeRoot` to the top modal subtree, **including the Phase-2 focused-chain bubble clamp at `scopeRoot`** so the outer tree stays inert (AR-53, PA-6, PA-12). (03-04; AR-53; PA-4,6,11,12; PF-009)
- [ ] T5.4 — Finalize `event/index.ts` + `src/index.ts` re-exports (`createEventLoop`/`EventLoop`/`CommandEvent`/`DispatchEvent`). `packages/examples/event-demo/main.ts` + `"demo:events"` script + `event-demo.e2e.test.ts`. (03-04; AR-59; PA-7,9)
- [ ] T5.5 — Run tests → modal + packaging specs **GREEN**; `demo:events` prints the focus+command+modal walkthrough.

### Session 5C — Final gate
- [ ] T5.6 — `event.modal.impl.test.ts` (endModal empty-stack no-op; nested ordering; savedFocus-no-longer-focusable skip; capture excludes outer; **`execView` paints exactly one frame on open** via the flush-spy, incl. a no-focusable-child modal — PF-009). Full `yarn verify` + `yarn test:e2e` + `yarn workspace @jsvision/ui check:deps` + `yarn lint` green; no dead code; no `event/` file > 500 lines. (07 §impl, §security)
- [ ] T5.7 — Update the feature roadmap RD-04 row → stage `Done` (cascade to portfolio). **/gitcmp** — `feat(event): modality + packaging + demo:events — RD-04 complete`.

---

## 🚨 Master Progress Checklist (All Phases) — MANDATORY

> Mark each task `[x]` with a timestamp immediately on completion; update the Progress header after
> every task; never batch updates.

### Phase 1 — Foundation + loop/frame ownership
- [ ] 1A Spec (RED): T1.1–T1.2
- [ ] 1B Impl (GREEN): T1.3–T1.5
- [ ] 1C Impl tests & harden: T1.6–T1.7 ✅ commit

### Phase 2 — 3-phase dispatch + commands + keymap
- [ ] 2A Spec (RED): T2.1–T2.2
- [ ] 2B Impl (GREEN): T2.3–T2.5
- [ ] 2C Impl tests & harden: T2.6–T2.7 ✅ commit

### Phase 3 — Focus manager
- [ ] 3A Spec (RED): T3.1–T3.2
- [ ] 3B Impl (GREEN): T3.3–T3.4
- [ ] 3C Impl tests & harden: T3.5–T3.6 ✅ commit

### Phase 4 — Mouse hit-test
- [ ] 4A Spec (RED): T4.1–T4.2
- [ ] 4B Impl (GREEN): T4.3–T4.4
- [ ] 4C Impl tests & harden: T4.5–T4.6 ✅ commit

### Phase 5 — Modality + packaging + demo + gate
- [ ] 5A Spec (RED): T5.1–T5.2
- [ ] 5B Impl (GREEN): T5.3–T5.5
- [ ] 5C Final gate: T5.6–T5.7 ✅ commit + push

---

## Dependencies

```
Phase 1 (types + additive surface + loop/frame ownership)
    ↓
Phase 2 (3-phase dispatch + commands + keymap)
    ↓
Phase 3 (focus manager → feeds Phase 2's focused-chain sweep)
    ↓
Phase 4 (mouse hit-test → fills Phase 2's mouse branch + uses Phase 3 focus-on-click)
    ↓
Phase 5 (modality scopes Phases 2–4 + packaging + demo + gate)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All 5 phases completed; 20 spec tests (ST-01…ST-20 ↔ AC-1…AC-20) green + impl tests green
2. ✅ `yarn verify` + `yarn test:e2e` + `yarn workspace @jsvision/ui check:deps` + `yarn lint` green
3. ✅ No warnings/errors; no regressions in RD-01/RD-02/RD-03 suites
4. ✅ No dead code — no unused params/functions/exports
5. ✅ Security hardened — input-kind validation, no-throw degenerate handling, output via core
   `sanitize`, bounded passes (RD-04 §Security; ST-20)
6. ✅ `createEventLoop`/`EventLoop`/`CommandEvent`/`DispatchEvent` importable from `@jsvision/ui`;
   `demo:events` runs; every `event/` file ≤ 500 lines with JSDoc
7. ✅ Roadmap synced (RD-04 → Done, cascaded to portfolio)
8. ✅ Post-completion project re-analysis (handled by the exec_plan skill)
