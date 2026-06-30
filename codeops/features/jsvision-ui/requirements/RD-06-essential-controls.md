# RD-06: Essential Controls + Validators — Text · Label · Button · Input · CheckGroup · RadioGroup · Validators

> **Document**: RD-06-essential-controls.md
> **Status**: Draft
> **Created**: 2026-06-30
> **Project**: jsvision UI (`@jsvision/ui`)
> **Depends On**: RD-05 (App shell — done; Window/Frame, theme roles, `execView`), RD-04 (Event loop — done; focus chain, commands, keymap, hit-test), RD-03 (View/Group spine — done; `View`/`Group`, `DrawContext`, theming), RD-02/RD-01 (done), `@jsvision/core` (done; the additive control theme roles land here)
> **Siblings**: RD-11 (Containers, scrolling & lists — `ScrollBar`/`Scroller`/`ListView`/`Dialog`; **stubbed**, authored later) — see [RD-11](RD-11-containers-scrolling-lists.md)
> **CodeOps Skills Version**: 3.1.0

---

## Feature Overview

The first batch of **leaf controls** for `@jsvision/ui` — the interactive widgets a form is built
from — plus the **validator model** that constrains text entry. These are the Tier-1 "essential
controls" from the component map ([`../plans/tui-ui/01-component-map.md`](../plans/tui-ui/01-component-map.md) §4, §7),
reimagined from Borland Turbo Vision's `dialogs.h` family on the RD-03 view/group spine and the RD-04
event loop.

Per the user-approved **split** (AR-93), RD-06 is deliberately focused on the controls that draw and
edit a single value and can be demonstrated inside a plain `Window`; the **container/scrolling/list**
controls (`ScrollBar`, `Scroller`, `ListView`) and the rich `Dialog` move to the sibling **RD-11**
(stubbed now, authored once RD-06's control shape is settled — RD-11's `Dialog` hosts these controls).

The controls in scope (each replicated from its Turbo Vision counterpart per the **NON-NEGOTIABLE
TV-fidelity directive** — `magiblot/tvision` `source/tvision/t*.cpp`, palette map `dialogs.h:42-72`):

| Control | TV source | Role |
|---------|-----------|------|
| `Text` | `TStaticText` / `TParamText` | A static, non-focusable content label; value or getter; word-wrap. |
| `Label` | `TLabel` | A static text bound to a control: its `~hotkey~` focuses the linked control; highlights when the link is focused. |
| `Button` | `TButton` | A pushable command button: `onClick`/`command`, `default` (Enter), disabled, `~hotkey~`, the TV shadow. |
| `Input` | `TInputLine` | A single-line text editor: cursor, horizontal scroll-within-field, `maxLength`, a two-way `value` signal, and a validator hook. |
| `CheckGroup` | `TCheckBoxes` | A column of independent on/off checkboxes `[X]`, bound to a set/array of booleans. |
| `RadioGroup` | `TRadioButtons` | A column of mutually-exclusive radio buttons `( )`, bound to a selected-index signal. |
| *(internal)* `Cluster` | `TCluster` | The shared base for `CheckGroup`/`RadioGroup` (item layout, keyboard nav, hotkeys, hit-test). |
| **Validators** | `TValidator` family | Composable typed units attachable to `Input`: `filter(chars)`, `range(min,max)`, `lookup(list)`. |

**Behavior may extend TV** (reactive two-way binding, truecolor) but the **drawing/geometry must match
TV exactly** (the fidelity directive governs glyphs, columns, markers, and hit-zones).

---

## Functional Requirements

### Must Have

#### `Text` — static content label (TV `TStaticText`, AR-100)
- A non-focusable `View` rendering a string or a reactive getter (`() => string` / `Signal<string>`),
  repainting on change (RD-03 `bind`). Multi-line + word-wrap to the view width (TV `TStaticText::draw`
  wraps on spaces). Themed via the `staticText` role (AR-97). `TParamText` is a formatted `Text`, not a
  separate class (component map §4).

#### `Label` — focus-linking text (TV `TLabel`, AR-100/AR-103)
- A static text with a `~hotkey~` marker (AR-77 tilde convention) and a **link** to a target control;
  pressing the hotkey (or clicking the label) focuses the linked control. The label draws in
  `labelSelected` when its link is focused, else `labelNormal`; the hotkey char in `labelShortcut`
  (slots 7–9).

