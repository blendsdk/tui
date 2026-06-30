# Execution Plan: Essential Controls + Validators (RD-06)

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-07-01
> **Progress**: 9/24 tasks (38%) — Phases 1–2 (Foundation, Text+Label) complete
> **CodeOps Skills Version**: 3.1.0

## Overview

Build the RD-06 leaf controls + validators on the `@jsvision/ui` spine, **spec-first per component**
(spec oracles RED → implement GREEN → impl tests), reading each control's `magiblot/tvision` source
first per the fidelity directive. Seven phases: foundation primitives → Text/Label → Button → Validators
→ Input → Clusters → demo+gate. Two additive intra-ui primitives (`ev.emit`/`ev.focusView` on the
dispatch envelope + a per-view focus-change signal, PF-009), one additive cross-package edit (core
control theme roles); the loop/spine are **not** re-shaped. Commit via **/gitcm** (commit) or **/gitcmp** (commit+push) — never raw git.

**🚨 Update this document after EACH completed task!** Verify command: `yarn verify` (root); iterate with
`yarn workspace @jsvision/ui test controls.<component>` (+ `yarn build` before ui tests when core theme
roles change — ui resolves core from `dist/`).

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Foundation — `ev.emit`/`ev.focusView` primitive · core theme roles · `controls/` skeleton | 3 | 3–5 h |
| 2 | Text + Label | 3 | 3–5 h |
| 3 | Button | 3 | 3–5 h |
| 4 | Validators (`filter`/`range`/`lookup`) | 3 | 2–4 h |
| 5 | Input (lean) | 3 | 4–6 h |
| 6 | Clusters (`Cluster`/`CheckGroup`/`RadioGroup`) | 3 | 4–6 h |
| 7 | Focus traversal + demo + final gate | 2 | 2–4 h |
| **Total** | | **20** | **21–35 h** |

---

