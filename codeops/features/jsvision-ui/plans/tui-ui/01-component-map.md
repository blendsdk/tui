# Turbo Vision → `tui-ui` Component Map (scope draft)

> **Status:** pre-requirements scoping artifact. Not a CodeOps plan yet — this exists to size
> the project before `make_requirements`/`make_plan`. Reference source: the modernized Turbo
> Vision checkout at `/home/gevik/workdir/github/tvision`.
>
> **Target model:** disciplined hybrid — retained widget tree (spine) + fine-grained signals
> (widget-attribute reactivity) + `Show`/`For` (structure) + `onX`/`command` (events) + named
> theme roles (color) + `View` subclass (escape hatch). Built on `@jsvision/core`.

## Disposition legend

| Mark | Meaning |
|------|---------|
| 🟢 **Core** | Tier 0 spine — must exist before anything else (framework, not a "widget") |
| 🔵 **Widget** | Reimagine as a control — Tier 1 (essential) or Tier 2 (high-value) |
| 🟡 **Defer** | Reimagine later — large/self-contained (Tier 3) |
| 🟣 **Relocate** | Belongs in a separate package (`@jsvision/files`), not core UI |
| ⚫ **Replaced** | Already provided by `core` or by the JS runtime/language |
| 🔴 **Drop** | DOS/C++ artifact with no modern analog — do not port |

Effort scale: **S** (days) · **M** (1–2 wk) · **L** (multi-week) · **XL** (the hard, risky pillars).

---

## 0. Platform layer — already replaced by `core`

Turbo Vision's entire `source/platform/` (~280 KB) is functionally redundant with the foundation.
**Nothing here is ported.**

| Turbo Vision | Replaced by (`core`) | Mark |
|---|---|---|
| `THardwareInfo`, `Platform`, console adapters (ncurses/win32/unix) | `createHost` + `RuntimeAdapter` | ⚫ |
| `DisplayBuffer` (row damage, FPS throttle) | `ScreenBuffer` + `serialize()` damage-diff | ⚫ |
| `termio`/`TermIO` escape & key decoding | input decoder (`decode`/`flush`/`createKeymap`) | ⚫ |
| `SignalHandler` (SIGWINCH), raw mode, alt-screen, restore | host lifecycle (`createHost`) | ⚫ |
| `colors.cpp` RGB→256→16 downsample, `TColorAttr`/`TColorRGB`/`TColorBIOS`/`TColorDesired`/`TAttrPair` | `encode`/`nearest256`/`nearest16`, `Attr`, color subsystem | ⚫ |
| `getColorCount`/screen-mode queries | `resolveCapabilities` | ⚫ |
| `TScreenCell`/`TCellChar`, `TText` width/measure | `Cell`, `charWidth` | ⚫ |
| `THWMouse` | input decoder mouse events | ⚫ |

---

## 1. Core view system → Tier 0 spine (🟢)

| Turbo Vision | Reimagined | Mark | Effort | Notes |
|---|---|---|---|---|
| `TView` | `View` | 🟢 | XL | Base retained node: bounds, state/options flags, focus, `draw(ctx)`/`onEvent(ev)`, `invalidate()`. Drop `TStreamable`. |
| `TGroup` | `Group` | 🟢 | XL | Owns children, Z-order, draw composition into parent buffer, focus chain, lock/unlock batching. |
| `TPoint`/`TRect` | `Point`/`Rect` | 🟢 | S | Plain geometry. Keep half-open-interval semantics. |
| `TDrawBuffer` + `writeView`/`writeLine` | `DrawContext` | 🟢 | M | The paint API handed to `draw()`. Wraps writes into the parent buffer → `ScreenBuffer`. `ctx.text/fill/color()`. |
| `TPalette` + `mapColor` chain | named theme roles | 🟢 | S | Replace palette-index recursion with `ctx.color('role')` over core `ThemeRole`/`defaultTheme`. |
| `growMode` (anchor edges) | layout primitive | 🟢 | — | Kept as the low-level anchor under the layout engine (below). |
| `exposed()` / clip | retained internals | 🟢 | M | Cover-detection + clipping during composition. |
| `phaseType` (pre/focus/post) | dispatch phases | 🟢 | M | Keep the 3-phase event model — it's good middleware. |
| **(new — TV has none)** | **layout engine** `row`/`col`/`stack`/`grid` | 🟢 | **XL** | The single biggest gap. Pure-JS flexbox-ish (ADR-008). Kills TV's manual-coordinate pain. |
| **(new)** | **reactive core** `signal`/`computed`/`effect` + `Show`/`For` | 🟢 | **XL** | The hybrid's reactivity layer. Solid-style, no VDOM. |