#### `Button` — command button (TV `TButton`, AR-102)
- A focusable button drawn as `[ Text ]` with the TV one-cell drop-shadow; activation emits a typed
  `command` (RD-04 registry) and/or calls an `onClick` callback. Flags: `default` (also activates on
  Enter when no other control consumes it), `disabled` (greyed, non-activatable), `~hotkey~`. State
  roles: `buttonNormal`/`buttonDefault`/`buttonSelected`(focused)/`buttonDisabled`/`buttonShortcut`
  (slots 10–14, AR-97). Mouse-down→press feedback→activate-on-release-if-still-over (TV `TButton::press`).

#### `Input` — single-line editor (TV `TInputLine`, AR-94/AR-100/AR-101)
- A focusable single-line text editor bound to a two-way `value: Signal<string>` (reads render, edits
  write back). Supports: insert/overwrite typing, Backspace/Delete, Home/End/←/→ cursor movement,
  **horizontal scroll-within-field** when the text exceeds the field width (TV draws the `◄`/`►` arrows
  in `inputArrows`, slot 21), and `maxLength`. Themed `inputNormal`/`inputSelected` (slots 19–20).
- **Validator hook:** an optional attached validator (below) gates input — a `filter` validator rejects
  disallowed keystrokes live; a blocking validator (`range`/`lookup`) is checked on focus-leave /
  explicit `valid()` (AR-101).
- **Deferred (tracked, AR-94/AR-99):** text **selection** + cut/copy/paste **clipboard** → RD-07.

#### `CheckGroup` / `RadioGroup` over `Cluster` (TV `TCheckBoxes`/`TRadioButtons`/`TCluster`, AR-96)
- `CheckGroup`: a vertical column of `[ ]`/`[X]` items bound to a set of booleans (independent toggles);
  Space toggles the focused item.
- `RadioGroup`: a vertical column of `( )`/`(•)` items bound to a `selectedIndex: Signal<number>`
  (mutually exclusive); ↑↓ move the selection.
- Shared internal `Cluster` base: item layout, ↑↓/Space keyboard nav, per-item `~hotkey~`, mouse
  hit-test per row, disabled items skipped. State roles `clusterNormal`/`clusterSelected`/
  `clusterShortcut`/`clusterDisabled` (slots 16–18, 31, AR-97).

#### Validators — composable typed units (TV `TValidator` family, AR-95/AR-101)
- A `Validator` is a typed unit attachable to `Input`. RD-06 ships the **core three**:
  - `filter(chars)` — `TFilterValidator`: allow only the given char set; rejects other keystrokes live.
  - `range(min, max)` — `TRangeValidator`: the entered number must lie in `[min, max]`; blocking.
  - `lookup(list)` — `TLookup`/`TStringLookupValidator`: the value must be one of `list`; blocking.
- Composition: an `Input` takes one validator (compose with a combinator if needed). Faithful to TV's
  `isValidInput` (transient, per-keystroke) vs `isValid`/`valid()` (blocking, on completion) split.
- **Deferred (tracked, AR-95/AR-99):** `picture(mask)` (`TPXPictureValidator`, the mask mini-DSL) → RD-07.

#### Theme roles — faithful `cpGrayDialog` control colors (AR-97)
- Add the control roles the RD-06 controls use to core `@jsvision/core` `Theme` + `defaultTheme`,
  decoded from TV's `cpGrayDialog` palette (`dialogs.h:42-72` slots → `cpAppColor`): `staticText` (6),
  `label`/`labelSelected`/`labelShortcut` (7–9), `buttonNormal`/`buttonDefault`/`buttonSelected`/
  `buttonDisabled`/`buttonShortcut` (10–14), `clusterNormal`/`clusterSelected`/`clusterShortcut`/
  `clusterDisabled` (16–18, 31), `inputNormal`/`inputSelected`/`inputArrows` (19–21). Additive,
  non-breaking — the same cross-package pattern as `windowInactive`/`statusSelected`. (ScrollBar 4–5 +
  ListViewer 26–29 roles → RD-11; History 22–25 → RD-07.)

#### Demo (AR-98)
- A headless `demo:controls` walkthrough (dispatch-driven, an ASCII frame per step, like `demo:view`/
  `demo:events`/`demo:shell`): a form in a `Window` with a `Label`+`Input` (a `filter`/`range`
  validator rejecting bad input), a `CheckGroup`, a `RadioGroup`, and a `Button` that emits a command —
  Tab focus traversal, validator rejection, toggle/select, and button activation each shown in a frame.

### Should Have

- A simple validator combinator (e.g. `all(...)`/`required`) if it falls out cheaply — not required.
- `default`-button Enter handling integrated with RD-04 command routing (likely Must in practice).

### Won't Have (Out of Scope) — and Deferred (tracked)

