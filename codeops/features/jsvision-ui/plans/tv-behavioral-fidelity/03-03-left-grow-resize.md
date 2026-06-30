# 03-03 — Left-grow resize gesture

> **Parent**: [Index](00-index.md) · Implements RD-10 AR-91 · PA-7 · TV `tframe.cpp` `dmDragGrowLeft`
> **CodeOps Skills Version**: 3.1.0

Make the already-drawn bottom-left grip `└─` functional: dragging it moves the window's **left + bottom**
edges while the **right** edge stays anchored, floored at 10×3. Mirrors the existing SE-corner resize but
anchors the opposite corner.

## A. Gesture (`ui/src/desktop/gestures.ts` — PA-7)

```ts
export type Gesture =
  | { kind: 'move'; target: Window; grabDX: number; grabDY: number }
  | { kind: 'resize'; target: Window; originX: number; originY: number }       // SE — anchor top-left
  | { kind: 'resize-left'; target: Window; anchorRight: number; originY: number }; // SW — anchor right edge + top

export function applyResizeLeft(g: Extract<Gesture, { kind: 'resize-left' }>, local: Point): void {
  const rect = rectOf(g.target);
  // Right edge fixed at anchorRight (inclusive). New left = pointer x, clamped so width ≥ MIN_WIDTH.
  const x = clamp(local.x, /*lo*/ Math.min(rect.x, g.anchorRight - MIN_WIDTH + 1), /*hi*/ g.anchorRight - MIN_WIDTH + 1);
  const width = g.anchorRight - x + 1;
  const height = Math.max(MIN_HEIGHT, local.y - g.originY + 1);
  g.target.layout.rect = { x, y: rect.y, width, height };
  g.target.invalidateLayout();
}
```

- `anchorRight = rect.x + rect.width − 1` (the fixed right column); `originY = rect.y` (top fixed, bottom grows).
- Width grows as the pointer moves left (x decreases); floored at `MIN_WIDTH`. Height as the SE resize.
- `x` clamp lower bound keeps the window reachable (left edge may go to 0 / negative like the move clamp;
  keep it ≥ a small bound consistent with `applyMove`'s `1 - width` reachability — finalize the exact lower
  clamp in impl against the move-clamp convention).

## B. Frame hit-zone (`ui/src/window/frame.ts`)

```ts
export type FrameZone = 'close' | 'zoom' | 'resize' | 'resize-left' | 'title' | 'interior' | 'border';

// in frameZoneAt, before the SE check:
if (flags.resizable && y === h - 1 && x <= 1) return 'resize-left';   // bottom-left grip cells (0,1)
if (flags.resizable && x === w - 1 && y === h - 1) return 'resize';   // SE corner (unchanged)
```

The grip is only drawn on an active resizable window; the zone is gated on `flags.resizable` so a
non-resizable window's bottom-left falls through to `border` as before. Update the `frame.ts` JSDoc note
(the "left grip is drawn but not wired" caveat is removed).

## C. Window + Desktop wiring

`window/window.ts` `onEvent` — add the new zone:

```ts
else if (zone === 'resize' && this.resizable) this.manager.beginResize(this);
else if (zone === 'resize-left' && this.resizable) this.manager.beginResizeLeft(this);
```

`WindowManager` (`window.ts`) + `DesktopLoopSeam` interfaces gain `beginResizeLeft(w: Window): void`.

`desktop/desktop.ts`:

```ts
beginResizeLeft(w: Window): void {
  if (!w.resizable) return;
  const rect = w.layout.rect ?? { x: 0, y: 0, width: MIN_WIDTH, height: MIN_HEIGHT };
  this.gesture = { kind: 'resize-left', target: w, anchorRight: rect.x + rect.width - 1, originY: rect.y };
  this.loop?.setCapture(this);
}
// onEvent captured-move branch: dispatch by gesture.kind →
//   'move' → applyMove · 'resize' → applyResize · 'resize-left' → applyResizeLeft
```

## Acceptance (→ ST-07/ST-08)

- A drag from the bottom-left grip moves left+bottom edges, right edge fixed, floored at 10×3 (ST-07).
- `frameZoneAt` returns `resize-left` for the SW grip cells on a resizable window; `resize` for the SE
  corner; non-resizable ⇒ `border` (ST-08).
