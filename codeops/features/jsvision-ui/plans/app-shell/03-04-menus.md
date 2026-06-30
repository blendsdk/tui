# Menus: App Shell

> **Document**: 03-04-menus.md
> **Parent**: [Index](00-index.md)

## Overview

The full nested-menu subsystem (AR-68): declarative builders produce a menu tree as plain data;
`MenuBar` (a top-row **pre-process** view) draws the titles and owns the navigation state machine
(PA-9); `MenuPopup`s are presentational dropdowns that mount into the app-root **overlay** layer
(PA-2) so they paint over windows and escape the 1-row MenuBar clip. Navigation: F10 / title click
/ Alt+hotkey open; ↑↓ move (skipping separators/disabled); Enter activates; ←→ switch top-level;
Esc closes one level; a `subMenu` item opens a nested child popup; an item's hotkey activates it.
Activating emits the item's `command` via the loop; a disabled command greys + is non-activatable.

## Architecture

### Current Architecture
RD-04 runs key events through the 3-phase sweeps (pre-process root→down first). `DrawContext` clips
a child to its parent rect — so a tall popup cannot be a MenuBar child. Menus are non-modal (PA-2),
distinct from `execView` capture.

### Proposed Changes
A `menu/` module: `builders.ts` (data), `menubar.ts` (`MenuBar` pre-process view), `popup.ts`
(`MenuPopup` presentational view), `controller.ts` (the navigation state machine the MenuBar owns).
Open popups mount into the injected `overlay` group (a `position:'absolute'` full-viewport layer —
Phase 0 / PA-15) at absolute `layout.rect`s; while a menu is open the MenuBar consumes navigation
keys in `onEvent` via `ev.handled` (PA-9). Opening saves focus; closing restores it.

**Click-outside close needs a catcher (PF-06/PA-19).** Mouse events do **not** flow through the
pre-process sweep — RD-04 routes a click to the single top-most hit view (`dispatch.ts:111-115`,
`hit-test.ts`), so the pre-process `MenuBar` never sees a click that lands on a window/desktop. To
close on an outside click, while a menu is open the controller mounts a **full-viewport transparent
catcher** view (`position:'absolute'`, full-viewport `rect`) as the overlay's **first** child (below
the popups, above everything else); its `onEvent` closes the whole menu on a mouse-down. A click
inside a popup hits the popup (it paints above the catcher); a click anywhere else hits the catcher.
The catcher is unmounted when the menu closes.

> **Overlay visibility is gated by menu state (PF-10).** Opening sets `overlay.state.visible = true`
> **before** mounting the catcher + first popup; closing the last level unmounts them and sets
> `overlay.state.visible = false`. An empty, always-visible full-viewport overlay would itself win
> the top-z hit-test and swallow every click (`hit-test.ts:55-67`); keeping it invisible (hence
> omitted from reflow + hit-test — `reflow.ts:43`, `hit-test.ts:50`) while no menu is open lets clicks
> reach the windows/desktop, while the catcher handles outside-clicks only when a menu is open.

## Implementation Details

### New Types/Interfaces

```ts
/** A node in the menu tree (plain data). */
export type MenuItem =
  | { kind: 'item'; title: string; command: string; key?: string }   // tilde ~X~ marks the hotkey (AR-77)
  | { kind: 'sub'; title: string; items: MenuItem[] }
  | { kind: 'separator' };

/** The open-menu navigation state (owned by MenuBar — PA-9). */
interface MenuNavState {
  openTop: number | null;            // index of the open top-level menu, or null (closed)
  path: number[];                    // highlighted index at each open level (nested popups)
  savedFocus: View | null;           // focus to restore on close
}
```

### New Functions/Methods

```ts
// Builders (declarative; tilde ~X~ marks the hotkey — AR-68, AR-77).
export function menuBar(items: MenuItem[]): MenuBar;
export function subMenu(title: string, items: MenuItem[]): MenuItem;       // { kind:'sub', … }
export function item(title: string, command: string, key?: string): MenuItem;
export function separator(): MenuItem;
```