**Out of scope (this RD):**
- `ScrollBar`, `Scroller`, `ListView` (+ `ListBox` variant), `Dialog` → **RD-11** (sibling, stubbed).
- `History`, `Tree`, `ComboBox`, `Tabs`, `Table`, `Progress`, `Spinner` → RD-07 (high-value).
- Editor family, files dialogs → RD-08 / RD-09.

**Deferred (tracked) — explicit register so nothing is lost (AR-99):**

| Deferred item | From decision | Target RD | Rationale |
|---------------|---------------|-----------|-----------|
| `Input` text **selection** + cut/copy/paste **clipboard** | AR-94 | **RD-07** (control completions) | A self-contained add-on that does not reshape `Input`; keeps RD-06 focused. |
| `picture(mask)` validator (`TPXPictureValidator`) | AR-95 | **RD-07** | The mask mini-DSL is the M-effort item; the core three deliver most forms value. |
| `MultiCheckGroup` (`TMultiCheckBoxes`, multi-bit) | AR-96 | **RD-07** | Component map marks it lower-priority; Check+Radio cover ~all forms. |

> These three are mirrored in the roadmap note for RD-07 so they surface when RD-07 is drafted.

---

## Technical Requirements

### New subsystem (AR-102)
- `packages/ui/src/controls/` — a new subsystem with one barrel `index.ts`; per-control files
  (`text.ts`, `label.ts`, `button.ts`, `input.ts`, `cluster.ts` [+ `check-group.ts`/`radio-group.ts`]),
  validators under `controls/validators/` (`filter.ts`/`range.ts`/`lookup.ts` + `types.ts`). Each file
  ≤ 500 lines. **Explicit named re-exports** from `src/index.ts` (the layout-convention rule, AR-81).
- Pure TS, ESM/NodeNext (`.js` specifiers), zero runtime deps (`check:deps` holds).

### The one cross-package edit (AR-97)
- `@jsvision/core` `Theme` + `defaultTheme` gain the additive `cpGrayDialog` control roles listed above
  (decoded from `cpAppColor`; exact attribute bytes pinned at implementation per the fidelity directive).
  No other core change; the loop/spine are **not** re-shaped — controls are ordinary `View` subclasses.

### Reuse (no new primitives)
- Reactivity: RD-01 signals + RD-03 `bind`/`invalidate` for two-way binding + repaint (AR-100).
- Layout: RD-02 via the RD-03 reflow (controls report a natural size; clusters/inputs are fixed-height).
- Events/focus/commands: RD-04 `onEvent(DispatchEvent)`, the focus chain + Tab, the command registry +
  keymap, mouse hit-test. Buttons/inputs/clusters are `focusable`.
- Drawing: RD-03 `DrawContext` (`ctx.text`/`fillRect`/`role`); all writes through `ScreenBuffer`+`sanitize`.

---

## Integration Points

- **App shell (RD-05):** controls compose inside a `Window`/`Group`; `Button.command` flows through the
  same RD-04 registry the menu/status use; a future `Dialog` (RD-11) hosts these via `execView`.
- **Core theme (RD-05/core):** the additive control roles extend the same `Theme` the frame/menu/status
  read; `defaultTheme` stays the single source of truth.
- **Validators ↔ Input:** the validator is the only RD-06 seam an `Input` consumes; `picture`/selection
  land later without reshaping `Input` (AR-94/AR-95).

---

## Scope Decisions

All decisions trace to the Ambiguity Register (`00-ambiguity-register.md`):

- **AR-93** — split: RD-06 = leaf controls + validators; `ScrollBar`/`Scroller`/`ListView`/`Dialog` → RD-11 (stubbed).
- **AR-94** — `Input` lean (selection+clipboard deferred → RD-07).
- **AR-95** — validators: core three (`picture`/mask deferred → RD-07).
- **AR-96** — clusters: `CheckGroup`+`RadioGroup` (`MultiCheckGroup` deferred → RD-07).
- **AR-97** — faithful `cpGrayDialog` control roles added to core `Theme`.
- **AR-98** — headless `demo:controls` vehicle.
- **AR-99** — deferred items registered in the "Deferred (tracked)" table + roadmap note.
- **AR-100** — two-way signal binding · **AR-101** — TV transient-vs-blocking validator firing · **AR-102** — `src/controls/` subsystem.

> **Traceability:** AR-93…AR-99 are explicit user choices (RD-06 `add_requirement` interview,
> 2026-06-30); AR-100/AR-102 are single-dominant; AR-101 is source-determined (TV `TValidator` is the
> fidelity oracle).

---

## Security Considerations

