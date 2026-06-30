# StatusLine, Commands, Theme & Loop Seams: App Shell

> **Document**: 03-05-statusline-commands-theme-seams.md
> **Parent**: [Index](00-index.md)

## Overview

The remaining shell pieces + the cross-cutting additive surfaces:
- **`StatusLine`** — a static, command-bound bottom row (AR-72).
- **`Commands`** — the standard command-name constants (AR-76/AR-85).
- **`windowInactive`** — the **sole cross-package edit**: the `@jsvision/core` `Theme` role
  (AR-73/PA-1). Two further additive **intra-package** (`packages/ui`) contract extensions land in
  Phase 0: RD-02 `LayoutProps` absolute placement and RD-03 `DrawContext.role`
  ([03-00](03-00-foundation-extensions.md)). AC-21 ("only cross-package edit = `windowInactive`") holds.
- **Loop seams** — additive `setCapture`/`releaseCapture` (PF-001/AR-82/PA-5) and the settable
  `onFrame` member (PF-003/AR-84/PA-6/PA-18) on the composed RD-04 `EventLoop`.
- **Packaging** — `packages/ui/src/{app,desktop,window,menu,status}/` + explicit named re-exports (AR-81/PA-11).

## Implementation Details

### StatusLine (AR-72, AR-77)

```ts
export type StatusItem = { text: string; command: string; key?: string };   // tilde ~X~ marks the hotkey

export function statusLine(items: StatusItem[]): StatusLine;
export function statusItem(text: string, command: string, key?: string): StatusItem;

/** A static bottom row (AR-72): draws items; click or accelerator emits the command; disabled greys. */
export class StatusLine extends View {
  /** @internal injected by the Application (PA-7). */
  attach(seam: StatusLoopSeam): void;               // { emitCommand, isCommandEnabled }
  draw(ctx: DrawContext): void;                     // left-packed items, ~hotkey~ highlighted; disabled dim
  onEvent(ev: DispatchEvent): void;                 // click hit-zone → emit; bound accelerator → emit
}
```
- Items are laid out left-to-right with a fixed gap; each item has a click hit-zone (x-range). A click in
  an item's range, or a press of its `key` accelerator (matched in `onEvent`), calls `seam.emitCommand(command)`.
- Greying: each item consults `seam.isCommandEnabled(command)`; disabled → dim style + non-activatable (AR-72).
- The list is **static** — help-context ranges are out of scope (AR-72).

### Commands (AR-76, AR-85)

```ts
/** Standard shell command names — bind by constant, not literal (AR-76). resize/move dropped (AR-85/PF-004). */
export const Commands = {
  quit: 'quit', close: 'close', zoom: 'zoom',
  next: 'next', prev: 'prev', cascade: 'cascade', tile: 'tile',
} as const;
```
The `Application` passes `Object.values(Commands)` as the loop's `commands` hint and binds `'quit'`
to terminate `run()` (PA-12); the WM commands are handled by the desktop's post-process `onEvent`.

### Additive core Theme role (AR-73, PA-1) — the sole cross-package edit

```ts
// packages/core/src/engine/color/theme.ts (additive)
export interface Theme {
  // … existing roles …
  readonly window: ThemeRole & { readonly border: Color; readonly title: Color };          // active
  readonly windowInactive: ThemeRole & { readonly border: Color; readonly title: Color };  // NEW (PA-1)
  // … dialog, desktop, menuBar, menuSelected, statusBar, shadow …
}

export const defaultTheme: Theme = {
  // …
  window:         { fg: PALETTE.black, bg: PALETTE.lightGray, border: PALETTE.black,    title: PALETTE.black },
  windowInactive: { fg: PALETTE.darkGray, bg: PALETTE.lightGray, border: PALETTE.darkGray, title: PALETTE.darkGray }, // NEW
  // …
};
```
- `windowInactive` is a sibling role mirroring `window`'s shape (fg/bg + border/title). The `Frame`
  helper picks `window` (active) or `windowInactive` (inactive) per `desktop.activeWindow() === this` (03-03).
- `ThemeRoleName = keyof Theme` (RD-03 AR-45), so `DrawContext.color('windowInactive')` resolves automatically
  once the role exists — no RD-03 change needed.
- CHANGELOG + the README "Versioning & stability" note record the additive `Theme` field (non-breaking, additive).

### Additive loop seams (PF-001/AR-82 & PF-003/AR-84)