## 2. Application framework & event loop → Tier 0 (🟢)

| Turbo Vision | Reimagined | Mark | Effort | Notes |
|---|---|---|---|---|
| `TProgram` + `TApplication` (MI chain) | `Application` | 🟢 | L | Composition, not inheritance. Owns desktop/menu/status, `run()`, `execView()`, `on(command)`. |
| event pump (`getEvent`/`waitForEvents`, blocking) | async event loop | 🟢 | L | Replace blocking poll with async pump fed by host input stream. |
| `TEvent`/`MouseEventType`/`KeyDownEvent`/`MessageEvent` | `InputEvent` (typed union) | 🟢 | S | Reuse core decoded events; add command/broadcast variants. |
| `TCommandSet` + `cm*` codes + `enable/disableCommand` | typed `command` strings + `app.commands` | 🟢 | M | String/const commands, no 256-bit bitmap; enable/disable still useful. |
| `message()` / `evBroadcast` | internal dispatch / bus | 🟢 | S | Keep broadcast for cross-view signals; type it. |
| `TTimerQueue` / `idle()` | async timers | 🟢 | S | `setInterval`/`setTimeout` on the loop; `onIdle` hook. |
| `execView`/`endModal` (recursive modal loop) | `await app.execView(dialog)` | 🟢 | M | Async-native modality returning a typed result. |
| `TDeskTop` (cascade/tile) | `Desktop` | 🟢 | M | Retained window manager: overlap, z-order, focus-on-click, drag, cascade/tile. |
| `TBackground` | `Background` | 🟢 | S | Desktop fill pattern. |

## 3. Windows, frames, scrolling → Tier 0/1 (🟢🔵)

| Turbo Vision | Reimagined | Mark | Effort | Notes |
|---|---|---|---|---|
| `TWindow` | `Window` | 🟢 | M | Frame + title + number + move/grow/zoom/close flags. |
| `TFrame` | `Frame` | 🟢 | S | Border/title/drag-resize chrome (internal to Window). |
| `TScrollBar` | `ScrollBar` | 🟢 | S | Terminal-intrinsic. |
| `TScroller` | `Scroller` | 🔵 | M | Scrollable viewport container. ("scrolling" you flagged.) |
| `TScrollGroup` | folded into `Scroller`/`Group` | 🔵 | — | |
| `TListViewer` | `ListView` (base) | 🔵 | M | Virtual scroll (render visible rows via `getText(i)`); base for lists. |

## 4. Essential controls → Tier 1 (🔵)

| Turbo Vision | Reimagined | Mark | Effort | Notes |
|---|---|---|---|---|
| `TStaticText` | `Text` | 🔵 | S | Content slot accepts value or getter. |
| `TParamText` | `Text` (format variant) | 🔵 | S | Just a formatted `Text`; no separate class needed. |
| `TLabel` | `Label` | 🔵 | S | Text + focus-link + hotkey to a control. |
| `TButton` | `Button` | 🔵 | S | `onClick` / `command` / `default`. |
| `TInputLine` | `Input` | 🔵 | M | Single-line edit, selection, clipboard; two-way signal `value`. |
| `TCluster` (base) | `Cluster` (internal base) | 🔵 | S | Shared base for radio/check groups. |
| `TCheckBoxes` | `CheckGroup` | 🔵 | S | |
| `TRadioButtons` | `RadioGroup` | 🔵 | S | |
| `TMultiCheckBoxes` | `MultiCheckGroup` | 🔵 | S | Multi-bit states; lower priority. |
| `TListBox` | `ListView` (collection variant) | 🔵 | S | `ListView` bound to an items array/signal. |
| `TDialog` | `Dialog` | 🔵 | S | Modal/modeless container + standard palette; `execView` target. |

## 5. Menus & status bar → Tier 0 (🟢)

