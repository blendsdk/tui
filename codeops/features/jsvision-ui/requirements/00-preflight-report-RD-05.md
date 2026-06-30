# Preflight Report: RD-05 — App Shell

> **Status**: ✅ PASSED — all 6 findings resolved (Option A, user-confirmed 2026-06-30); recorded as AR-82…AR-87
> **Iteration**: 1 (first scan)
> **Artifact**: Requirements (single RD) at `codeops/features/jsvision-ui/requirements/RD-05-app-shell.md`
> **Codebase Grounded**: 14 source files examined, ~20 references verified (1 independent challenger run on the 3 MAJOR findings)
> **Last Updated**: 2026-06-30

### Codebase Context Summary

**Tech Stack:** TypeScript ESM/NodeNext (strict), zero runtime deps; yarn 1.x + Turborepo; vitest; Node 20/22/24.
**Architecture:** Foundation-first. RD-05 composes the shipped RD-01 reactive core, RD-02 layout, RD-03 view/group spine, RD-04 event loop, plus `@jsvision/core`'s `createHost`. RD-05 is the first RD to touch a live TTY.
**Key Files Examined:** `packages/ui/src/event/{types,event-loop,dispatch,hit-test}.ts`; `packages/ui/src/view/{view,group,render-root,types}.ts`; `packages/core/src/engine/host/{types,host,signals}.ts`; `packages/core/src/engine/color/theme.ts`; `packages/core/src/engine/input/{events,keymap,keys}.ts`.

**Verified as accurate (no findings):** `createHost` option shape + `start`/`stop`; core exports (`Host`/`RuntimeAdapter`/`Logger`/`Keymap`/`CapabilityProfile`/`Theme`/`defaultTheme`/`createKeymap`); core `Theme` genuinely lacks an active/inactive window role (additive change justified); `desktop` role carries `pattern:'░'`; `View` (`focusable`/`preProcess`/`postProcess`/`bounds`/`invalidateLayout`/`onMount`/`onCleanup`) and `Group` (subclassable, `children` z-order, `background`, `addDynamic`) surfaces; full EventLoop method set; **Alt+hotkey decoding + keymap grammar** (AC-16 feasible).

### Summary by Dimension

| # | Dimension | Findings | Highest Severity |
|---|-----------|----------|-----------------|
| 1 | Ambiguities | 1 (PF-005) | 🟡 |
| 2 | Implicit Assumptions | 1 (PF-002) | 🟠 |
| 3 | Logical Contradictions | 0 | — |
| 4 | Completeness Gaps | 3 (PF-001, PF-003, PF-004) | 🟠 |
| 5 | Dependency Issues | 0 | — |
| 6 | Feasibility Concerns | (PF-001, PF-003 cross-listed) | 🟠 |
| 7 | Testability | 0 | — |
| 8 | Security Blind Spots | 0 | — |
| 9 | Edge Cases | 1 (PF-006) | 🟡 |
| 10 | Scope Creep | 0 | — |
| 11 | Ordering & Sequencing | 0 | — |
| 12 | Consistency | 0 | — |
| 13 | Codebase Alignment | 3 (PF-001, PF-002, PF-003) | 🟠 |

### Summary by Severity

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | — |
| MAJOR | 3 | ✅ all resolved (Option A → AR-82/AR-83/AR-84) |
| MINOR | 3 | ✅ all resolved (Option A → AR-85/AR-86/AR-87) |
| OBSERVATION | 0 | — |

---

### PF-001: Window drag-move / free drag-resize need a mouse-capture seam that RD-04 does not provide 🟠 MAJOR

