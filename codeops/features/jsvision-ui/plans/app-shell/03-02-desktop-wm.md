# Desktop Window Manager: App Shell

> **Document**: 03-02-desktop-wm.md
> **Parent**: [Index](00-index.md)

## Overview

`Desktop` is the full interactive window manager (AR-67): a `Group` whose children are its
windows in z-order (back-to-front, inheriting RD-03 AR-38), filling its area with the core
`desktop` role + pattern (AR-80), always the bottom layer. It implements raise-on-click (the
piece RD-04 deferred — AR-78), drag-move, free drag-resize, zoom, cascade/tile, and window
switching — all gesture geometry held on the desktop (PA-10) and driven through the loop's
pointer-capture seam (PA-5) so a gesture tracks the cursor past its affordance.

## Architecture

### Current Architecture
RD-04 routes a mouse-down to the top-most hit view and does focus-on-click, but **not** z-raise
(AR-50 named raise as the Desktop's job). Mouse events go only to the hit view (no capture/bubble).

### Proposed Changes
`Desktop extends Group`. It receives an injected loop seam (PA-7) `{ setCapture, releaseCapture,
emitCommand, isCommandEnabled, focusView }`. Raise reorders the child array; gestures use capture.
The desktop is a **post-process** view so it handles the WM `CommandEvent`s (`zoom/next/prev/
cascade/tile`) after the focused window had its chance (PA-12).

## Implementation Details

### New Types/Interfaces

```ts
import { Group } from '../view/index.js';
import type { View, DrawContext, DispatchEvent, Point } from '../view/index.js';
import type { Window } from '../window/index.js';

/** The narrow loop seam the Application injects (PA-7). */
export interface DesktopLoopSeam {
  setCapture(view: View): void;
  releaseCapture(): void;
  emitCommand(command: string, arg?: unknown): void;
  isCommandEnabled(command: string): boolean;
  focusView(view: View): void;
}

/** Active drag/resize gesture state (PA-10). */
type Gesture =
  | { kind: 'move'; target: Window; grabDX: number; grabDY: number }   // grab offset within the title
  | { kind: 'resize'; target: Window; originX: number; originY: number }; // window top-left, fixed
```

### New Functions/Methods

```ts
/** The window manager (AR-67). Child-array order is z-order; the desktop is the bottom layer. */
export class Desktop extends Group {
  postProcess = true;                              // handles WM CommandEvents (PA-12)

  /** Fill the desktop with the `desktop` role + its pattern glyph (AR-80 / PF-03). Overrides
   *  Group.draw (which space-fills) to read the role-only `pattern` via ctx.role (Phase 0). */
  draw(ctx: DrawContext): void;                    // ctx.fill(ctx.role('desktop').pattern, ctx.color('desktop'))

  /** @internal Wired by the Application after the loop exists (PA-7). */
  attachLoop(seam: DesktopLoopSeam): void;

  addWindow(w: Window): void;                      // append (top z) as a position:'absolute' child + mount under the desktop scope (PA-15)
  removeWindow(w: Window): void;                   // remove + dispose scope (AR-71); next becomes active
  raise(w: Window): void;                          // move w to end of children (top) + focusView(w) (AR-78)
  activeWindow(): Window | null;                   // the top-most focused window (AR-78)

  cascade(): void;                                 // un-zoom all; stagger +1row/+2col from top-left (PA-4)
  tile(): void;                                    // un-zoom all; grid fill, cells clamped to min (PA-4/AR-87)
  focusNextWindow(): void;                         // 'next' — cycle + raise (AR-67)
  focusPrevWindow(): void;                         // 'prev'
  focusWindowNumber(n: number): void;              // Alt-N — focus+raise the window whose number === n

  /** @internal Called by a Window's onEvent on a title/corner mouse-down to start a gesture (PA-10). */
  beginMove(w: Window, grabLocal: Point): void;    // setCapture(this); record grab offset
  beginResize(w: Window): void;                    // setCapture(this)
  onEvent(ev: DispatchEvent): void;                // captured move/up (gesture) + WM command handling
}
```

**Raise (AR-78):** `raise(w)` = `children.splice(indexOf w,1); children.push(w); seam.focusView(w)`. Since
child order is paint order, `w` now paints over its former coverers; `activeWindow()` returns the
top-most window that is on the focus chain. A `mouse-down` anywhere in a window triggers raise via the
Window's `onEvent` (which calls `desktop.raise(self)`); raise re-themes the two affected frames (active↔inactive, 03-03).

> **Window geometry is the `layout.rect`, not `bounds` (PF-01 / PA-15).** Windows are
> `position:'absolute'` children of the Desktop; the WM mutates each window's `layout.rect` and calls
> `invalidateLayout()`. RD-02's absolute placement (Phase 0) then re-honors that rect on every reflow
> — including a terminal resize — instead of the global flex pass clobbering it. After reflow,
> `window.bounds === window.layout.rect`.

**Drag-move (AR-67, PA-5/PA-10):** on a title mouse-down the Window calls `desktop.beginMove(self, local)`,
which records the grab offset and calls `seam.setCapture(desktop)`. While captured, every mouse event is
delivered to `desktop.onEvent` (target-local): a `move`/`drag` sets `target.layout.rect.{x,y}` to
`pointer - grab`, **clamped** so the title row stays on the desktop and ≥1 frame column stays inside (PA-4),
then `target.invalidateLayout()`; an `up` calls `seam.releaseCapture()`. One coalesced frame per event (AR-54).

**Free drag-resize (AR-74, PA-5/PA-10):** on an SE-corner mouse-down the Window calls `desktop.beginResize(self)`
→ `seam.setCapture(desktop)`. A `move`/`drag` sets `target.layout.rect.{width,height} = max(min, pointer - origin + 1)`
(min 10×3, PA-4) + `invalidateLayout()` (content reflows live); `up` releases.

**Zoom (AR-67):** `Window.zoom()` toggles: if restored, save `restoredRect = {...layout.rect}` and set
`layout.rect` to the desktop rect (maximized); if zoomed, restore `restoredRect`. `invalidateLayout()`.
Cascade/tile un-zoom first (AR-87).

**Cascade/Tile (AR-87/PA-4):** operate on non-modal visible windows; each window's `layout.rect` is set.
`cascade`: window *i* at `(i*1 row, i*2 col)` from the desktop top-left, each at a default size (e.g. 2/3 of
the desktop, ≥min). `tile`: choose a near-square grid (`cols=ceil(sqrt(n))`, `rows=ceil(n/cols)`), each cell
`floor(desktopW/cols) × floor(desktopH/rows)` **clamped to the min** (cells may extend past the edge per RD-02
overflow AR-28). `n===0` → no-op; `n===1` → fill.

**WM commands (PA-12):** `Desktop.onEvent` (post-process) handles `CommandEvent`s `zoom`(active window),
`next`/`prev`, `cascade`/`tile`. A command whose registry entry is disabled never reaches here (RD-04 drops it).

### Integration Points
- **Loop seam (PA-7):** `setCapture`/`releaseCapture` for gestures; `emitCommand`/`focusView` for switching.
- **Window (03-03):** `beginMove`/`beginResize` callers; `zoom()`/`close()`; `bounds`+`invalidateLayout()`.
- **RD-03 reflow:** `invalidateLayout()` re-insets window content (AR-32/33/74).
- **RD-04 hit-test:** routes the initial mouse-down to the top-most window/frame (AR-50); raise then reorders.

## Code Examples

### Example 1: Raise on click
```ts
desktop.addWindow(a); desktop.addWindow(b);        // b on top
// mouse-down inside a:
a.onEvent(downEnvelope);                            // → desktop.raise(a)
expect(desktop.children.at(-1)).toBe(a);           // a now top
expect(desktop.activeWindow()).toBe(a);
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|------------|-------------------|--------|
| Drag would move the window fully off-desktop | Clamp: title row stays visible, ≥1 frame column inside; never throws | PA-4 / AR-67 |
| Resize below the minimum | Clamp to 10×3 (PA-4) | AR-74 |
| Cascade/Tile with 0 windows | No-op | AR-87 |
| Tile cells smaller than min on a tiny desktop | Clamp cells to min (cells may overflow the desktop edge — RD-02 AR-28) | AR-87 |
| Cascade/Tile while a window is zoomed | Un-zoom the window first, then arrange | AR-87 |
| Alt-N for a number with no window | No-op (out-of-range = clamped no-op) | AR-67 |
| Gesture begins while a modal is active | The capture target is the desktop only when no modal owns input; a modal opening releases any active capture | PA-5 / AR-53 |

> **Traceability:** every strategy references its AR/PA entry in `00-ambiguity-register.md`.

## Testing Requirements
- Spec: ST-06 (background+z-order), ST-07 (raise), ST-08 (drag-move clamp), ST-09 (free-resize+reflow), ST-10 (zoom toggle), ST-11 (cascade/tile), ST-12 (next/prev/Alt-N), ST-13 (close→next active).
- Impl: clamp boundaries; tile grid math + cell-clamp; cascade stagger; un-zoom-before-arrange; gesture release on up; capture released when a modal opens.