```ts
/** The top-row menu bar (pre-process view, AR-68/AR-51) — draws titles, owns the nav state machine (PA-9). */
export class MenuBar extends View {
  preProcess = true;                                  // accelerators see events first (AR-51)
  /** @internal injected by the Application: the overlay group + the loop seam (PA-2/PA-7). */
  attach(overlay: Group, seam: MenuLoopSeam): void;
  draw(ctx: DrawContext): void;                       // titles with the ~hotkey~ char highlighted
  onEvent(ev: DispatchEvent): void;                   // F10 / Alt+hotkey / click open; ↑↓/Enter/←→/Esc nav
}

/** A presentational dropdown rendered from the controller's state (mounted into the overlay). */
export class MenuPopup extends View {
  draw(ctx: DrawContext): void;                       // item rows; highlighted row uses menuSelected; disabled greyed
}
```

**Navigation state machine (`MenuBar.onEvent`, PA-9):**
- **Open:** `F10` (open the first top-level, save focus); `Alt+<hotkey>` (open that top-level directly); a click on a title (hit-test lands on the MenuBar, map x→title). Opening mounts the top-level `MenuPopup` into the overlay positioned under its title.
- **Navigate (while open, consume via `ev.handled`):** `↑`/`↓` move the deepest level's highlight, skipping `separator` and disabled items; `Enter` activates the highlighted item; `←`/`→` switch the open top-level menu (wrap); `Esc` closes one level (the deepest popup; closing the last restores focus); a highlighted `sub` item (or `→`/`Enter` on it) opens a **nested** child popup at the next level; typing an item's hotkey activates it directly.
- **Activate:** `seam.emitCommand(item.command)` then close the whole menu + restore focus. If `seam.isCommandEnabled(item.command)` is false, the item is rendered greyed and Enter/hotkey is a no-op (AR-68).
- **Click outside / focus change:** the overlay catcher (above) receives the outside mouse-down and closes the menu, restoring focus (non-modal — PA-2 / PF-06).

**Enable/disable greying (AR-68):** each rendered item consults `seam.isCommandEnabled(item.command)`;
disabled → drawn in a dim style and non-activatable.

### Integration Points
- **Overlay (03-01, Phase 0):** the `position:'absolute'` full-viewport overlay; open popups + the click-catcher mount here (top-z) so they paint over windows (PA-2/PA-15/PF-06).
- **Loop seam (PA-7):** `emitCommand`/`isCommandEnabled` for activation/greying; `focusView` for save/restore.
- **RD-04 dispatch:** the MenuBar is pre-process, so it sees keys before the focused window and consumes them while open (AR-51). Alt+hotkey/F10 decode via core (verified `keys.ts`/`keymap.ts`).
- **Tilde convention (AR-77):** builders/`drawFrame`-style hotkey rendering parse `~X~` to find the accelerator char + its display column.

## Code Examples

### Example 1: Build + open the File menu
```ts
const bar = menuBar([
  subMenu('~F~ile', [ item('E~x~it', Commands.quit, 'Alt+X'), separator() ]),
]);
// F10 → opens File; Alt+F → opens File directly; ↓ highlights "Exit"; Enter → emitCommand('quit') + close
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|------------|-------------------|--------|
| ↑/↓ onto a separator or disabled item | Skip it (move to the next selectable) | AR-68 |
| Enter/hotkey on a disabled item | No-op (item greyed) | AR-68 |
| Esc with no open menu | No-op | AR-68 |
| Alt+hotkey with no matching title | No-op (key not consumed → falls through) | AR-68 |
| Click outside an open menu | The overlay catcher view (full-viewport, below popups) receives the mouse-down → close + restore focus (non-modal) | PA-2 / PF-06 |
| Menu label with escape bytes | Reaches the screen only via `DrawContext` → core `sanitize` | AR-68 |
| Popup taller/wider than the viewport | Clamp the popup origin so it stays on-screen (open upward/left if needed) | PA-2 |

> **Traceability:** every strategy references its AR/PA entry in `00-ambiguity-register.md`.

## Testing Requirements
- Spec: ST-16 (builders + F10/click/Alt+F open), ST-17 (nested nav: ↑↓ skip, Enter, ←→, Esc, sub-popup), ST-18 (command emit + enable/disable greying — shared with status).
- Impl: tilde parsing (`~F~ile` → accelerator 'f' at column 0); separator/disabled skipping; nested-path open/close; popup on-screen clamping; click-outside close + focus restore; pre-process consumption (key doesn't reach the focused window while open).
