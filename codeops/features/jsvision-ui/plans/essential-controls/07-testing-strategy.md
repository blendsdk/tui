# Testing Strategy: Essential Controls + Validators

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

Specification-first. The ST-* cases are the immutable oracles (from RD-06 AC-1…AC-13 + the TV source),
authored RED before each control's implementation. Expectations derive from the spec/TV source, never
from imagined implementation. All tests use the real composed app/loop (no mocks); buffers are read
pre-`serialize` for color/glyph assertions. Theme-role bytes are derived from `app.h` (PA-5).

## 🚨 Specification Test Cases

| ST | Component | Input / Scenario | Expected Output / Behavior | Source |
|----|-----------|------------------|----------------------------|--------|
| **ST-01** | `ev.emit` (03-01) | a focused stub control calls `ev.emit('ok')` in `onEvent` | a `CommandSpy` post-process view receives the `'ok'` command on the same tick | PA-1 |
| **ST-02** | Theme roles (03-01) | `defaultTheme` after the additive roles | `staticText`/`label`/`labelSelected`/`labelShortcut`/`buttonDefault`/`buttonDisabled`/`buttonShortcut`/`clusterNormal`/`clusterSelected`/`clusterShortcut`/`clusterDisabled`/`inputNormal`/`inputSelected`/`inputArrows` each deep-equal the `app.h` `cpAppColor[cpGrayDialog[slot]]` decode (e.g. `staticText` = black `#000000` on lightGray `#aaaaaa`); `encode()` of each does not throw; `button`/`buttonFocused` unchanged | PA-5 · AC-9 |
| **ST-03** | `Text` (03-02) | a `Text` of a long multi-word string in a width-20 view; then change a bound getter | word-wraps on spaces across rows in `staticText`; non-focusable (Tab skips); repaints the new text on signal change | AC-1 · PA-14 |
| **ST-04** | `Label` (03-02) | a `Label` `~N~ame` linked to an `Input`; focus the link, then not | `labelSelected` while the link is focused, `label` otherwise; the `N` in `labelShortcut`; a click or `Alt-N` focuses the link | AC-2 · PA-10 |
| **ST-05** | `Button` draw (03-03) | a `[ OK ]` button: default-unfocused, focused, disabled | block-glyph shadow `▄`/`█`/`▀`; `buttonDefault` when default-unfocused, `buttonFocused` when focused, `buttonDisabled` when disabled; the `O` in `buttonShortcut` | AC-3 · PA-5/PA-8 |
| **ST-06** | `Button` activate (03-03) | click / `Space`(focused) / `Alt-O` / `Enter`(default, unconsumed) / disabled | each of click/Space/Alt-O emits `command` + calls `onClick`; a `default` button also activates on `Enter` when unconsumed; a non-default button ignores `Enter`; a `disabled` button never activates (no emit) | AC-3 · PA-1/PA-7 |
| **ST-07** | Validators (03-04) | `filter('0-9')`, `range(0,100)`, `lookup(['red'])` | `filter.isValidInput('5')`=T, `('a')`=F; `range.isValidInput('1')`=T, `('-')`=T, `.isValid('150')`=F, `('50')`=T; `lookup.isValidInput('x')`=T, `.isValid('blue')`=F, `('red')`=T | AC-5 · PA-12 |
| **ST-08** | `Input` edit (03-05) | type into an `Input` bound to a signal, with `maxLength` | inserts at the cursor + writes the bound `value`; Backspace/Delete/Home/End/←/→ behave; `maxLength` caps; focused ⇒ `inputSelected` | AC-4 · PA-11 |
| **ST-09** | `Input` validate+scroll (03-05) | a `filter('0-9')` Input; type a letter; overflow the field; focus away with an invalid `range` | the letter is rejected live (value unchanged); overflow scrolls with `◄`/`►` (`inputArrows`); `valid()` runs the blocking validator + sets `invalid`; Tab still moves (no focus-trap) | AC-5 · PA-2 |
| **ST-10** | `CheckGroup` (03-06) | a 2-item `CheckGroup` bound to `Signal<boolean[]>`; `Space` on item 0; click item 1 | ` [ ] `/` [X] ` per the bound array; `Space` toggles the focused item, a click toggles the clicked row; the bound array reflects toggles; focused item `clusterSelected` | AC-6 · PA-3 |
| **ST-11** | `RadioGroup` (03-06) | a 3-item `RadioGroup` bound to `Signal<number>`; `↓` then select | ` ( ) `/` (•) ` (narrow marker) per the index; `↓` moves selection, choosing one clears the others, the bound index reflects the choice; hotkey in `clusterShortcut` | AC-7 · PA-3/PA-9 |
| **ST-12** | Focus traversal | a form `Text`,`Input`,`CheckGroup`,`RadioGroup`,`Button`; Tab/Shift-Tab | focus cycles `Input`→`CheckGroup`→`RadioGroup`→`Button` (skipping `Text`); the focused control shows its `…Selected` role | AC-8 |
| **ST-13** | Packaging | the built package | controls live in `src/controls/` with explicit named re-exports from `src/index.ts`; `yarn check:deps` passes (zero runtime deps); each control file ≤ 500 lines | AC-11 · PA-4 |
| **ST-14** | Demo (03-07) | `demo:controls` headless | exit 0, non-empty stdout containing the Label/Button text, `[X]`/`(•)` markers, field glyphs, and a narration proving the `filter` live-reject + the `'ok'` emit | AC-12 · PA-13 |
| **ST-15** | Deferred registered | `requirements/DEFERRED.md` | names `Input` selection+clipboard, `picture`/mask validator, `MultiCheckGroup` (→ RD-07), the modal focus-trap + multi-column cluster (→ RD-11/later), each with a target | AC-13 · PA-2/PA-6 |
| **ST-16** | No regression | the existing golden/spec suites | the `1caa188` drawing + RD-05/RD-10 oracles still pass after the additive theme roles + `ev.emit` envelope change | RD-06 AC |

