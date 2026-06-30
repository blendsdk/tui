# Current State — TV Behavioral Fidelity

> **Parent**: [Index](00-index.md) · **CodeOps Skills Version**: 3.1.0

The exact current code each behavior changes (post-`1caa188`, all paths under `packages/`).

## 1. Status line (`ui/src/status/statusline.ts`)

- `StatusLine extends View`, `postProcess = true`. `StatusLoopSeam` = `{ emitCommand, isCommandEnabled }`
  (`statusline.ts:29-34`) — **no capture**. `attach(seam)` wires it (`statusline.ts:86-88`).
- `itemBoxes()` (`statusline.ts:90-100`) packs ` text ` spans: `{ item, x, textX:x+1, width:len+2 }`.
- `draw()` (`statusline.ts:103-119`) fills each span in `base`/`dim`, renders `tildeSegments` runs (red
  hotkey). **No pressed/selected state** — `statusSelected` does not exist.
- `onEvent()` (`statusline.ts:127-151`) emits the command **on mouse-down** (`kind==='down'`); there is
  no move/up handling, no pressed tracking, no capture.
- Wiring: `app/application.ts:173-178` calls `opts.statusLine.attach({ emitCommand, isCommandEnabled })`.
- The loop already exposes `setCapture(view)`/`releaseCapture()` (RD-05 AR-82), used by `Desktop`.

## 2. Cascade / tile (`ui/src/desktop/arrange.ts`)

- `cascade(windows, deskW, deskH)` (`arrange.ts:33-37`): size = `2/3` of the desktop (≥min); each window
  staggered `i*CASCADE_DCOL(=2)`, `i*CASCADE_DROW(=1)` — the AR-87 preset. **Not** extend-to-corner.
- `tile(windows, deskW, deskH)` (`arrange.ts:47-55`): `cols=ceil(sqrt(n))`, `rows=ceil(n/cols)`,
  `cellW=floor(deskW/cols)` / `cellH=floor(deskH/rows)` clamped to min — a floor-grid with a remainder
  strip; **n=2 ⇒ side-by-side**. **Not** TV's proportional dividers/leftOver; no `tileError`.
- `place(w,x,y,w,h)` (`arrange.ts:19-23`) un-zooms (`resetZoom`) + sets `layout.rect` + `invalidateLayout`.
- `Desktop.cascade()/tile()` (`desktop.ts:127-136`) call these then `invalidateLayout()`.
- TV source (the target): `tdesktop.cpp` — `doCascade` (`:67-78`), `iSqr`/`mostEqualDivisors` (`:55-78`/
  `mostEqualDivisors`), `dividerLoc`/`calcTileRect`/`doTile` (`:171-214`), `tileColumnsFirst` default false.

## 3. Resize gesture (`ui/src/desktop/gestures.ts`, `window/frame.ts`, `window/window.ts`, `desktop/desktop.ts`)

- `Gesture` union (`gestures.ts:20-22`): `move` | `resize` (SE-corner, fixed top-left). `MIN_WIDTH=10`,
  `MIN_HEIGHT=3`. `applyResize` (`gestures.ts:58-64`): `width = max(min, pointerX − originX + 1)`,
  height likewise — anchors the **top-left**, grows bottom-right.
- `frame.ts` draws the bottom-left grip `└─` at cols 0-1 of the bottom row (active+resizable) but
  `frameZoneAt` (`frame.ts:152-168`) classifies only the **SE** corner (`x===w-1 && y===h-1`) as `resize`;
  the SW-grip cells fall through to `border` (documented note `frame.ts:155-157`). `FrameZone` lacks a
  left-resize value.
- `Window.onEvent` (`window.ts:128-149`) maps `zone==='resize'` → `manager.beginResize(this)`.
- `Desktop.beginResize(w)` (`desktop.ts:163-169`) records `{kind:'resize', originX, originY}` + captures.
  The captured move routes to `applyResize` (`desktop.ts:178-184`); `WindowManager`/`DesktopLoopSeam`
  expose `beginResize`/`setCapture` (`window.ts:31-34`, `desktop.ts:26-37`).

## 4. Theme (`core/src/engine/color/theme.ts`)

- `Theme` + `defaultTheme` carry `statusBar = { fg black, bg lightGray, hotkey red }` but **no**
  `statusSelected` (it was added then reverted in `1caa188` because nothing consumed it yet). `Color`
  is imported; `ThemeRole = {fg,bg,hotkey?}`. `menuSelected = { fg black, bg green, hotkey red }` is the
  shape `statusSelected` mirrors.

## Tests that change

- `ui/test/app-shell.desktop.spec.test.ts` **ST-11** — asserts the AR-87 cascade (+2col/+1row) + tile
  (n=2 side-by-side). Rewritten to TV cascade/tile (PA-9).
- `ui/test/app-shell.status.{spec,impl}.test.ts` — assert emit-on-**down**. Rewritten to emit-on-release
  + pressed-highlight (PA-9).
- `core/test/*theme*` — add a `statusSelected` assertion (shape + encodes).
