# Application & run() Lifecycle: App Shell

> **Document**: 03-01-application-run-host.md
> **Parent**: [Index](00-index.md)

## Overview

The composition root. `createApplication(opts)` composes the RD-04 `EventLoop`, an owned
`Desktop`, optional `MenuBar`/`StatusLine`, and a full-screen `overlay` into the full-screen
layout, registers the standard commands, and returns an `Application`. `run()` wires the real
terminal (`createHost`) to the loop, pushes every frame to `host.render` via the new `onFrame`
seam, runs until `'quit'`, and guarantees terminal restore on every exit path. (AR-71, AR-75, AR-83, AR-86; PA-3, PA-6, PA-7, PA-12)

## Architecture

### Current Architecture
RD-04 ships `createEventLoop(viewport, opts)` (builds+owns the `RenderRoot`, one flush/tick) but
explicitly leaves `run()`/`Application`/host-wiring to RD-05 (AR-47/AR-55). Core ships `createHost`
with guaranteed restore (`host/host.ts`, `signals.ts`).

### Proposed Changes
A new `app/` module composes those pieces. The app root is a `Group` whose children are, in z-order:
`[menuBar?, desktop, statusLine?, overlay]` — the overlay is top-most so menu popups paint over
everything. Layout: `col` direction, menu row fixed height 1 (if present, **flow**), desktop `fr:1`
(fills, **flow**), status row fixed height 1 (if present, **flow**); the `overlay` is an
**`position:'absolute'`** sibling (Phase 0 / PA-15) with `rect` = the full viewport, so it does **not**
consume column flow space yet overlays the whole screen and paints last (top-z). (Before Phase 0's
absolute placement, a flex `col` would have squashed the overlay to ~0 height and clipped popups — PF-02.)

> **The overlay is `state.visible = false` while empty (PF-10).** A full-viewport top-z `Group` is the
> front-to-back hit-test winner for **every** point (`hit-test.ts:55-67` returns a childless group via
> `contains`, and mouse delivery is single-target with no bubble — `dispatch.ts:112-114`), so an
> always-visible empty overlay would swallow every click and starve the windows/desktop/status/menu
> titles. The menu controller therefore flips `overlay.state.visible = true` **before** mounting the
> catcher + popups and back to `false` after unmounting them on close (03-04). While invisible the
> overlay is omitted from both reflow and hit-test (`reflow.ts:43`, `hit-test.ts:50`), so it is fully
> inert; while visible the catcher (its first child) intercepts outside clicks as designed. It paints
> nothing of its own either way (no `background`). Set `visible` first, then mount, so the open reflow
> includes the overlay subtree.

## Implementation Details

### New Types/Interfaces

```ts
import type { CapabilityProfile, Theme, Logger, Keymap, RuntimeAdapter, ScreenBuffer } from '@jsvision/core';
import type { Size2D } from '../layout/index.js';
import type { EventLoop } from '../event/index.js';
import type { Desktop } from '../desktop/index.js';
import type { MenuBar } from '../menu/index.js';
import type { StatusLine } from '../status/index.js';

/** Options for the application (loop/render config + optional chrome). */
export interface ApplicationOptions {
  /** REQUIRED — depth-aware encoding for the loop-built RenderRoot's serialize() (AR-44). */
  caps: CapabilityProfile;
  /** Initial viewport; default = stdout columns×rows, else 80×24 (PA-3). First onResize corrects it. */
  viewport?: Size2D;
  theme?: Theme;                 // defaults to core defaultTheme (+ the new windowInactive role, AR-73)
  logger?: Logger;               // screen-safe logger for draw()/onEvent() errors (AR-42/AR-66)
  keymap?: Keymap;               // key-chord → command keymap (core createKeymap, AR-62)
  menuBar?: MenuBar;
  statusLine?: StatusLine;
  /** Injectable OS boundary (default real Node runtime); tests inject a fake (AR-71/PA-14). */
  runtime?: RuntimeAdapter;
}

/** The composed application. Composition over inheritance (AR-75). */
export interface Application {
  readonly desktop: Desktop;
  readonly loop: EventLoop;
  /** Wire createHost → dispatch, run until 'quit', resolve the exit code; restore on every path (AR-71). */
  run(): Promise<number>;
}
```

### New Functions/Methods

```ts
/** Construct the application — composes the loop/desktop/chrome and registers standard commands (AR-71, AR-75). */
export function createApplication(opts: ApplicationOptions): Application;
```