> RD-06 adds **text-entry** widgets in the existing in-process TUI. No network, no persistence, no new
> untrusted external surface. The one input boundary is keystroke→buffer text:
- All control writes go through the RD-03 `DrawContext` → `ScreenBuffer` + the core `sanitize` injection
  boundary (no raw escape sequences reach the terminal from user-typed text).
- Validators enforce allowlists (`filter` char-set, `range` numeric bounds, `lookup` membership) —
  server-side-style input constraints at the entry point, per the coding standard.
- `maxLength` bounds the per-field buffer; no unbounded growth.

---

## Acceptance Criteria

Each AC is the immutable oracle a spec test will encode (TV `dialogs.h`/`t*.cpp` is the drawing oracle).

- **AC-1** (`Text`) — a `Text` bound to a getter renders the string, word-wraps to the view width, and
  repaints when the source signal changes; it is non-focusable (Tab skips it). Themed `staticText`. *(AR-100)*
- **AC-2** (`Label`) — a `Label` with `~F~ile` linked to a control: clicking the label or pressing its
  hotkey focuses the linked control; the label draws `labelSelected` when the link is focused, the
  hotkey in `labelShortcut`. *(AR-103/AR-97)*
- **AC-3** (`Button` draw/activate) — a `[ OK ]` button with a one-cell shadow emits its `command` (and
  calls `onClick`) on click and on Enter when `default`; a `disabled` button greys (`buttonDisabled`)
  and never activates; the focused button uses `buttonSelected`, a default button `buttonDefault`. *(AR-102/AR-97)*
- **AC-4** (`Input` edit) — typing inserts at the cursor, Backspace/Delete/Home/End/←/→ behave; text
  past the field width scrolls horizontally with the `◄`/`►` arrows (`inputArrows`); `maxLength` caps
  the value; the bound `value` signal reflects every edit (two-way). *(AR-94/AR-100)*
- **AC-5** (validators) — `filter('0-9')` rejects a letter keystroke live (value unchanged); `range(0,100)`
  reports invalid for `150` on focus-leave/`valid()` and valid for `50`; `lookup(['red','green'])`
  reports invalid for `'blue'`. The firing split is transient (filter) vs blocking (range/lookup). *(AR-95/AR-101)*
- **AC-6** (`CheckGroup`) — a 3-item `CheckGroup` bound to booleans: Space toggles the focused item, a
  click toggles the clicked row, the bound state reflects toggles, `[X]`/`[ ]` markers + `clusterSelected`
  on the focused row. *(AR-96)*
- **AC-7** (`RadioGroup`) — a 3-item `RadioGroup` bound to `selectedIndex`: ↑↓ move the selection,
  selecting one clears the others (`(•)`/`( )`), the bound index reflects the choice. *(AR-96)*
- **AC-8** (focus traversal) — Tab/Shift-Tab cycle focus across `Input`→`CheckGroup`→`RadioGroup`→`Button`
  (skipping `Text`); the focused control shows its `…Selected` role. *(RD-04 reuse)*
- **AC-9** (theme roles) — `defaultTheme` exposes the new control roles (`staticText`, `label*`,
  `button*`, `cluster*`, `input*`) with the `cpGrayDialog`-decoded colors; `encode()` of each does not
  throw; they are the only new core symbols. *(AR-97)*
- **AC-10** (faithful geometry) — each control's glyphs, columns, markers, and hit-zones match its TV
  source (`[ ]`/`( )`/`[X]`/`(•)`, the button shadow, the input arrows) — asserted against the buffer
  pre-`serialize`. *(fidelity directive)*
- **AC-11** (packaging) — controls live in `packages/ui/src/controls/` with explicit named re-exports;
  `yarn check:deps` passes (zero runtime deps); files ≤ 500 lines. *(AR-102)*
- **AC-12** (demo) — `demo:controls` runs headless, exercising Label+Input+validator+CheckGroup+
  RadioGroup+Button with an ASCII frame per step; its e2e asserts the narration + key glyphs. *(AR-98)*
- **AC-13** (deferred registered) — the "Deferred (tracked)" table names Input selection+clipboard,
  `picture`/mask validator, and `MultiCheckGroup`, each targeting RD-07; the roadmap note mirrors them. *(AR-99)*

---

> **Next step:** run the make_plan skill on RD-06 to produce the implementation plan (spec-first per
> control: spec oracles RED → implement → GREEN → impl tests), reading each control's TV source first
> per the fidelity directive; optionally preflight, then exec_plan. RD-11 (the sibling) is authored via
> a follow-up `add_requirement` once RD-06's control shape is settled.
