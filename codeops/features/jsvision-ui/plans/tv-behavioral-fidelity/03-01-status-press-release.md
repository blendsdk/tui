# 03-01 — Status press feedback + emit-on-release

> **Parent**: [Index](00-index.md) · Implements RD-10 AR-88 · PA-1/PA-2/PA-3 · TV `tstatusl.cpp` `drawSelect`
> **CodeOps Skills Version**: 3.1.0

## Goal

Repaint a held status item black-on-green, track the drag, and emit the command on mouse-**up** only
if still over the same enabled item — replacing today's emit-on-down. (TV `TStatusLine::drawSelect`.)

## A. `statusSelected` theme role (core, additive — PA-3)

`core/src/engine/color/theme.ts`:

```ts
// Theme interface — add after statusBar:
/** The status-line pressed/selected item (mouse-down feedback): TV cSelect 0x20 / hotkey 0x24. */
readonly statusSelected: ThemeRole;

// defaultTheme — add:
statusSelected: { fg: PALETTE.black, bg: PALETTE.green, hotkey: PALETTE.red },
```

This is the **only** cross-package edit. `cSelDisabled` (darkGray-on-green) is **derived** in the
status draw from `ctx.role('shadow').fg` + `statusSelected.bg` — no extra role (PA-3).

## B. Capture seam (PA-1)

`StatusLoopSeam` (`status/statusline.ts`) gains the loop's existing capture methods; `createApplication`
wires them:

```ts
interface StatusLoopSeam {
  emitCommand(command: string, arg?: unknown): void;
  isCommandEnabled(command: string): boolean;
  setCapture(view: View): void;       // AR-82 — the same seam Desktop uses
  releaseCapture(): void;
}
// app/application.ts statusLine.attach({ …, setCapture: v => loop.setCapture(v), releaseCapture: () => loop.releaseCapture() })
```

## C. Pressed-state model (PA-2)

`StatusLine` gains `protected pressed: StatusItem | null = null`.

- **mouse-down** (`kind==='down'`, `ev.local` defined): find the hit `ItemBox`. If its command is
  enabled, `this.pressed = box.item`, `seam.setCapture(this)`, `this.invalidate()`, `ev.handled = true`.
  (A down on a disabled item or empty space: `pressed = null`, no capture, not handled — TV ignores it.)
- **captured mouse-move/drag** (`kind==='move'|'drag'`): recompute the hit item; set `pressed` to it
  (only if enabled) or `null` if off the bar / over a disabled item; `invalidate()` if it changed.
- **mouse-up** (`kind==='up'`): capture the pre-clear `pressed`; `seam.releaseCapture()`,
  `this.pressed = null`, `invalidate()`. If the released-over item equals the pressed item **and** is
  enabled, `seam.emitCommand(cmd)`. (Released off the item / on disabled ⇒ no emit.) `ev.handled = true`.

> The status line is `postProcess`; while captured, the loop routes move/up to it directly with
> view-local `ev.local` (same path Desktop relies on). Each event is one coalesced tick (AR-54).

## D. Draw (`draw(ctx)`)

Per item box: `enabled = seam?.isCommandEnabled(cmd) ?? true`; `isPressed = this.pressed === box.item`.

| state | span fill + text | hotkey run |
|-------|------------------|------------|
| pressed + enabled | `statusSelected` (black on green) | `statusSelected.hotkey` (red on green) |
| pressed + disabled | `cSelDisabled` = `{ fg: shadow.fg, bg: statusSelected.bg }` | none |
| normal enabled | `base` (black on lightGray) | `statusBar.hotkey` (red) |
| normal disabled | `dim` (darkGray) | none |

Render via the existing `tildeSegments` loop (the hotkey-run accent already works); only the per-item
base style is selected by `isPressed`/`enabled`. Pads are colored (the full span fill) exactly as today.

## Acceptance (→ ST-01…ST-04)

- Down on enabled item ⇒ green highlight, no emit (ST-01). Drag re-targets / clears (ST-02). Up over
  same enabled item ⇒ emit once; up off / on disabled ⇒ no emit (ST-03). `statusSelected` role present
  + encodes (ST-04).