**`createApplication` builds (in order):**
1. Resolve the initial `viewport` (opts → runtime stdout `columns×rows` → `80×24`) (PA-3).
2. Build the app-root `Group` + `overlay` (`position:'absolute'`, full-viewport `rect` — Phase 0; `state.visible=false` until a popup mounts — PF-10), the `Desktop` (background = `desktop` role + pattern via `Desktop.draw` + `ctx.role('desktop').pattern`, AR-80 / PF-03), and add `menuBar`/`statusLine` if provided. (`Desktop`/`MenuBar`/`StatusLine` are the Phase-1 constructable skeletons fleshed out in Phases 3/4/5 — PF-12.) Inject the **loop seam** into the desktop and the overlay/menubar (PA-7) — but the loop must exist first, so: construct the loop via `createEventLoop(viewport, { caps, theme, logger, keymap, commands, onIdle })`, then `loop.mount(appRoot)`, then attach `{ setCapture, releaseCapture, emitCommand, isCommandEnabled, focusView }` to the desktop/menu (PA-7).
3. Register the standard commands (`opts.commands` hint = `Object.values(Commands)`); the WM commands are handled by the desktop's post-process `onEvent`; `'quit'` is bound to terminate `run()` (PA-12).
4. `EventLoop.onFrame` is a **settable member** (PA-18 / PF-04), `undefined` until `run()` assigns it. Before then the loop's flushes simply don't push (no host yet); `run()` sets `loop.onFrame = host.render` and paints the first frame explicitly.

**`run()` algorithm (AR-71, AR-83, AR-86):**
```
run(): Promise<number> {
  // createHost takes a SINGLE HostOptions object; `runtime` is a field of it (PF-07).
  const host = createHost({ caps, runtime,
                            onInput: e => loop.dispatch(e),
                            onResize: e => loop.resize({ width: e.columns, height: e.rows }),
                            onSuspend: () => {},   // host owns the soft restore (AR-83)
                            onResume:  () => {} }) // notify-only; host already re-asserted modes + repainted (AR-83 / PF-09)
  // bridge frames to the terminal — `onFrame` is a SETTABLE member of EventLoop (PA-18 / PF-04):
  loop.onFrame = (buffer) => host.render(buffer)     // every flush → one host.render (PA-6)
  await host.start()                                  // raw mode + alt-screen
  host.render(loop.renderRoot.buffer())               // paint the first frame
  return await quitPromise                            // resolved by the 'quit' command handler with the exit code
    .finally(() => host.stop())                        // GUARANTEED restore on every path (normal/throw/signal)
}
```
- The `'quit'` command handler (registered in `createApplication`) resolves `quitPromise` with the code (`emitCommand('quit', code)` arg, default `0` — AR-86) and stops dispatching.
- A thrown error or signal: core's host invokes its restore backstop; `run()`'s `finally` also calls `host.stop()` (idempotent). The promise rejects/resolves with a non-zero code on the error/signal path.

### Integration Points
- **EventLoop** — composed via `createEventLoop`; `run()` sets `onFrame`, calls `dispatch`/`resize`.
- **Desktop** — owned child; receives the injected loop seam (PA-7).
- **Host (core)** — `createHost`/`start`/`stop`/`render`; suspend/resume handled by the host (AR-83).
- **Overlay/Menu** — the overlay layer hosts menu popups (03-04).

## Code Examples

### Example 1: Headless lifecycle with a fake runtime (test shape)
```ts
const runtime = makeFakeRuntime();                 // records writes, exit code; drives signals
const app = createApplication({ caps, runtime, viewport: { width: 40, height: 12 } });
app.desktop.addWindow(new Window('A'));
const runP = app.run();
runtime.feedKey('alt+x');                           // → 'quit' via keymap (or app.loop.emitCommand('quit'))
expect(await runP).toBe(0);
expect(runtime.restored).toBe(true);                // host.stop() ran
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|------------|-------------------|--------|
| Handler/`draw()` throws mid-tick | Isolated + logged via the injectable screen-safe logger (RD-03 AR-42 / RD-04 AR-66); the frame finishes; the loop is not wedged | AR-71 |
| Thrown error / signal during `run()` | `run()`'s `finally` + core's host backstop both call `host.stop()` (idempotent) — terminal restored; resolve a non-zero exit code | AR-71 / PA-12 |
| `'quit'` with a non-numeric arg | Coerce: numeric arg → exit code; otherwise default `0` | AR-86 |
| No TTY (piped) | `viewport` default falls back to `80×24`; `host.isTTY` false — `run()` still composes/dispatches (used by the headless demo/tests) | PA-3 / PA-14 |
| SIGCONT (resume) | `onResume` is **notify-only** — the host already re-asserted modes + repainted from its last buffer (`signals.ts`); the app writes no modes and fires no inert flush (PF-09) | AR-83 / PF-09 |

> **Traceability:** every strategy references its AR/PA entry in `00-ambiguity-register.md`.

## Testing Requirements
- Spec: ST-01 (composition), ST-02 (host wiring via fake runtime), ST-03 (quit→exit code), ST-04 (restore-on-throw), ST-05 (suspend/resume).
- Impl: viewport default resolution; `onFrame`→`host.render` call count = flush count; idempotent `host.stop()`; quit-arg coercion; first-frame paint.
