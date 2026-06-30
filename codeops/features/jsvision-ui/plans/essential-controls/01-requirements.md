# Requirements: Essential Controls + Validators

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-06](../../requirements/RD-06-essential-controls.md)

## Feature Overview

Six leaf controls + a validator model on the `@jsvision/ui` spine, each replicated from its Turbo Vision
counterpart. The controls draw via `DrawContext`, handle input via `onEvent`, bind values to RD-01
signals, and theme via the faithful `cpGrayDialog` roles. See [00-index](00-index.md) for the overview.

## Functional Requirements

### Must Have
- [ ] **`Text`** — non-focusable static label; string or reactive getter; word-wrap on spaces, left-aligned (PA-14); `staticText` role. (RD-06 AC-1)
- [ ] **`Label`** — single-line `~hotkey~` text linked to a control; click/hotkey focuses the link; paints `labelSelected` while the link is focused; hotkey in `labelShortcut`. (AC-2, PA-10)
- [ ] **`Button`** — `[ text ]` + block-glyph drop-shadow; activates on click / `Space` / `Alt-hotkey`; a `default` button activates on `Enter` if unconsumed (PA-7); emits a typed `command` via `ev.emit` and/or calls `onClick`; `disabled` greys + is inert; roles `buttonNormal`/`buttonDefault`/`buttonSelected`/`buttonDisabled`/`buttonShortcut`. (AC-3, PA-1/PA-7/PA-8)
- [ ] **`Input`** — lean single-line editor: cursor, `firstPos` horizontal scroll, `◄`/`►` edge arrows, `maxLength`, two-way `value: Signal<string>`, a validator hook; `inputNormal`/`inputSelected`/`inputArrows`. (AC-4, PA-11)
- [ ] **Validators** — `filter(chars)` (live reject), `range(min,max)` (digit-filter live + range on completion), `lookup(list)` (membership on completion); the `{isValidInput, isValid, error?}` shape; `Input.valid()` exposes the blocking check + an `invalid` state (no focus-trap). (AC-5, PA-2/PA-12)
- [ ] **`CheckGroup`** — single-column `[ ]`/`[X]` items bound to `Signal<boolean[]>`; `Space`/click toggles the focused/clicked row; `clusterNormal`/`clusterSelected`/`clusterShortcut`/`clusterDisabled`. (AC-6, PA-3/PA-6)
- [ ] **`RadioGroup`** — single-column `( )`/`(•)` items bound to `Signal<number>` (selectedIndex); `↑↓` move, exclusive selection. (AC-7, PA-3/PA-6/PA-9)
- [ ] **Focus traversal** — `Tab`/`Shift-Tab` cycle `Input`→`CheckGroup`→`RadioGroup`→`Button` (skipping `Text`); the focused control shows its `…Selected` role. (AC-8, reuse RD-04)
- [ ] **Theme roles** — the faithful `cpGrayDialog` control roles added to core `Theme`+`defaultTheme`; buttons reuse the existing `button`/`buttonFocused`. (AC-9, PA-5)
- [ ] **Faithful geometry** — glyphs/columns/markers/hit-zones match the TV source per the directive. (AC-10)
- [ ] **Packaging** — `packages/ui/src/controls/` subsystem, explicit named re-exports, zero runtime deps, files ≤ 500 lines. (AC-11, PA-4)
- [ ] **`demo:controls`** — a headless walkthrough exercising every control + a validator rejection. (AC-12, PA-13)
- [ ] **`ev.emit()` primitive** — the additive `emit(command, arg?)` on `DispatchEvent`, sourced from `RouteContext`. (PA-1)

### Should Have
- [ ] A trivial validator combinator (`all(...)`) only if it falls out cheaply — not required. (RD-06 Should-Have)

### Won't Have (Out of Scope) — see [`DEFERRED.md`](../../requirements/DEFERRED.md)
- `ScrollBar`/`Scroller`/`ListView`/`Dialog` → RD-11; `Input` selection+clipboard, `picture`/mask validator, `MultiCheckGroup` → RD-07; the modal **focus-trap** on invalid → RD-11 (PA-2); **multi-column** cluster layout → later (PA-6); `Text` center/right alignment → later (PA-14).

## Technical Requirements

### Performance
- Each control is an ordinary `View`; paints only its own cells; repaint coalesced via the existing scheduler (one frame per tick). No new perf surface; the 16 ms frame budget is unaffected.

### Compatibility
- Pure TS, ESM/NodeNext (`.js` specifiers), zero runtime deps (`check:deps` holds). Node ≥20. The one cross-package edit is additive (new `Theme` roles) — no breaking change.

### Security
- The sole input boundary is keystroke→buffer text. All writes go through `DrawContext`→`ScreenBuffer`+core `sanitize` (no raw escapes from typed text). Validators enforce allowlists (`filter` char-set, `range` bounds, `lookup` membership). `maxLength` bounds each field. (RD-06 Security)

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR/PA Ref |
|----------|--------------------|--------|-----------|-----------|
| Command emission | envelope `emit` / onClick-only / per-control seam | envelope `ev.emit()` | additive, TV-faithful, no per-control attach | PA-1 |
| Invalid focus-leave | trap / expose-`valid()`-no-trap | expose `valid()`+`invalid` | trap belongs to RD-11 Dialog; no focus-veto primitive now | PA-2 |
| Cluster value | `boolean[]`/`number` / bitmask | `boolean[]` / `number` | idiomatic reactive binding | PA-3 |
| Theme byte sourcing | source-pinned / agent-decode | source-pinned spec oracle | fidelity oracle; decode unreliable | PA-5 |
| Cluster columns | single / multi | single-column | RD scoped a column; multi deferred | PA-6 |
| Validator shape | object+factories / class tree | `{isValidInput,isValid,error?}` + factories | small typed units (component map) | PA-12 |

> **Traceability:** every decision references the Ambiguity Register (`00-ambiguity-register.md`); scope
> decisions inherit RD-06's AR-93…AR-102.

## Acceptance Criteria

Mirror RD-06 AC-1…AC-13 (the immutable oracles), realized as ST-01…ST-NN in
[07-testing-strategy.md](07-testing-strategy.md):
1. [ ] AC-1…AC-13 met (per-control draw/behavior + theme roles + packaging + demo + deferred-registered).
2. [ ] `yarn verify` (typecheck+build+test) green; `yarn check:deps`/`yarn lint` clean.
3. [ ] No regression in the existing `1caa188`/RD-05/RD-10 golden assertions.
4. [ ] Every control's geometry verified against its TV source (cited in JSDoc + commits).