> **AUTHORING RULE:** the theme-role expectations (ST-02) are computed from `app.h` directly during spec
> authoring (read the source, decode `cpAppColor[cpGrayDialog[slot]]`); the glyph/column expectations
> (ST-03…ST-11) from the cited TV `t*.cpp` geometry — never from the implementation.

## Test files

| File | ST cases | Component |
|------|----------|-----------|
| `packages/core/test/color-palette-theme.spec.test.ts` (extend) | ST-02 | the control theme roles |
| `packages/ui/test/controls.foundation.{spec,impl}.test.ts` | ST-01 | `ev.emit` envelope |
| `packages/ui/test/controls.text-label.{spec,impl}.test.ts` | ST-03, ST-04 | `Text`/`Label` |
| `packages/ui/test/controls.button.{spec,impl}.test.ts` | ST-05, ST-06 | `Button` |
| `packages/ui/test/controls.validators.{spec,impl}.test.ts` | ST-07 | validators |
| `packages/ui/test/controls.input.{spec,impl}.test.ts` | ST-08, ST-09 | `Input` |
| `packages/ui/test/controls.cluster.{spec,impl}.test.ts` | ST-10, ST-11 | `CheckGroup`/`RadioGroup` |
| `packages/ui/test/controls.focus.spec.test.ts` | ST-12 | Tab traversal |
| `packages/ui/test/controls.packaging.spec.test.ts` | ST-13 | packaging |
| `packages/examples/test/controls-demo.e2e.test.ts` | ST-14 | demo e2e |
| `docs-presence`/register check (existing) | ST-15 | deferred registered |
| existing golden/spec suites (rerun) | ST-16 | no regression |

## Verification
- Per phase: `yarn workspace @jsvision/ui test controls.<component>` (+ `@jsvision/core test` for the
  theme roles) — RED before impl, GREEN after. **Rebuild core** (`yarn build`) before ui tests when the
  theme roles change (ui resolves `@jsvision/core` from `dist/`).
- Final gate: `yarn verify` (typecheck+build+test), `yarn check:deps`, `yarn lint`, `demo:controls` e2e.

## Verification Checklist
- [ ] ST-01…ST-16 defined with concrete I/O pairs, each traced to an AC/AR/PA
- [ ] Spec tests written + RED before implementation; theme bytes derived from `app.h`, geometry from `t*.cpp`
- [ ] Impl tests added after, per component (edge cases above)
- [ ] `yarn verify`/`check:deps`/`lint` clean; no regression in existing suites (ST-16)