| Turbo Vision | Reimagined | Mark | Effort | Notes |
|---|---|---|---|---|
| `TMenuBar` | `MenuBar` + `menuBar([...])` builder | 🟢 | M | Declarative menu defs; typed commands; hotkeys. |
| `TMenuBox` / `TMenuView` | `MenuPopup` (internal) | 🟢 | M | Dropdown rendering + navigation. |
| `TMenuPopup` | `menuPopup()` | 🟢 | S | Standalone context menu. |
| `TMenu`/`TSubMenu`/`TMenuItem` | `subMenu()`/`item()`/`separator()` | 🟢 | S | Builder functions, not classes. |
| `TStatusLine` | `StatusLine` + `statusLine([...])` | 🟢 | S | Context-sensitive hints. |
| `TStatusDef`/`TStatusItem` | `statusItem()` (+ context ranges) | 🟢 | S | |

## 6. High-value controls → Tier 2 (🔵)

| Turbo Vision | Reimagined | Mark | Effort | Notes |
|---|---|---|---|---|
| `THistory`/`THistoryWindow`/`THistoryViewer` | `History` (Input add-on) | 🔵 | M | Dropdown history for `Input`. |
| `TSortedListBox` | `ListView` (sorted + type-ahead) | 🔵 | S | Option on `ListView`, not a new class. |
| `TOutlineViewer`/`TOutline`/`TNode` | `Tree` | 🔵 | M | Expand/collapse tree; intrinsic & useful. |
| **(new — TV fork lacks it)** | `ComboBox` | 🔵 | M | `Input` + `ListView` dropdown. Expected by modern DX. |
| **(new — not in fork)** | `ProgressBar` / `Spinner` | 🔵 | S | Standard modern feedback widgets. |
| **(new)** | `Tabs` | 🔵 | M | Common modern layout; TV had none. |
| **(new)** | `Table`/`DataGrid` | 🔵 | L | TV only had columned `ListViewer`; a real table is high-value. |

## 7. Validators → Tier 2, small module (🔵)

`TValidator` family → composable validator functions/objects attachable to `Input`.
Reframe from class hierarchy to small typed units. (Forms — `tvforms` clone — depend on these.)

| Turbo Vision | Reimagined | Mark | Effort |
|---|---|---|---|
| `TValidator` (base) | `Validator` type | 🔵 | S |
| `TFilterValidator` | `filter(chars)` | 🔵 | S |
| `TRangeValidator` | `range(min,max)` | 🔵 | S |
| `TPXPictureValidator` | `picture(mask)` | 🔵 | M |
| `TLookupValidator`/`TStringLookupValidator` | `lookup(list)` | 🔵 | S |

## 8. Editors & text views → Tier 3 (🟡)

Large, self-contained; explicitly out of v1. ("edit window" you flagged.)

| Turbo Vision | Reimagined | Mark | Effort | Notes |
|---|---|---|---|---|
| `TEditor` | `Editor` | 🟡 | **XL** | Gap-buffer multiline editor, undo, search; as big as the rest combined. |
| `TMemo` | `Memo` | 🟡 | M | In-memory editor for dialogs (needs `Editor`). |
| `TIndicator` | `Indicator` | 🟡 | S | Line/col + modified badge. |
| `TEditWindow` | `EditWindow` | 🟡 | S | Window wrapper around `Editor`. |
| `TFileEditor` | (core) `Editor` + (relocate) file binding | 🟡🟣 | M | Editor core stays; disk I/O moves to `tui-files`. |
| `TTextDevice`/`TTerminal` | `LogView`/`Terminal` | 🟡 | M | Streaming/scrollback output sink. |

## 9. File-system components → Relocate to `@jsvision/files` (🟣)

These drag in fs/path concerns the core engine deliberately avoids. Separate package.

| Turbo Vision | Reimagined | Mark |
|---|---|---|
| `TFileDialog` | `FileDialog` | 🟣 |
| `TFileList` | `FileList` | 🟣 |
| `TFileInputLine` | `FileInput` | 🟣 |
| `TFileInfoPane` | `FileInfoPane` | 🟣 |
| `TDirListBox` | `DirList` | 🟣 |
| `TChDirDialog` | `ChDirDialog` | 🟣 |
| `TFileCollection`/`TDirCollection`/`TSearchRec` | plain arrays + `fs` types | 🟣 |

## 10. Color-picker family → Tier 3 / optional (🟡)

Niche (a palette editor). Build only if a theming UI is wanted.

`TColorDialog`, `TColorSelector`, `TMonoSelector`, `TColorDisplay`, `TColorGroupList`,
`TColorItemList`, `TColorGroup`/`TColorItem` → `ColorDialog` + internals. 🟡 (L)

## 11. Help system → Tier 3 / optional (🟡)

File-based hypertext help — historically important, low modern demand.