## Phase 1 — Foundation  (03-01 · PA-1/PA-5/PA-4)
### 1.1 Spec (→ RED)
- [x] **1.1.1** Write `controls.foundation.spec` (ST-01: a focused stub control's `ev.emit('ok')` reaches a CommandSpy) + extend `color-palette-theme.spec` (ST-02: the new roles deep-equal the `app.h` decode, `encode()` no-throw). Derive the byte values from `app.h` directly. Confirm **RED**. _(2026-07-01 — RED confirmed: ST-01 fails, ST-02 deep-equal + encode fail)_

### 1.2 Implementation (→ GREEN)
- [x] **1.2.1** Add `emit?`/`focusView?` to `DispatchEvent` (`view/types.ts`); add `emit`/`focusView` to the `RouteContext` interface (`event/dispatch.ts:23`), source them in `event-loop.ts routeContext()` (`registry.emit`/`focus.focusView`), and enrich the envelope once at the top of `route()` (`const ev2 = { ...ev, emit, focusView }`, used for the mouse branch + all sweeps — the hit-test spread propagates them) (PA-1/PA-10). (scope `event`) _(2026-07-01 — ST-01 GREEN)_
- [x] **1.2.1b** Add the lazy per-view **focus-change signal** `focusSignal()` to `view/view.ts` and poke it from `focusLeaf` in `event/focus.ts` (additive; PF-009) — the seam `Label`/`Input` bind to for cross-view focus reactivity. (scope `view`/`event`) _(2026-07-01)_
- [x] **1.2.2** Add the control roles to core `Theme`+`defaultTheme` (`core/.../theme.ts`), decoded from `app.h`; reuse `button`/`buttonFocused`. `yarn build`. (scope `color`) → ST-02 GREEN. _(2026-07-01)_
- [x] **1.2.3** Create the `controls/` subsystem skeleton + barrel + `src/index.ts` re-exports (PA-4). ST-01 GREEN. _(2026-07-01 — barrel + staged explicit-named re-export section)_

### 1.3 Impl tests
- [x] **1.3.1** Impl: `ev.emit`/`focusView` `undefined` on a bare envelope (optional-chain safe); roles present in `defaultTheme`. Full verify. _(2026-07-01 — `yarn verify` 8/8 green, no regression)_

## Phase 2 — Text + Label  (03-02 · AC-1/AC-2 · PA-10/PA-14)
### 2.1 Spec (→ RED)
- [x] **2.1.1** `controls.text-label.spec` (ST-03 Text word-wrap + reactive; ST-04 Label highlight on link-focus + click/`Alt-N` focuses link). Cite `tstatict.cpp`/`tlabel.cpp`. **RED**. _(2026-07-01)_
### 2.2 Implementation (→ GREEN)
- [x] **2.2.1** Implement `Text` (word-wrap, `staticText`, reactive). (scope `controls`) _(2026-07-01)_
- [x] **2.2.2** Implement `Label` (postProcess hotkey, `ev.focusView` link, `labelSelected` on link-focus). ST-03/04 GREEN. _(2026-07-01)_
### 2.3 Impl tests
- [x] **2.3.1** Impl: over-long-word hard-break; hotkey-less label; focusing a disabled link is inert. Verify. _(2026-07-01 — `yarn verify` 8/8 green)_

## Phase 3 — Button  (03-03 · AC-3 · PA-1/PA-7/PA-8)
### 3.1 Spec (→ RED)
- [ ] **3.1.1** `controls.button.spec` (ST-05 draw+shadow+state roles; ST-06 activate via click/Space/Alt-O/default-Enter + disabled inert). Cite `tbutton.cpp`. **RED**.
### 3.2 Implementation (→ GREEN)
- [ ] **3.2.1** Implement `Button` (`[ text ]` + `▄`/`█`/`▀` shadow, state→role, `Space`/`Alt-hotkey`, default-`Enter` postProcess, `ev.emit`+`onClick`, disabled). ST-05/06 GREEN. (scope `controls`)
### 3.3 Impl tests
- [ ] **3.3.1** Impl: release-outside cancels; both `command`+`onClick` fire; non-default ignores Enter; reactive disabled. Verify.

## Phase 4 — Validators  (03-04 · AC-5 · PA-12)
### 4.1 Spec (→ RED)
- [ ] **4.1.1** `controls.validators.spec` (ST-07: the filter/range/lookup `isValidInput`/`isValid` table). Cite `tvalidat.cpp`. **RED**.
### 4.2 Implementation (→ GREEN)
- [ ] **4.2.1** Implement `controls/validators/` (`types.ts` + `filter`/`range`/`lookup` factories). ST-07 GREEN. (scope `controls`)
### 4.3 Impl tests
- [ ] **4.3.1** Impl: `min<0` leading `-`; empty-string edge per validator; `range` parse of `'12x'`. Verify.

## Phase 5 — Input  (03-05 · AC-4/AC-5 · PA-2/PA-11)
### 5.1 Spec (→ RED)
- [ ] **5.1.1** `controls.input.spec` (ST-08 edit+two-way+maxLength+`inputSelected`; ST-09 live filter-reject + `◄`/`►` scroll + `valid()`/`invalid` no-trap). Cite `tinputli.cpp`. **RED**.
### 5.2 Implementation (→ GREEN)
- [ ] **5.2.1** Implement `Input` (cursor/`firstPos` scroll/arrows/`maxLength`/two-way `value`/validator hook/`valid()`). ST-08/09 GREEN. (scope `controls`)
### 5.3 Impl tests
- [ ] **5.3.1** Impl: scroll-keeps-cursor math; click-to-position; arrow-click scroll; no-validator path. Verify.

## Phase 6 — Clusters  (03-06 · AC-6/AC-7 · PA-3/PA-6/PA-9)
### 6.1 Spec (→ RED)
- [ ] **6.1.1** `controls.cluster.spec` (ST-10 CheckGroup `[ ]`/`[X]` + toggle + signal; ST-11 RadioGroup `( )`/`(•)` + `↓` exclusive + index + `clusterSelected`). Cite `tcluster.cpp`/`tcheckbo.cpp`/`tradiobu.cpp`. **RED**.
### 6.2 Implementation (→ GREEN)
- [ ] **6.2.1** Implement the internal `Cluster` base (single-column 5-cell box, `↑↓`/Space/hotkey, roles). (scope `controls`)
- [ ] **6.2.2** Implement `CheckGroup` (`boolean[]`) + `RadioGroup` (`number`, narrow marker PA-9). ST-10/11 GREEN.
### 6.3 Impl tests
- [ ] **6.3.1** Impl: disabled-item skip; click-to-item; short/out-of-range bound value; hotkey select. Verify.

## Phase 7 — Focus + demo + final gate  (03-07 · AC-8/AC-11/AC-12/AC-13)
### 7.1 Spec (→ RED)
- [ ] **7.1.1** `controls.focus.spec` (ST-12 Tab cycle skipping `Text`) + `controls.packaging.spec` (ST-13). **RED** (focus) / packaging green-on-write. 
### 7.2 Implementation + demo (→ GREEN)
- [ ] **7.2.1** Build `controls-demo/` + `demo:controls` script + `controls-demo.e2e` (ST-14). (scope `examples`)
- [ ] **7.2.2** Verify the RD-06 deferred items are present + correctly targeted in `requirements/DEFERRED.md` — DEF-16 (modal focus-trap), DEF-17 (multi-column cluster), DEF-18 (Text center/right), DEF-19 (hardware caret), DEF-01/02/03 (Input selection·clipboard / `picture` / `MultiCheckGroup`) (ST-15; all already registered). Confirm ST-16 (no regression) by rerunning the existing golden/spec suites.
### 7.3 Final gate
- [ ] **7.3.1** Full gate: `yarn verify` (core + ui + examples), `yarn check:deps`, `yarn lint`, `demo:controls` e2e. /gitcmp.

---

## 🚨 Master Progress Checklist (All Phases)

> Mark each `[x]` with a timestamp immediately on completion; bump the Progress header; never batch.

### Phase 1 — Foundation
- [x] 1.1.1 Spec RED (ST-01/02) _(2026-07-01)_
- [x] 1.2.1 `ev.emit`/`focusView` envelope _(2026-07-01)_
- [x] 1.2.1b focus-change signal (PF-009) _(2026-07-01)_
- [x] 1.2.2 core theme roles (from `app.h`) _(2026-07-01)_
- [x] 1.2.3 `controls/` skeleton + re-exports _(2026-07-01)_
- [x] 1.3.1 impl tests + verify _(2026-07-01)_
### Phase 2 — Text + Label
- [x] 2.1.1 Spec RED (ST-03/04) _(2026-07-01)_
- [x] 2.2.1 `Text` · 2.2.2 `Label` _(2026-07-01)_
- [x] 2.3.1 impl tests + verify _(2026-07-01)_
### Phase 3 — Button
- [ ] 3.1.1 Spec RED (ST-05/06)
- [ ] 3.2.1 `Button`
- [ ] 3.3.1 impl tests + verify
### Phase 4 — Validators
- [ ] 4.1.1 Spec RED (ST-07)
- [ ] 4.2.1 validators
- [ ] 4.3.1 impl tests + verify
### Phase 5 — Input
- [ ] 5.1.1 Spec RED (ST-08/09)
- [ ] 5.2.1 `Input`
- [ ] 5.3.1 impl tests + verify
### Phase 6 — Clusters
- [ ] 6.1.1 Spec RED (ST-10/11)
- [ ] 6.2.1 `Cluster` base · 6.2.2 `CheckGroup`/`RadioGroup`
- [ ] 6.3.1 impl tests + verify
### Phase 7 — Focus + demo + gate
- [ ] 7.1.1 Spec RED (ST-12/13)
- [ ] 7.2.1 demo + e2e (ST-14) · 7.2.2 DEFERRED.md + no-regression (ST-15/16)
- [ ] 7.3.1 final gate + /gitcmp

---

## Dependencies
```
Phase 1 (foundation: emit/focusView + theme roles + skeleton)
   ↓
Phase 2 (Text+Label) → Phase 3 (Button)        [both need foundation]
   ↓
Phase 4 (Validators) → Phase 5 (Input)         [Input consumes validators]
   ↓
Phase 6 (Clusters)
   ↓
Phase 7 (focus + demo + gate)                  [needs all controls]
```

## Success Criteria
1. ✅ All 7 phases complete; ST-01…ST-16 green (spec oracles immutable).
2. ✅ `yarn verify` / `check:deps` / `lint` clean; no regression (ST-16).
3. ✅ One additive cross-package edit (control theme roles); two additive intra-ui primitives (`ev.emit`/`focusView` + the PF-009 focus-change signal); loop/spine not re-shaped.
4. ✅ Every control's geometry verified against its TV source (JSDoc + commit cites).
5. ✅ Deferred sub-scope registered in `DEFERRED.md`; no dead code; files ≤ 500 lines.
6. ✅ Post-completion re-analysis (handled by exec_plan).
