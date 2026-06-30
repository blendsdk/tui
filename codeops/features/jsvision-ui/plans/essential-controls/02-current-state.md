# Current State: Essential Controls + Validators

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

Grounded in three current-state recon passes (2026-06-30): the `@jsvision/ui` control-authoring seams,
the TV control geometry, and the TV validators + palette.

## Existing Implementation

### What exists (the spine the controls build on)
RD-01…RD-05 + RD-10 shipped. A new leaf control is an ordinary `View`/`Group` subclass — **no new
spine work**, only the additive `ev.emit` primitive (PA-1) + the core Theme roles (PA-5).

### Relevant files (seams to use / edit)

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `packages/ui/src/view/view.ts` | abstract `View`: `draw(ctx)`, `onEvent(ev)`, `focusable`, `state.{focused,disabled,visible}`, `bind()` (in `onMount`), `invalidate`/`invalidateLayout` | none — subclass it |
| `packages/ui/src/view/group.ts` | `Group`: `children`/`add`/`remove`, `background` | none — `Cluster` subclasses it for items? (single-column draws directly, no child views — see 03-06) |
| `packages/ui/src/view/draw-context.ts` | `DrawContext`: `text`/`fillRect`/`fill`/`box`/`shadow`/`color(role)→Style`/`role(name)→Theme[K]`/`size` | none — paint API |
| `packages/ui/src/view/types.ts` | `ViewState`, `DrawContext`, `ThemeRoleName=keyof Theme`, `DispatchEvent`/`AppEvent`/`CommandEvent` | **add `emit(command, arg?)` to `DispatchEvent`** (PA-1) |
| `packages/ui/src/event/dispatch.ts` | 3-phase dispatch; `RouteContext` (`:31`) carries `emitCommand`; built-in Tab (`:103-109`); focus-on-click (`hit-test.ts:146`) | **populate `ev.emit` from `RouteContext.emitCommand`** when building the envelope (PA-1) |
| `packages/ui/src/event/focus.ts` | `isFocusable = visible && !disabled && focusable && noBlockingAncestor` (`:54`); Tab wrap | none — controls set `focusable = true` |
| `packages/ui/src/event/commands.ts` | `CommandRegistry.emit/enable/isEnabled` | none — reached via `ev.emit` |
| `packages/core/src/engine/color/theme.ts` | `Theme`/`defaultTheme`; has `button`(`0x20` black/green), `buttonFocused`(`0x2F` white/green), `dialog`, `statusBar`, etc. | **add the new control roles** (PA-5); reuse `button`/`buttonFocused` |
| `packages/ui/src/index.ts` | explicit named re-exports per subsystem | **add `controls/` re-exports** (PA-4) |
| `packages/examples/` | `demo:*` headless walkthroughs + e2e | **add `controls-demo/` + its e2e** (PA-13) |

### Code analysis — the authoring idiom (reference: `window.ts`/`statusline.ts`/`menubar.ts`)
```ts
export class MyControl extends View {     // or Group for child-holding
  focusable = true;                        // interactive ⇒ Tab order
  override draw(ctx: DrawContext): void {  // paint via ctx; pick role by this.state.focused/disabled
    const style = this.state.focused ? ctx.color('buttonFocused') : ctx.color('button');
    ctx.fillRect(0, 0, ctx.size.width, ctx.size.height, ' ', style);
  }
  override onEvent(ev: DispatchEvent): void {
    const inner = ev.event;
    if (inner.type === 'key' && /* Space */) { ev.emit?.(this.command); ev.handled = true; } // PA-1
    if (inner.type === 'mouse' && ev.local) { /* hit-test via ev.local */ }
  }
  constructor() { super(); this.onMount(() => this.bind(() => this.value())); } // reactive repaint
}
```

### The TV sources (the drawing oracle — fidelity directive)

| Control | TV source (cited in component docs) | Key geometry |
|---------|-------------------------------------|--------------|
| `Text` | `tstatict.cpp:44-105` | word-wrap on spaces, fill `size.y` rows |
| `Label` | `tlabel.cpp:45-108` | 1 line, `~hotkey~` via `moveCStr`, `focusLink` on click/hotkey, highlight on link-focus |
| `Button` | `tbutton.cpp:66-275` + `tvtext1.cpp` | `[ text ]`, shadow `▄`(0xDC)/`█`(0xDB)/`▀`(0xDF), default markers, 100ms press, Space/hotkey/Enter-default |
| `Input` | `tinputli.cpp:86-468` + `tvtext1.cpp:106-107` | 1 line, `►`(0x10)/`◄`(0x11) edge arrows, `firstPos` scroll, cursor; selection (deferred) |
| `Cluster`/`Check`/`Radio` | `tcluster.cpp:87-396`, `tcheckbo.cpp:18-31`, `tradiobu.cpp:18-42` | 5-cell box ` [X] `/` (•) ` + label; `↑↓`/Space/hotkey; check=bitmask, radio=index |
| Validators | `tvalidat.cpp:639-807`, `validate.h` | `isValidInput` (transient) vs `isValid` (blocking); filter/range/lookup |

### The palette (PA-5 — verified)
`cpAppColor` master at `app.h:142`; `cpGrayDialog` (`dialogs.h:80`) maps dialog slot → `cpAppColor` index.
Verified: StaticText slot 6 = `cpAppColor[0x25]` = `0x70` (black/lightGray); Button normal slot 10 =
`0x20` (black/green) = our existing `button`; Button selected slot 12 = `0x2F` (white/green) =
`buttonFocused`. The remaining role bytes are pinned **from source** in the theme spec test, not frozen
here (a recon hand-decode was wrong — proving the source-as-oracle rule).

## Gaps Identified

### Gap 1: leaf controls do not exist
**Current:** the spine + chrome exist; no form controls. **Required:** the six controls + validators.
**Fix:** the `controls/` subsystem (03-02…03-06).

### Gap 2: no command path for app-authored controls
**Current:** only chrome (menu/status) gets an injected emit seam; a `Button` in a user `Window` cannot
emit. **Required:** a focused control emits a typed command. **Fix:** the additive `ev.emit` primitive
(PA-1, 03-01).

### Gap 3: no control theme roles
**Current:** `Theme` has `button`/`buttonFocused`/`dialog` but no `input`/`label`/`cluster`/`staticText`
roles. **Required:** faithful `cpGrayDialog` roles. **Fix:** additive core roles (PA-5, 03-01).

## Dependencies

### Internal
- RD-01 signals (`bind`), RD-02 layout (reflow), RD-03 `View`/`Group`/`DrawContext`, RD-04 focus/commands/hit-test, RD-05 theme + `Window` host.

### External
- None (zero runtime deps).

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Theme byte decode wrong (palette indirection) | Med | High (fidelity) | Pin from `app.h` in the spec oracle; verify each against source (PA-5) |
| EA-ambiguous radio/marker glyph misaligns | Med | Med | Prefer unambiguous-narrow code points (PA-9), as with `[×]` |
| `ev.emit` primitive widens the event contract | Low | Med | Additive optional field, intra-ui; mirrors RD-05 seam pattern; no loop re-shape |
| `Input` scope creep (selection/clipboard) | Low | Med | Lean set pinned (PA-11); selection deferred + registered (DEFERRED.md) |
| Cluster geometry drift from TV | Med | Med | Port the 5-cell box + spacing from `tcluster.cpp`; spec oracle asserts glyph columns |