`THelpFile`, `THelpViewer`, `THelpWindow`, `THelpTopic`, `THelpIndex`, `TParagraph`,
`TCrossRef` → `Help*`. 🟡 (L). Replace the streamable `.hlp` format with JSON/Markdown topics.

## 12. Graphics surfaces → Tier 2/3 (🔵🟡)

| Turbo Vision | Reimagined | Mark | Notes |
|---|---|---|---|
| `TDrawSurface` | `Surface` | 🔵 | Offscreen cell buffer (handy for custom widgets). |
| `TSurfaceView` | `SurfaceView` | 🟡 | Viewport onto a `Surface`. |

## 13. Infrastructure to DROP / replace (🔴⚫)

| Turbo Vision | Disposition | Why |
|---|---|---|
| `TObject` | 🔴 Drop | No universal base needed in TS. |
| `TStreamable`, `TStreamableClass`, `TStreamableTypes` | 🔴 Drop | DOS resource-file persistence woven into every view. The single biggest "do not port." |
| `pstream`/`ipstream`/`opstream`/`iopstream`/`fpbase`/`if/ofpstream`/`fpstream` | 🔴 Drop | Binary serialization framework. Use JSON + explicit `toJSON()` for the rare persist case. |
| `TPWrittenObjects`/`TPReadObjects`/`fLink` | 🔴 Drop | Streaming bookkeeping. |
| `TCollection`/`TSortedCollection`/`TNSCollection`/`TNSSortedCollection`/`TStringCollection`/`TResourceCollection` | ⚫ Replaced | Native `Array`/`Map`/`.sort()`. |
| `TResourceFile`/`TResourceItem`/`TStringList`/`TStrListMaker`/`TStrIndexRec` | 🔴 Drop | Resource files → ES modules / i18n map. |
| `TVMemMgr`/`TBufListEntry` | 🔴 Drop | GC makes the safety pool meaningless. |
| `TColorAttr`/`TColorRGB`/`TColorBIOS`/`TColorDesired`/`TAttrPair`/`TScreenCell`/`TCellChar`/`TText` | ⚫ Replaced | core color + render subsystems. |

---

## Scope summary

**Disposition counts (concrete classes, approximate):**

| Mark | Count (approx) | What |
|---|---|---|
| ⚫ Replaced by core/runtime | ~20 | platform layer, color/cell/text, collections |
| 🔴 Drop | ~18 | streaming, resources, memmgr, TObject |
| 🟢 Core (Tier 0) | ~22 | view/group/app/event/menu/window/scroll + **2 new pillars** (layout, reactive core) |
| 🔵 Widget (Tier 1+2) | ~22 | controls, validators, tree, + **new**: ComboBox/Tabs/Table/Progress |
| 🟡 Defer (Tier 3) | ~13 | editor family, help, color picker, surfaces |
| 🟣 Relocate (`tui-files`) | ~7 | file dialogs/lists |

**Phased roadmap (gated by demos as the acceptance oracle):**

- **Phase 0 — Spine.** View/Group/DrawContext, async event loop, focus, modality, theming, Window/Frame/ScrollBar, Desktop, **layout engine**, **reactive core**. *Demo target: a blank windowed desktop + menu/status.* ← contains both XL pillars; this is the make-or-break phase.
- **Phase 1 — Essential controls.** Text/Label/Button/Input/Check/Radio/ListView/Dialog/Menu/Status. *Demo targets: `mmenu`, `palette`, `tvforms` (with validators).*
- **Phase 2 — High-value.** History/Tree/ComboBox/Tabs/Table/Progress/Surface. *Demo target: **clone `tvdemo`** (calculator, calendar, ASCII table, puzzle, event viewer) — the headline fidelity proof.*
- **Phase 3 — Heavy.** Editor family → *clone `tvedit`*; then optional Help / ColorDialog.
- **Phase R — Files.** `@jsvision/files` package → *clone `tvdir`*.

**The XL risk items (where the project lives or dies):**
1. **Layout engine** — TV gives nothing to copy; gates every widget API. (ADR-008.)
2. **Reactive core** — signals + `Show`/`For` + view-level invalidation discipline.
3. **`Editor`** — gap buffer; defer, but plan for it as a self-contained module.
4. **Focus / modality / mouse-hit-testing correctness** in composed, clipped, scrolled, overlapping views — where TV has 30 years of bug-fixes to mine as the oracle.

**North-star metric:** clone `tvdemo` in a fraction of its C++ line count. If a port is verbose, that's a DX bug, not an accepted cost.
