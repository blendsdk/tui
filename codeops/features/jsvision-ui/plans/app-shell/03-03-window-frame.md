# Window & Frame: App Shell

> **Document**: 03-03-window-frame.md
> **Parent**: [Index](00-index.md)

## Overview

`Window` is a titled, framed, movable/resizable/zoomable/closable container (AR-67, AR-74): a
`Group` whose content children compose inside the frame's inset. `Frame` is a **Window-internal
drawing+geometry helper** (PA-8) — not a `View` subclass — that draws the border, centered title,
window number, close box `[■]`, zoom box `[↑]`/`[↓]`, and SE resize corner, and exposes hit-zone
geometry the `Window.onEvent` consults to map a mouse-down to move/resize/close/zoom. The active
(top-most focused) window is themed via the `window` role; background windows via the additive
`windowInactive` role (PA-1/AR-73).

## Architecture

### Current Architecture
RD-03 `Group` composites children back-to-front and can fill a background role. No window/frame
concept exists yet. Content inset is achievable via RD-02 layout `padding`.

### Proposed Changes
`Window extends Group` with layout `{ position:'absolute', padding: 1 }` — `position:'absolute'`
(Phase 0 / PA-15) makes it a free-floating Desktop child the WM positions via `layout.rect`, and
`padding: 1` insets content children inside the 1-cell border (PA-8). `Window.draw` first fills the
window background, then draws the frame chrome via the `Frame` helper (the role chosen by active
state). Content children paint over the interior (their inset rects never touch the border).
Hit-testing: a click on the border/title row lands on the window itself (content is inset, so it
doesn't cover the border) — `Window.onEvent` reads the frame helper's hit-zones to decide the action.

## Implementation Details

### New Types/Interfaces

```ts
import { Group } from '../view/index.js';
import type { DrawContext, DispatchEvent } from '../view/index.js';
import { signal } from '../reactive/index.js';
import type { Rect, LayoutProps } from '../layout/index.js';

/** A frame hit-zone — what a mouse-down at a window-local point means. */
export type FrameZone = 'close' | 'zoom' | 'resize' | 'title' | 'interior' | 'border';
```

```ts
/** A titled, framed container; children compose in the interior inset (AR-67, AR-74). */
export class Window extends Group {
  /** A window is a focus target so raise → focusView(w) works and activeWindow() resolves (PF-05). */
  focusable = true;
  /** Free-floating placement on the Desktop; the WM mutates `layout.rect` (PA-15 / PF-01). */
  layout: LayoutProps = { position: 'absolute', padding: 1 };
  /** Reactive title shown centered in the top border (bind → repaint). */
  readonly title: Signal<string>;
  /** 1–9, shown in the frame for Alt-N; undefined = no accelerator. */
  number?: number;
  movable = true;
  resizable = true;
  zoomable = true;
  closable = true;
  /** @internal restored layout rect for the zoom toggle (PA-10 / PA-15). */
  private restoredRect: Rect | null = null;

  constructor(title?: string);
  zoom(): void;     // toggle maximized ↔ restored (AR-67); no-op if !zoomable
  close(): void;    // desktop.removeWindow(this) → unmount → onCleanup (AR-71); no-op if !closable

  draw(ctx: DrawContext): void;        // background + frame chrome (active vs windowInactive role)
  onEvent(ev: DispatchEvent): void;    // raise-on-down; map frame hit-zone → move/resize/close/zoom
}
```

### Frame helper (drawing + geometry; not a View — PA-8)

```ts
// window/frame.ts — pure functions over a window-local rect + state.
export interface FrameState { title: string; number?: number; active: boolean; zoomed: boolean; }

/** Draw the border, centered title, number, close box [■], zoom box [↑]/[↓], SE resize corner.
 *  Border + title colors come from `ctx.role(role).border` / `.title` (Phase 0 / PF-03), not the
 *  flattened `ctx.color(role)` — so active vs inactive differ in border/title, per AR-73/PA-1. */
export function drawFrame(ctx: DrawContext, size: Size2D, state: FrameState,
                          role: 'window' | 'windowInactive'): void;

/** Classify a window-local point into a hit-zone (close/zoom/resize/title/interior/border). */
export function frameZoneAt(size: Size2D, local: Point, opts: WindowFlags): FrameZone;
```

**`Window.onEvent` (mouse):**
```
on a mouse 'down':
  desktop = this.parent as Desktop
  desktop.raise(this)                                  // AR-78
  zone = frameZoneAt(size, ev.local, {movable,resizable,zoomable,closable})
  switch zone:
    'close'  → seam.emitCommand(Commands.close /* targeted at this */)  // or this.close()
    'zoom'   → this.zoom()
    'title'  → if movable: desktop.beginMove(this, ev.local)
    'resize' → if resizable: desktop.beginResize(this)
    else     → (interior/border) no gesture; focus already moved via raise
  ev.handled = true
```
> `close`/`zoom` may be invoked directly (`this.close()`/`this.zoom()`) or via the command registry so a
> disabled `close`/`zoom` greys consistently with menus/status (PA-12). The plan uses the direct call for
> the frame boxes and the command for menu/status — both end in the same `Window` method.

**Active/inactive theming (AR-73/PA-1/PF-03):** `Window.draw` chooses `role = (desktop.activeWindow() === this)
? 'window' : 'windowInactive'` and passes it to `drawFrame`, which reads the role's `border`/`title` colors via
`ctx.role(role)` (Phase 0). `activeWindow()` only resolves because `Window.focusable = true` (PF-05). Raising a
window invalidates both the newly-active and the previously-active window so the two frames repaint in their new
roles (ST-15).

**Close (AR-71):** `close()` → `desktop.removeWindow(this)`, which removes the child and disposes its owner
scope (RD-03 `unmount` → `onCleanup` fires, leak-free); the desktop focuses the next top-most window.

### Integration Points
- **Desktop (03-02):** `parent` is the `Desktop`; `beginMove`/`beginResize`/`raise`/`removeWindow`/`activeWindow`.
- **RD-03:** `Group` composition + background; `padding:1` content inset; `bind(title, …)` repaint; `invalidateLayout()` on geometry change; owner-scope disposal on close.
- **Theme (03-05):** `window` / `windowInactive` roles via `ctx.color(role)`.

## Code Examples

### Example 1: Frame chrome + close box
```ts
const w = new Window('Editor'); w.number = 1;
desktop.addWindow(w);
// top border renders: [■]  ─ Editor ─  [↑]   and SE corner shows the resize glyph
w.onEvent(mouseDownAt(closeBoxCell));               // zone 'close'
expect(desktop.children.includes(w)).toBe(false);   // closed + scope disposed
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|------------|-------------------|--------|
| `zoom()` on a `!zoomable` window | No-op | AR-67 |
| `close()` on a `!closable` window | No-op | AR-67 |
| Move on a `!movable` / resize on a `!resizable` window | The frame zone returns `border`/`interior`; no gesture starts | AR-67/74 |
| `number` outside 1–9 | Not drawn as an accelerator; Alt-N never matches it | AR-67 |
| Title/label contains escape bytes | Reaches the screen only via `DrawContext` → core `sanitize` (RD-03 boundary) | AR-73 |
| Window smaller than the frame needs | Min size 10×3 enforced by resize/tile (PA-4); frame degrades gracefully (boxes omitted if no room) | PA-4 |

> **Traceability:** every strategy references its AR/PA entry in `00-ambiguity-register.md`.

## Testing Requirements
- Spec: ST-14 (frame chrome + close/zoom box clicks), ST-15 (active/inactive theming flips on raise).
- Impl: `frameZoneAt` boundaries (close vs zoom vs title vs resize corner); flag gating (`!movable`/`!resizable`/`!zoomable`/`!closable`); reactive title repaint; content inset = window minus border; close disposes the scope (onCleanup spy).