```ts
// packages/ui/src/event/types.ts (additive)
export interface EventLoop {
  // … existing RD-04 surface …
  /** Pointer capture: while set, all mouse/wheel events route to `view` (target-local) until released (PA-5). */
  setCapture(view: View): void;
  releaseCapture(): void;
  /**
   * Frame sink: when set, fired after every coalesced flush (end of runTick, on resize, after mount)
   * with the live buffer so the host can paint (PA-6). A **settable member** (not an `EventLoopOptions`
   * field) because `run()` wires it to `host.render` only AFTER the host exists — `createApplication`
   * builds the loop before the host (PA-18 / PF-04). `undefined` until set ⇒ flushes don't push.
   */
  onFrame?: (buffer: ScreenBuffer) => void;
}
```
> **PF-04 note:** the prior draft placed `onFrame` on `EventLoopOptions` (construction-time), which
> conflicts with `run()`'s `loop.onFrame = host.render` (the host doesn't exist at construction). It
> is a settable member of `EventLoop`.

**`setCapture`/`releaseCapture` (PA-5) — `event-loop.ts` + `hit-test.ts`:**
- The loop holds `captureTarget: View | null`. `setCapture(v)` sets it; `releaseCapture()` clears it.
- `hitTestRoute` (additive branch): **if `captureTarget` is set**, skip the hit-test/focus-on-click entirely and
  deliver the (0-based normalized) event to `captureTarget.onEvent` with `ev.local` relative to the target's
  absolute origin; otherwise the existing top-most hit-test path runs. Focus-on-click is suppressed while captured.
- Capture is released automatically when a modal opens/closes (so a stale gesture can't capture across modality).

**`onFrame` (PA-6/PA-18) — `event-loop.ts`:**
- The loop holds a settable `onFrame?: (buffer) => void` field (default `undefined`).
- After the single coalesced `flush()` at the end of `runTick`, call `this.onFrame?.(renderRoot.buffer())`.
- Also after `resize`'s flush and after `mount`'s first flush. So `run()`'s `loop.onFrame = host.render`
  delivers **every** frame — including frames flushed by an async `endModal`/command (the PF-003 fix).

### Packaging (AR-81, PA-11)
- New dirs `packages/ui/src/{app,desktop,window,menu,status}/`, each with a barrel `index.ts`; pure TS, zero
  runtime deps (Node built-ins + `@jsvision/core`), ESM/NodeNext `.js` specifiers.
- `packages/ui/src/index.ts` gains **explicit named re-exports**: `createApplication`, `Application`,
  `ApplicationOptions`, `Desktop`, `Window`, `MenuBar`, `StatusLine`, `MenuItem`, `StatusItem`, `Commands`, and
  the builder functions (`menuBar`/`subMenu`/`item`/`separator`/`statusLine`/`statusItem`). `Frame`/`MenuPopup`
  stay internal (PA-8/PA-9).
- `yarn check:deps` must still pass (no native deps).

## Integration Points
- **Application (03-01):** injects the loop seam into StatusLine/MenuBar/Desktop; sets `onFrame`; registers `Commands`.
- **RD-04 loop:** the capture + `onFrame` seams are additive to the composed loop (not a re-shape — PA-5/PA-6).
- **Core Theme:** `windowInactive` resolves via the existing `ThemeRoleName` machinery.

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|------------|-------------------|--------|
| Status click outside any item | No-op | AR-72 |
| Status item with a disabled command | Greyed + non-activatable | AR-72 |
| `setCapture` while a capture is already set | Last-writer-wins (replace the target); document in JSDoc | PA-5 |
| `releaseCapture` with no capture | No-op | PA-5 |
| `onFrame` not provided | The flush still happens; no host push (headless tests/demo read `renderRoot.buffer()` directly) | PA-6 |
| Capture target unmounted mid-gesture (e.g. window closed) | Release capture on unmount / next tick; never route to a detached view | PA-5 |

> **Traceability:** every strategy references its AR/PA entry in `00-ambiguity-register.md`.

## Testing Requirements
- Spec: ST-18 (menu/status command + enable/disable greying), ST-19 (status draw/click/accelerator/grey), ST-20 (one frame per interaction — `onFrame`/flush count = 1 per dispatch tick), ST-21 (packaging — importable from `@jsvision/ui`; check:deps; only cross-package edit = `windowInactive`), ST-22 (capture: a drag tracks past the affordance via `setCapture`).
- Impl (core): `defaultTheme.windowInactive` present + shape; `color('windowInactive')` resolves to a `Style`.
- Impl (ui): capture short-circuit + focus-on-click suppression; capture release on modal open/close + on target unmount; `onFrame` fires after tick/resize/mount; `Commands` values; status tilde parsing + hit-zones.