**Dimension:** Completeness Gaps (also Feasibility, Codebase Alignment)
**Location:** RD-05 §Desktop "Drag-move (AR-67)" (lines 90-92), "Free drag-resize (AR-74)" (lines 93-95); §Behavior notes (lines 308-311: "Hit-testing … already routes the mouse to the top-most window"); Integration "it does not re-shape it" (line 331).
**Codebase Evidence:** `packages/ui/src/event/dispatch.ts:116` (mouse/wheel branch out *before* the pre/focus/post sweeps → straight to `hitTestRoute`, never bubbles); `packages/ui/src/event/hit-test.ts:108-113` (delivers to the single top-most hit view only; comment: *"Mouse/wheel skip the 3-phase bubble … if bubbling is ever added, carry handled back"*); `hit-test.ts:50` (skips `!visible`/`disabled` subtrees), `:106` (point hitting nothing = no-op). Core mouse model supports it (`packages/core/src/engine/input/events.ts:30` — `kind: 'down'|'up'|'move'|'drag'`).
**The Problem:** RD-05 says a title-bar mouse-down "captures the drag" and the SE corner resizes live, but RD-04 has **no pointer-capture mechanism and no ancestor bubbling** — every mouse event goes only to the top-most view under the cursor. During a fast drag, or when the window is clamped at the desktop edge while the cursor keeps moving, or for the **single-cell** resize corner, the cursor leaves the affordance and subsequent `'drag'`/`'up'` events are delivered to a *different* view (Desktop, sibling window) or dropped — the drag/resize silently breaks. The Behavior note "hit-testing already routes the mouse to the top-most window" is true only for the *initial* mouse-down, not the ongoing drag. Independently confirmed: **NEEDS-NEW-MECHANISM**.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Add an **additive pointer-capture seam to the loop** (e.g. `setCapture(view)`/`releaseCapture()`); while set, `hitTestRoute` routes all mouse `move`/`drag`/`up` to the captured view until release. RD-05 specifies it as a needed additive RD-04 mechanism (same spirit as the additive core `Theme` change it already calls out). | Robust drag/resize regardless of cursor position; the standard WM pattern (TV's drag loop); small, well-scoped seam | Modifies RD-04's `event/` module (additive); RD-05 must drop/soften the "does not re-shape the loop" claim |
| B | Best-effort drag: document that the cursor must stay on the affordance; accept dropped drags on fast/clamped motion | No loop change | Single-cell resize corner is effectively unusable; clamped title drag breaks by construction; poor UX for a Tier-0 WM |

**Recommendation:** **Option A.** B fails the core use case (a 1-cell resize corner can't be tracked without capture, and clamping *guarantees* the cursor leaves the title). Add a minimal capture seam to the loop and acknowledge it in RD-05 alongside the additive core `Theme` change; update the "does not re-shape" wording to "composes + adds an additive pointer-capture seam." Verified against `dispatch.ts:116` / `hit-test.ts:108-113`.

**Confidence:** High. **Hardening:** independent challenger reached the same verdict (NEEDS-NEW-MECHANISM) from the same code; no viable no-capture path for a single-cell corner.

**User Decision:** Resolved — User accepted recommendation (Option A); recorded as **AR-82**. RD-05 updated: drag/resize bullets + behavior note + the additive `setCapture`/`releaseCapture` loop seam in the Technical section + softened "composes, not re-shapes" wording.

---

### PF-002: Suspend/resume requirement misattributes mode re-assertion + full repaint to the app — core's host already does both 🟠 MAJOR

**Dimension:** Implicit Assumptions / Codebase Alignment (Stale Assumption)
**Location:** RD-05 §Application "Suspend / resume" (lines 72-73): "on `onResume` (SIGCONT) the app re-asserts modes and forces a **full repaint**"; AC-5 (lines 432-433): "`onResume` re-asserts modes and forces one full repaint of the current frame."
**Codebase Evidence:** `packages/core/src/engine/host/signals.ts:110-122` — the SIGCONT/`continue` handler itself re-asserts raw mode (`setRawMode(input,true)`), re-writes the enter-mode string, and **forces the full repaint** (re-serialize the last buffer against `null` previous), and *only then* calls `ctx.onResume?.()`. `packages/core/src/engine/host/types.ts:44` confirms the contract: `onResume` is "fired **after** modes are re-asserted + full repaint."
**The Problem:** The host owns mode re-assertion and the resume full-repaint; `onResume` is a *post-hoc notification*, fired after the screen is already restored. As written, RD-05 (a Must-Have bullet **and** AC-5) directs the app to re-assert modes and repaint in `onResume` — which is redundant at best and risks double enter-mode writes / glitches. The genuine app-side job on resume is at most state resync (and there is no app state to change while stopped). Independently confirmed: **doc attribution is wrong; underlying behavior works for free.**

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | **Reword** the requirement + AC-5: SIGCONT mode re-assert + full repaint is **owned by core's host** (`signals.ts`); RD-05's `onResume` is a notify hook only (optional app-level resync). The "restore on every exit path" guarantee stays. | Accurate to the code; AC-5 becomes a true oracle (assert the host restored + repainted); no redundant app work | Requires editing a Must-Have bullet + AC-5 wording |
| B | Keep the wording but interpret "the app" loosely as "the app's host" | No doc edit | Leaves a false how-it-works claim that will mislead the plan into re-asserting modes app-side |

**Recommendation:** **Option A.** This is a stale how-it-works claim (the exact Dimension-13 failure mode); B preserves the inaccuracy. The fix is low-cost (rewording), and AC-5 becomes verifiable against the host contract. Verified against `signals.ts:110-122` + `host/types.ts:44`.

**Confidence:** High. **Hardening:** challenger independently traced `signals.ts:111-124` and the `types.ts:44-45` contract to the same conclusion.

**User Decision:** Resolved — User accepted recommendation (Option A); recorded as **AR-83**. RD-05 updated: Suspend/resume Must-Have bullet + AC-5 reworded — core's host owns the mode re-assert + repaint; `onResume` is notify-only.

---

### PF-003: `run()` has no way to push async-produced frames to the terminal — the loop exposes no frame-flushed hook 🟠 MAJOR

**Dimension:** Completeness Gaps (also Feasibility, Codebase Alignment)
**Location:** RD-05 §`run()` (lines 62-66: "paints the first frame, and runs until …"); §Behavior notes "Lifecycle" (lines 302-306); Integration "output still flows through RD-03 → core `serialize`/`sanitize`" (lines 350-354).
**Codebase Evidence:** `EventLoop` interface `packages/ui/src/event/types.ts:36-63` exposes `renderRoot`/`mount`/`dispatch`/`resize`/focus/command/modal — **no `onFrame`/`onFlush` callback**. `RenderRoot` `packages/ui/src/view/render-root.ts:34-45` exposes `flush()`/`serialize()`/`buffer()` but fires no callback on flush. Core `Host.render(buffer)` (`packages/core/src/engine/host/types.ts:67`) is the paint path. `runTick` (`event-loop.ts` ~141-158) is the only caller of `renderRoot.flush()` and returns synchronously — but **`endModal` (and any command) invoked from a Promise/timer runs its own `runTick` → `flush()` with no caller waiting to push the frame** to `host.render`.
**The Problem:** RD-05 never specifies how a composed frame reaches the terminal. After a synchronous `dispatch()` returns, `run()` *could* poll `loop.renderRoot.buffer()` → `host.render(...)`. But frames produced by **async** work — an `execView` modal closed via `endModal` from a `.then`/timer, or a command emitted asynchronously — compose into the buffer and are **never delivered** to `host.render`, because nothing observes that flush. The per-dispatch-return polling model the doc implies is insufficient for the SDK's own async modality. Independently confirmed: **NEEDS-NEW-MECHANISM**.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Add an **additive `onFrame`/`onFlush` seam** (an `EventLoopOptions` callback fired at the end of `runTick` after `flush()`, and on `resize`); RD-05's `run()` pushes `renderRoot.buffer()` → `host.render` on **every** frame, sync or async. | Covers async `endModal`/commands; one canonical paint path; small additive seam matching RD-04's option-seam style | Additive edit to RD-04's `event/` module; same "re-shape" wording tension as PF-001 |
| B | `run()` calls `host.render(renderRoot.buffer())` only after each external `dispatch`/`resize`/`emitCommand` returns (no hook) | No loop change | Async-triggered frames (`endModal` from a Promise/timer) never paint — breaks the interactive demo and real modal apps |

**Recommendation:** **Option A.** B leaves async modal results invisible — a real correctness gap given `execView`/`endModal` are explicitly reused (AR-79). Specify the hook as an additive loop seam (alongside PF-001's capture seam) and note it as the second additive RD-04 edit. Verified against `event/types.ts:36-63`, `render-root.ts:34-45`, `host/types.ts:67`.

**Confidence:** High. **Hardening:** challenger independently identified the missing hook and the async-`endModal` failure path (`event-loop.ts:128-131,157`).

**User Decision:** Resolved — User accepted recommendation (Option A); recorded as **AR-84**. RD-05 updated: `run()` bullet + Lifecycle note + the additive `EventLoopOptions.onFrame` seam in the Technical section.

---

### PF-004: `Commands.resize` and `Commands.move` are defined but no requirement specifies what emitting them does 🟡 MINOR

**Dimension:** Completeness Gaps / Ambiguities
**Location:** RD-05 §Standard commands (lines 159-162), API `Commands` (line 282), Scope Decision AR-76 (line 376).
**Codebase Evidence:** RD-05 describes move/resize **only** as mouse-drag interactions (lines 90-95); a `grep` of the doc finds no keyboard-driven move/resize *mode*. TV's `cmResize`/`cmMove` enter an arrow-key move/resize mode — not in RD-05's scope text.
**The Problem:** Seven of the nine `Commands` map to described behaviors (`quit`/`close`/`zoom`/`next`/`prev`/`cascade`/`tile`); `resize` and `move` have no behavioral requirement or AC. A reader can't tell whether emitting `Commands.move`/`resize` (e.g. from a menu) starts a keyboard move/resize mode (unspecified) or is vestigial.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Drop `resize`/`move` from the v1 `Commands` set (keep mouse-drag only); add them when a keyboard move/resize mode is specified | Smallest surface; every shipped constant has a behavior | Slightly less TV-faithful vocabulary |
| B | Keep the constants and add a requirement + AC for a **keyboard move/resize mode** (Ctrl-arrows nudge / resize the active window) | Full TV parity; keyboard-only WM control | New state machine + ACs; scope growth in an already-XL RD |
| C | Keep the constants, document them as **reserved/no-op in v1** | Stable vocabulary for menus | A defined command that does nothing is a latent confusion |

**Recommendation:** **Option A.** B is real scope growth for an XL RD with no Phase-0 demo need; C ships dead API. Drop the two until a keyboard mode is specified (likely RD-06+). If keyboard WM control is actually wanted now, choose B and add the ACs.

**User Decision:** Resolved — User accepted recommendation (Option A); recorded as **AR-85**. RD-05 updated: `resize`/`move` removed from the `Commands` constants module + Must-Have bullet + AR-76 row.

---

### PF-005: `run(): Promise<number>` — the source of the resolved exit code is undefined 🟡 MINOR

**Dimension:** Ambiguities
**Location:** RD-05 §`run()` (line 66: "resolves the process **exit code**"); AC-3 (lines 427-428).
**The Problem:** `run()` resolves "the exit code" on `'quit'`, but nothing defines what *determines* its value. `emitCommand(command, arg?)` carries an optional arg (`event/types.ts`), so `'quit'` *could* carry an exit code — but RD-05 never says so. Is it always `0`? Does `quit`'s arg become the code? A throw/signal path (PF-002 restore) — what code then?

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Define it: `quit` resolves `0` by default; an optional numeric `emitCommand('quit', code)` arg overrides; the throw/signal path resolves (or rejects with) a non-zero code | Unambiguous, testable AC-3; uses the existing `arg` channel | One sentence + AC tweak |
| B | Leave to planning | Defer detail | AC-3 stays unverifiable ("the exit code" with no definition) |

**Recommendation:** **Option A** — it's a one-line clarification that turns AC-3 into a real oracle and reuses the existing `emitCommand` arg. Verified `emitCommand(command, arg?)` exists (`event/types.ts`).

**User Decision:** Resolved — User accepted recommendation (Option A); recorded as **AR-86**. RD-05 updated: `run()` bullet + AC-3 define the exit code (`0` default, overridable via `emitCommand('quit', code)`).

---

### PF-006: Cascade/Tile vs. the resize minimum-size and zoomed windows is unspecified 🟡 MINOR

**Dimension:** Edge Cases
**Location:** RD-05 §Desktop "Cascade / Tile (AR-67)" (lines 99-101); "Free drag-resize" minimum (line 94); "Zoom" (lines 96-98); AC-11.
**The Problem:** Two unhandled boundaries: (1) `tile` "packs them into a non-overlapping grid that fills the desktop" — with many windows on a small desktop, tile cells can fall **below** the resize minimum that AC-9 enforces; the conflict (clamp to minimum and overflow? allow sub-minimum tiles?) is undefined. (2) Whether `cascade`/`tile` operate on a currently **zoomed/maximized** window (un-zoom first? skip it? AR-67 says "all non-modal visible windows" without addressing zoom state). Degenerate counts (0 or 1 window) are also unstated, though the Security section's "clamped no-ops" likely covers them.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Add one behavior note + extend AC-11: tile clamps cells to the window minimum (cells may then exceed the desktop — consistent with RD-02 overflow AR-28); cascade/tile **un-zoom** any maximized window first; 0/1-window cases are no-op/single-fill | Removes the ambiguity; reuses the established overflow convention | Minor doc addition |
| B | Leave to planning | Defer | Re-surfaces during implementation; AC-11 under-specified |

**Recommendation:** **Option A** — small, and it reuses RD-02's existing overflow semantics (AR-28) and the zoom restore-geometry model already in RD-05, so it adds no new concept.

**User Decision:** Resolved — User accepted recommendation (Option A); recorded as **AR-87**. RD-05 updated: Cascade/Tile bullet + AC-11 (clamp cells to minimum, un-zoom first, 0/1-window handling).

---

> **Adversarial checklist (same-agent bias):** the 3 MAJOR findings were independently re-verified by a separate challenger run against the live code (concurring with identical `file:line` evidence). No external-standard conformance claims are at issue (in-process library). RD-05 is architecturally foundational (the integration keystone) — a human review of the two additive loop seams (PF-001/PF-003) before planning is advisable.
