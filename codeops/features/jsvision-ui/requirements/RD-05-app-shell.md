# RD-05: App Shell — Application/run · Desktop · Window/Frame · MenuBar · StatusLine

> **Document**: RD-05-app-shell.md
> **Status**: Draft
> **Created**: 2026-06-30
> **Project**: jsvision UI (`@jsvision/ui`)
> **Depends On**: RD-04 (Event loop — done), RD-03 (View/Group spine — done), RD-01 (Reactive core — done), RD-02 (Layout engine — done), `@jsvision/core` (host/render/color/input — done)
> **CodeOps Skills Version**: 3.1.0

---

## Feature Overview

RD-05 makes jsvision a **runnable application**. RD-04 shipped the host-agnostic
dispatch *mechanism* (`EventLoop`): pure `dispatch(event)`, a per-group `current`
focus chain, mouse hit-test, a typed command layer, and async `execView`/`endModal`
modality, driving RD-03's `RenderRoot` one frame per tick. What is still missing is
everything that turns that mechanism into a *program*: a concrete `Application` that
wires the real terminal to the loop, a **window manager** (`Desktop`) that stacks,
raises, drags, resizes, and arranges windows, the `Window`/`Frame` chrome those
windows wear, and the `MenuBar`/`StatusLine` that frame the whole screen.

RD-05 is the **integration keystone** of the Phase-0 spine (RD-01…RD-05): it is the
first RD that touches a live TTY (via `@jsvision/core`'s `createHost`), the first that
produces a windowed desktop you can drive with a real keyboard and mouse, and the
point at which the RD-04 pieces RD-04 *deferred to the Desktop* — most notably
**z-order raise on click** (RD-04 does focus-on-click, not raise — AR-50/AR-78) and
window **drag/resize/zoom/cascade/tile** — finally land.

It reimagines Turbo Vision's `TProgram`/`TApplication`, `TDeskTop`/`TBackground`,
`TWindow`/`TFrame`, `TMenuBar`/`TMenuBox`, and `TStatusLine` as an idiomatic,
**composition-over-inheritance** TypeScript application layer on the already-built
mechanism — the concrete app objects RD-04 (AR-47) named as RD-05's charter.

**Scope boundary (AR-47, AR-69, AR-79):** RD-05 ships the **app shell** — the
`Application`/`run()` lifecycle, the `Desktop` window manager, `Window`/`Frame`,
`MenuBar`/`MenuPopup` with full nested-menu navigation, and `StatusLine`. It does
**not** ship leaf form controls (`Button`/`Input`/`ListView`/`Dialog` → **RD-06**),
nor the scrolling widgets (`ScrollBar`/`Scroller` → **RD-06**, where they pair with
`ListView`'s virtual scroll — AR-69), nor a rich `Dialog`: RD-05 reuses RD-04's
existing `execView`/`endModal` modal mechanism, and the rich `Dialog` widget is RD-06
(AR-79).

Complexity: **XL** (the window manager — overlapping z-ordered windows with
raise/drag/resize/zoom/cascade/tile over a clipped, hit-tested view tree — plus a full
nested-menu navigation state machine, plus the first real `createHost` ↔ `dispatch`
lifecycle with guaranteed terminal restore, is the broadest single RD in the spine).

---

## Functional Requirements

### Must Have

#### Application & lifecycle

- [ ] **`Application`** — the top-level object (`createApplication(opts)`), composing
  (not subclassing) the RD-04 `EventLoop`, an owned `Desktop`, an optional `MenuBar`,
  and an optional `StatusLine` into the full-screen layout (menu bar at the top row,
  status line at the bottom row, desktop filling the middle). Exposes `run()`, the
  `desktop`, the `loop`, and command helpers. (AR-71, AR-75)
- [ ] **`run(): Promise<number>` (AR-71)** — wires the real terminal to the loop: builds
  `@jsvision/core`'s `createHost({ caps, onInput, onResize, onSuspend, onResume })`,
  routes `onInput → loop.dispatch`, `onResize → loop.resize`, and the loop's **`onFrame` hook
  → `host.render(buffer)`** so **every** frame reaches the terminal — including async-produced
  ones (e.g. an `endModal` resolved from a timer/Promise), not just frames pushed right after a
  synchronous `dispatch` (PF-003); starts the host (raw mode, alt-screen), paints the first
  frame, and runs until a **`'quit'` command** fires (the TV `cmQuit` model), then resolves the
  process **exit code** — `0` by default, or the optional numeric arg of `emitCommand('quit',
  code)` (a thrown / signal path resolves a non-zero code). (AR-71)
- [ ] **Guaranteed restore on every exit path** — `run()` calls `host.stop()` (cooked
  mode, main screen, cursor restored) on normal quit **and** on a thrown error / signal
  path, reusing core's host restore guarantee; the terminal is never left in raw/alt
  state. (AR-71)
- [ ] **Suspend / resume** — handled by **core's host**: `onSuspend` (SIGTSTP) fires before the
  host soft-restores + suspends; on SIGCONT the **host itself** re-asserts modes and forces a full
  repaint of its last buffer, then fires `onResume` as a post-restore notification. RD-05's
  `onResume` hook is therefore notify-only (optional app-level state resync) — it does **not**
  re-assert modes or repaint (the host already did, before it fired — PF-002). (AR-71)
- [ ] **Injectable host for tests** — `run()` accepts an injected host/`RuntimeAdapter`
  (defaulting to the real Node runtime), so the full `Application` lifecycle —
  input→dispatch→frame, quit→exit code, restore-on-throw — is driven headlessly with a
  fake runtime, exactly as core's host tests do. (AR-71, AR-70)

#### Desktop (the window manager)

- [ ] **`Desktop`** — a `Group` subclass that owns the windows as its children (child
  array order = z-order, back-to-front, inheriting RD-03 AR-38), fills its area with the
  background pattern (core theme `desktop` role + `pattern`, AR-80), and is the
  always-present bottom layer. `addWindow`/`removeWindow` manage membership. (AR-67, AR-80)
- [ ] **Focus-on-click RAISE (AR-67, AR-78)** — a mouse-down anywhere in a window raises
  that window to the **top** of the desktop's child order (so it paints over its
  siblings) **and** focuses it; the active window is, by definition, the top-most focused
  window. This is the raise RD-04 deferred to the Desktop (RD-04 does focus-on-click, not
  z-raise — AR-50). (AR-67, AR-78)
- [ ] **Drag-move (AR-67)** — dragging a window's title bar moves the window across the
  desktop (mouse-down on the title **captures the pointer** via the additive loop capture seam
  below — PF-001; mouse-move/drag repositions; mouse-up releases the capture), clamped to stay
  reachable on the desktop. (AR-67)
- [ ] **Free drag-resize (AR-74)** — dragging a window's lower-right resize corner resizes
  the window to an arbitrary size (down to a minimum), with the window's content reflowed
  live to the new interior. The **single-cell** corner relies on the same pointer-capture seam
  (PF-001) so the resize tracks the cursor even when it leaves the corner. (AR-74)
- [ ] **Zoom (AR-67)** — a window's zoom box (or the `zoom` command) toggles the window
  between its restored size/position and **maximized** (filling the desktop), preserving
  the restored geometry for the toggle-back. (AR-67)
- [ ] **Cascade / Tile (AR-67)** — desktop commands that re-arrange all non-modal,
  visible windows (un-zooming any maximized window first — PF-006): `cascade` staggers them by a
  fixed offset from the top-left; `tile` packs them into a non-overlapping grid that fills the
  desktop, **clamping each cell to the window minimum size** (cells may then extend past the
  desktop edge, consistent with RD-02 overflow AR-28); 0 windows is a no-op, 1 fills the desktop. (AR-67)
- [ ] **Window switching (AR-67)** — a `next`/`prev` command (and Alt-`N` for window
  number `N`) cycles focus across the desktop's windows, raising the newly-active one. (AR-67)

#### Window & Frame

- [ ] **`Window`** — a `Group` subclass: a titled, framed, movable container with an
  interior content area (its children compose inside the frame's inset). Carries a
  reactive `title`, an optional `number` (1–9, shown in the frame for Alt-`N`), and
  option flags `movable`/`resizable`/`zoomable`/`closable` (each gating the matching
  Desktop interaction + frame affordance). (AR-67, AR-74)
- [ ] **`Frame` (Window-internal chrome)** — draws the window border, the centered title,
  the window number, and the interactive boxes: a **close box** (`[■]`), a **zoom box**
  (`[↑]`/`[↓]`), and the **lower-right resize corner**. The frame's hit zones map mouse
  events to move/resize/zoom/close; it is internal to `Window` (not a standalone public
  widget), consistent with TV's `TFrame`. (AR-67, AR-74)
- [ ] **Active / inactive frame theming (AR-73)** — the active (top-most focused) window's
  frame renders in the active style; background windows render in an inactive (dimmer)
  style. The active/inactive distinction is added **additively to `@jsvision/core`'s
  `Theme`** (core owns theming — AR-73), and `Frame` picks the role by the window's active
  state. (AR-73)
- [ ] **`close` (AR-71)** — closing a window removes it from the desktop and disposes its
  owner scope (RD-03 `unmount` → `onCleanup`), leak-free. (AR-67, AR-71)

#### Menus

- [ ] **Declarative builders (AR-68)** — `menuBar([...])`, `subMenu(title, [...])`,
  `item(title, command, key?)`, and `separator()` build the menu tree as plain data;
  the hotkey of a label is marked with the **tilde convention** `~X~` (TV-faithful —
  `subMenu('~F~ile', …)`), and `key` is the displayed accelerator (e.g. `'F3'`,
  `'Alt+X'`). (AR-68, AR-77)
- [ ] **`MenuBar`** — a `View` pinned to the top row that draws the top-level menu titles
  with their hotkeys highlighted; it is a **pre-process** view (AR-51) so its accelerators
  see events first. (AR-68)
- [ ] **Menu activation (AR-68)** — the menu opens via **F10** (focus the bar), a click on
  a title, or **Alt+hotkey** (jump straight to that menu); opening a top-level menu drops
  its `MenuPopup`. (AR-68)
- [ ] **`MenuPopup` + nested navigation (AR-68)** — a dropdown that lists its items;
  **↑/↓** move the highlight (skipping separators/disabled), **Enter** activates the
  highlighted item, **←/→** move between top-level menus, **Esc** closes one level,
  and a sub-`subMenu` opens a **nested** child popup (full multi-level menus). An item's
  hotkey activates it directly while its popup is open. (AR-68)
- [ ] **Command emission + enable/disable (AR-68)** — activating an `item` emits its
  `command` through the loop (`emitCommand`); an item whose command is disabled in the
  RD-04 command registry renders greyed and is non-activatable. (AR-68)

#### Status line

- [ ] **Declarative builders (AR-72)** — `statusLine([...])` and `statusItem(text,
  command, key?)` build a fixed item list; `text` uses the same `~X~` hotkey convention,
  and `key` is the bound accelerator displayed. (AR-72, AR-77)
- [ ] **`StatusLine` (AR-72)** — a `View` pinned to the bottom row drawing its items;
  clicking an item (or pressing its accelerator) emits the item's `command`. An item
  whose command is disabled renders greyed (the list is **static**; context-sensitive
  help-context ranges are deferred — AR-72). (AR-72)

#### Standard commands & theming

- [ ] **Standard command vocabulary (AR-76)** — RD-05 ships a small constants module of
  the shell's standard command names (`quit`, `close`, `zoom`, `next`, `prev`, `cascade`,
  `tile`) so menus, status items, and keymaps bind them by constant, not bare string literal.
  (`resize`/`move` are deferred until a keyboard-driven move/resize mode is specified — PF-004;
  v1 move/resize are mouse-drag gestures, not commands.) (AR-76)
- [ ] **Additive core `Theme` change (AR-73)** — extend `@jsvision/core`'s `Theme` with the
  active/inactive window distinction (the only cross-package change in RD-05), mirroring the
  additive-core-primitive pattern of RD-01 (`runWithOwner`) and RD-03 (`ScreenBuffer.clone()`).
  The default theme's existing roles (`desktop`/`menuBar`/`menuSelected`/`window`/`statusBar`/
  `shadow`) are otherwise reused as-is. (AR-73, AR-80)

#### Packaging

- [ ] **Packaging** — pure TypeScript, no third-party/native runtime dependencies (only Node
  built-ins + the declared workspace dep `@jsvision/core`); ESM/NodeNext; lives under
  `packages/ui/src/` (final dir layout — e.g. `app/`, `desktop/`, `window/`, `menu/`,
  `status/` — finalized in planning) and is re-exported through the single `@jsvision/ui`
  entry point with **explicit named re-exports** (per the layout convention); `yarn
  check:deps` passes. (AR-75, AR-81)

### Should Have

- [ ] **Headless `demo:shell` (AR-70)** — a runnable, deterministic walkthrough that feeds
  synthetic events into the loop and prints ASCII frames showing a windowed desktop:
  opening windows, raising/dragging/zooming one, a menu dropping and a command firing, and
  the status line — the CI-able RD-05 acceptance vehicle, consistent with `demo:events`. (AR-70)
- [ ] **Real-TTY interactive demo (AR-70)** — a live windowed app (run via the demo script,
  like `demo:resize`) proving `run()` against a real terminal: drag/resize/zoom windows with
  the mouse, navigate menus, quit cleanly with the terminal restored. Manual-verification
  vehicle, not a CI gate. (AR-70)
- [ ] **`activeWindow()` introspection** — read the desktop's current active (top-most
  focused) window, for tests and status-line context. (AR-67)

### Won't Have (Out of Scope)

- **Leaf form controls** — `Button`, `Input`, `Label`, `CheckGroup`, `RadioGroup`,
  `ListView`, `Dialog` are **RD-06**; RD-05 acceptance uses test `View`/`Group` content
  and the menu/window chrome. (component map §4)
- **Scrolling widgets** — `ScrollBar` and `Scroller` are deferred to **RD-06**, where they
  pair with `ListView`'s virtual scroll (a `ScrollBar` with no `Scroller` is decorative; a
  `Scroller` has nothing to show without a scrollable content widget). (AR-69)
- **Rich `Dialog` widget** — RD-05 reuses RD-04's `execView`/`endModal` modal mechanism for
  modal windows; the rich `Dialog` (standard buttons, validators, result mapping) is RD-06. (AR-79)
- **Context-sensitive status line** — TV's help-context ranges (items swapping by the focused
  view's help context) are deferred; RD-05's status line is a static list with enable/disable
  greying. (AR-72)
- **Typed broadcast / message bus & timer-queue wrapper** — RD-04 deferred these here, but
  they remain unbuilt in v1 (RD-01 signals serve cross-view state; Node's native timers
  suffice); revisit when a concrete consumer appears. (AR-58)
- **Help viewer / color-picker / outline-tree** — Tier-3 optional subsystems (component map
  §10/§11), not part of the shell.

---

## Technical Requirements

### Public API surface

```ts
import type { CapabilityProfile, Theme, Logger, Keymap, Host, RuntimeAdapter } from '@jsvision/core';
import type { Size2D } from '../layout/index.js';                 // intra-package reuse (RD-02)
import { Group, View } from '../view/index.js';                   // intra-package reuse (RD-03)
import type { EventLoop } from '../event/index.js';               // intra-package reuse (RD-04)

/** Options for the application; carries the loop/render config + the optional chrome. */
interface ApplicationOptions {
  /** REQUIRED — depth-aware encoding for the loop-built RenderRoot's serialize(). (AR-44) */
  caps: CapabilityProfile;
  theme?: Theme;                 // active theme (defaults to core defaultTheme + the new role, AR-73)
  logger?: Logger;               // screen-safe logger for draw()/onEvent() errors (RD-03 AR-42, RD-04 AR-66)
  keymap?: Keymap;               // key-chord → command keymap, built via core createKeymap (AR-62)
  menuBar?: MenuBar;             // optional top-row menu bar
  statusLine?: StatusLine;       // optional bottom-row status line
  /** Injectable OS boundary for the host (defaults to the real Node runtime); tests inject a fake. (AR-71) */
  runtime?: RuntimeAdapter;
}

/** The composed application. Composition over inheritance (AR-75). */
interface Application {
  readonly desktop: Desktop;     // the window manager
  readonly loop: EventLoop;      // the RD-04 mechanism it composes
  /** Wire createHost → dispatch, run until a 'quit' command, resolve the exit code; restore on every path. (AR-71) */
  run(): Promise<number>;
}

/** Construct the application. The concrete shell composing the RD-04 EventLoop. (AR-71, AR-75) */
function createApplication(opts: ApplicationOptions): Application;

/** The window manager: a Group of windows with z-order, raise, drag, resize, zoom, cascade/tile. (AR-67) */
class Desktop extends Group {
  addWindow(w: Window): void;
  removeWindow(w: Window): void;
  raise(w: Window): void;        // z-order to top + focus (AR-78)
  cascade(): void;
  tile(): void;
  activeWindow(): Window | null;
}

/** A titled, framed, movable/resizable/zoomable/closable container; children compose in the interior. (AR-67, AR-74) */
class Window extends Group {
  title: string;                 // reactive title shown centered in the frame
  number?: number;               // 1–9, shown in the frame, Alt-N focus
  movable = true;
  resizable = true;
  zoomable = true;
  closable = true;
  zoom(): void;                  // toggle maximized/restored (AR-67)
  close(): void;                 // remove from desktop + dispose scope (AR-71)
}

// Menu builders (declarative data; tilde ~X~ marks the hotkey — AR-68, AR-77).
function menuBar(items: MenuItem[]): MenuBar;
function subMenu(title: string, items: MenuItem[]): MenuItem;
function item(title: string, command: string, key?: string): MenuItem;
function separator(): MenuItem;

// Status builders (static list; tilde ~X~ hotkey — AR-72, AR-77).
function statusLine(items: StatusItem[]): StatusLine;
function statusItem(text: string, command: string, key?: string): StatusItem;

/** The standard shell command names (bind by constant, not literal — AR-76). */
const Commands: {
  readonly quit: 'quit';   readonly close: 'close'; readonly zoom: 'zoom';
  readonly next: 'next';   readonly prev: 'prev';   readonly cascade: 'cascade';
  readonly tile: 'tile';
  // `resize`/`move` deferred until a keyboard-driven move/resize mode is specified (PF-004).
};
```

**Additive RD-04 `EventLoop` seams (intra-package, additive — PF-001 / PF-003):**

```ts
import type { ScreenBuffer } from '@jsvision/core';

// Additive to the RD-04 EventLoop — the loop is COMPOSED, then extended with two small seams
// (mirroring RD-04's own additive option-seam style); its dispatch model is not re-shaped.
interface EventLoop {
  // … existing RD-04 surface …
  /** Pointer capture: while set, all mouse move/drag/up route to `view` until released (PF-001). */
  setCapture(view: View): void;
  releaseCapture(): void;
}
interface EventLoopOptions {
  // … existing …
  /** Fired after each tick's coalesced flush() and on resize, so run() pushes a frame (PF-003). */
  onFrame?: (buffer: ScreenBuffer) => void;
}
```

> The **capture seam** makes drag/resize track the cursor past the title bar / single-cell corner
> (hit-testing alone routes to the top-most view under the cursor, so a fast or clamped drag would
> otherwise lose the gesture). The **`onFrame` hook** lets `run()` deliver *every* frame — including
> async `endModal`/command frames the loop flushes outside a synchronous `dispatch` — to
> `host.render`. Both are additive seams within `@jsvision/ui`, not cross-package edits; signatures
> finalized in planning.

**Additive `@jsvision/core` `Theme` change (the only cross-package edit — AR-73):**

```ts
// On core's Theme (additive): an active/inactive window distinction so the Frame can
// highlight the top-most focused window vs background windows. Exact shape (a new
// `windowInactive` role vs active/inactive border colors on `window`) finalized in planning.
```

> `CapabilityProfile`/`Theme`/`Logger`/`Keymap`/`Host`/`RuntimeAdapter` come from `@jsvision/core`;
> `Size2D`/`View`/`Group`/`EventLoop` are reused from the package's own RD-02/RD-03/RD-04 surfaces.
> `Application`/`Desktop`/`Window`/`Frame`/`MenuBar`/`MenuPopup`/`StatusLine`/`MenuItem`/`StatusItem`/
> `Commands` and the builder functions are RD-05-owned. `Frame`/`MenuPopup` are Window/MenuBar-internal.
> Signatures are indicative and finalized during planning.

### Behavior notes

- **Lifecycle** — `createApplication` composes the loop (RD-04 `createEventLoop`, which builds +
  owns the `RenderRoot`), mounts the full-screen layout (menu bar row · desktop · status line row),
  and binds the standard commands. `run()` builds the host, wires `onInput→dispatch` /
  `onResize→resize` / the loop's `onFrame`→`host.render` (every frame, sync or async — PF-003) /
  suspend+resume, paints, and awaits the `'quit'` command; on resolution (or any throw/signal) it
  `host.stop()`s and returns the exit code (`0` or the `quit` arg — PF-005). (AR-71)
- **Window manager** — the desktop's children are its windows in z-order; `raise(w)` moves `w` to the
  end of the child array (top) and focuses it (the RD-04 `current` chain); drag/resize/zoom mutate the
  window's `bounds` and `invalidateLayout()` so RD-03 reflow re-insets the content; cascade/tile
  recompute all non-modal windows' bounds. Hit-testing (RD-04 AR-50) routes the **initial** mouse-down
  to the top-most window, and the frame's interior hit zones decide move vs resize vs close vs zoom;
  an active move/resize then **captures the pointer** (PF-001) so the gesture tracks the cursor past
  the affordance (clamped/fast drags, the single-cell corner) until mouse-up releases it. (AR-67, AR-74, AR-78)
- **Menus** — `MenuBar` is a pre-process view; its accelerators (Alt+hotkey, F10) and an open
  `MenuPopup`'s navigation are handled in `onEvent` with `ev.handled`. Opening a menu pushes a popup
  into the tree; nested `subMenu`s push child popups; Enter emits the item's command via the loop,
  then closes the menu; Esc pops one popup level. Disabled commands grey their items. (AR-68)
- **Status line** — `StatusLine` draws its static items; a click (hit-test) or a bound accelerator
  emits the item's command; items reflect `isCommandEnabled` for greying. (AR-72)
- **Theming** — all roles resolve through RD-03's `DrawContext.color(role)`; the frame picks the
  active vs inactive window role by `desktop.activeWindow() === thisWindow`. The new active/inactive
  role is added to core's `Theme` (AR-73); every other surface reuses existing default roles. (AR-73, AR-80)
- **Frame determinism** — the shell inherits RD-04's one-coalesced-frame-per-dispatch-tick guarantee
  (AR-54): a drag step, a menu navigation key, or a command cascade each produces exactly one `flush()`.

---

## Integration Points

### With RD-04 (Event loop — done)

- **Composes `EventLoop`** — `Application` builds the loop via `createEventLoop(viewport, opts)` and
  *uses* its `dispatch`/`resize`/focus/command/modal/`onIdle` API; it **composes** (not subclasses)
  the loop and adds only two **additive** seams — pointer capture (PF-001) and an `onFrame` frame
  hook (PF-003) — without re-shaping its dispatch model (AR-47, AR-55).
- **Raise = the deferred piece** — RD-04 does focus-on-click; the Desktop adds z-order **raise** on
  click (AR-50 noted "raise → Desktop's job, RD-05"). (AR-78)
- **Commands** — menus/status items emit through `emitCommand`; the shell registers the standard
  commands and binds `'quit'` to terminate `run()`. (AR-52, AR-71, AR-76)
- **Modality** — modal windows reuse `execView`/`endModal` unchanged; the rich `Dialog` is RD-06. (AR-53, AR-79)
- **Keymap** — accelerators bind through core's `Keymap` the loop already consumes (AR-62).

### With RD-03 (View/Group spine — done)

- **`Desktop`/`Window` extend `Group`**; `MenuBar`/`MenuPopup`/`StatusLine`/`Frame` extend `View`/`Group`
  — the disciplined-hybrid escape hatch (subclass + override `draw()`). (AR-30, AR-38)
- **Reflow drives re-inset** — drag/resize/zoom call `invalidateLayout()`; RD-03's reflow recomputes the
  window interior and child rects (AR-32/AR-33). (AR-74)
- **Owner scopes** — closing a window calls RD-03 `unmount` → `onCleanup`, leak-free (AR-36, AR-43).
- **Theme roles** resolve via `DrawContext.color(role)` (AR-35, AR-45).

### With `@jsvision/core` (done)

- **Host** — RD-05 owns the `createHost({ caps, onInput, onResize, onSuspend, onResume })` ↔
  loop wiring RD-04 (AR-49/AR-55) deferred to here; it relies on core's guaranteed terminal restore. (AR-71)
- **Theme** — the **only** core change: an additive active/inactive window role on `Theme` (AR-73).
- **Render/color/input** — output still flows through RD-03 → core `serialize`/`sanitize`; input arrives
  pre-decoded/bounded by the RD-06 decoder. No new parsing. (AR-71)

### With RD-06 (Essential controls — backlog)

- RD-06's controls (`Button`/`Input`/`ListView`/`Dialog`) populate RD-05's windows and the modal
  `execView`; `ScrollBar`/`Scroller` land there too (AR-69). No app-shell re-shape required.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Window-manager ambition | full interactive WM · move+raise+close · static frames | **full interactive WM** (raise · drag-move · zoom · cascade/tile · Alt-N · close) | the true TV desktop; exercises RD-04's machinery; the deferred raise lands | AR-67 |
| Menu subsystem depth | full nested menus · single-level · render+command only | **full menus** (nested popups, F10/Alt-hotkey/click, arrow/Enter/Esc nav, tilde accelerators, enable/disable) | Tier-0 per component map; the demo shows live menus | AR-68 |
| Scroller/ScrollBar scope | defer both to RD-06 · ScrollBar only · both now | **defer both to RD-06** (pair with ListView virtual scroll) | ScrollBar is decorative without Scroller; Scroller needs a scrollable widget | AR-69 |
| Demo & acceptance vehicle | both headless+real-TTY · headless only · real-TTY only | **both** (`demo:shell` headless ASCII + a real-TTY interactive demo) | deterministic CI acceptance + manual proof of live `run()` | AR-70 |
| `run()` / termination | quit command→exit code · last window closed · either | **`'quit'` command → `Promise<number>` exit code** (createHost wiring; restore on every path) | the TV cmQuit model; explicit, single termination path; last-window-close is app policy | AR-71 |
| StatusLine dynamics | static + enable/disable · context-sensitive ranges | **static list + command enable/disable greying**; defer help-context ranges | covers the demo without a new help-context concept | AR-72 |
| Active/inactive frame theming | add role to core Theme · derive UI-side · no distinction | **add an additive active/inactive window role to core `Theme`** | core owns theming; one source of truth; matches RD-01/RD-03 additive-core pattern | AR-73 |
| Window resize | free drag-resize + zoom · zoom only | **free drag-resize (SE corner) + zoom** | completes the full interactive WM (AR-67); TV-faithful grow | AR-74 |
| Application composition | compose EventLoop+host+chrome · subclass a base Program | **composition over inheritance** (`createApplication` composes loop/desktop/menu/status) | component map §2 ("composition, not inheritance"); avoids the TV MI chain | AR-75 |
| Standard command vocabulary | constants module · bare string literals | **a `Commands` constants module** (quit/close/zoom/next/prev/cascade/tile; `resize`/`move` deferred — PF-004) | discoverable, refactor-safe, avoids stringly-typed binds | AR-76 |
| Menu/status hotkey convention | tilde `~X~` marker · explicit hotkey field | **tilde `~X~` marker** (TV-faithful; already in the component map builder sketch) | one in-string convention for label+hotkey, matches the prior art | AR-77 |
| Raise semantics | click raises to top + focuses · focus only | **click raises the window to the top of z-order and focuses it; active = top-most focused** | the piece RD-04 (AR-50) named as RD-05's; defines "active window" | AR-78 |
| Modal windows | reuse RD-04 execView/endModal · build a rich Dialog now | **reuse `execView`/`endModal`; rich `Dialog` → RD-06** | the modal mechanism already exists; the Dialog widget is a control (RD-06) | AR-79 |
| Desktop background | core theme `desktop` role + pattern · bespoke fill | **core theme `desktop` role + `pattern` fill** | the role already exists in `defaultTheme`; reuse, don't reinvent | AR-80 |
| Packaging | pure TS, zero deps, explicit re-exports · barrel `export *` | **pure TS, zero runtime deps, ESM/NodeNext, explicit named re-exports** | inherits the package convention (check:deps, layout convention AC-18) | AR-81 |

> **Traceability:** every decision references its Ambiguity Register entry
> (`00-ambiguity-register.md`, AR-67…AR-81). AR-67…AR-74 are explicit user choices (made in the RD-05
> `add_requirement` interview, 2026-06-30); AR-75…AR-81 are single-dominant-option decisions recorded
> for traceability.

---

## Security Considerations

> An in-process windowing/menu shell over a developer-authored view tree, driven by `@jsvision/core`'s
> host + decoder. RD-05 is the first RD to touch the real TTY, but it does so **only** through core's
> already-hardened `createHost` (guaranteed restore, bounded modes) — it adds no new untrusted-input
> surface and no network/persistence. Most categories are N/A and recorded as such honestly.

- **Data sensitivity**: none — operates on developer-provided views, decoded events, and command
  strings; no PII, credentials, or persistence in RD-05.
- **Input validation**: input arrives as the decoder's typed `InputEvent` union (already bounding paste
  size and resynchronising on malformed sequences, RD-06); RD-05 treats degenerate coordinates
  (off-desktop drags, out-of-range window numbers, clicks on empty space) as clamped no-ops and never
  throws. Drag/resize geometry is clamped to the desktop and to a window minimum size.
- **Injection risks**: RD-05 emits **no** terminal output itself — all glyphs (titles, menu labels,
  status text, the desktop pattern) reach the screen via RD-03's `DrawContext` → core
  `ScreenBuffer`/`serialize`/`sanitize` boundary, so terminal-escape injection through a developer-set
  window title or menu label remains guarded exactly as in RD-03. Command names are opaque string keys
  compared by equality — no `eval`, no shell/SQL/filesystem surface.
- **Authentication & authorization**: N/A (in-process library, no access boundary).
- **Availability**: every interaction (a drag step, a menu key, a command) is a single bounded pass over
  a finite tree + one coalesced flush (RD-04 AR-54). A handler that throws in `onEvent`/`draw` is
  isolated and logged via the injectable screen-safe logger (RD-03 AR-42 / RD-04 AR-66) so one bad
  widget cannot wedge the loop. **Crucially, `run()` guarantees `host.stop()` (full terminal restore) on
  every exit path — normal quit, thrown error, or signal — so a crash never leaves the user's terminal
  in raw/alt-screen state** (AR-71). The reactive layer inherits RD-01's 1000-iteration runaway guard.
- **Encryption / rate limiting / infrastructure**: N/A.

---

## Acceptance Criteria

1. [ ] **App composition** — `createApplication({ caps })` returns an `Application` exposing `desktop`,
   `loop`, and `run()`, composing (not subclassing) the RD-04 `EventLoop` with a menu-bar row, desktop,
   and status-line row laid out full-screen. (AR-71, AR-75)
2. [ ] **`run()` host wiring** — `run()` builds core's `createHost`, routes `onInput → dispatch` and
   `onResize → resize`, paints the first frame, and (with an injected fake runtime) a synthetic input
   stream drives focus/commands/frames with no real TTY. (AR-71)
3. [ ] **Quit → exit code** — emitting `'quit'` resolves `run()` with the exit code (`0` by default,
   or the numeric `emitCommand('quit', code)` arg — PF-005); the app stops dispatching afterward. (AR-71, AR-76)
4. [ ] **Restore on every exit path** — `host.stop()` (cooked mode, main screen, cursor) runs on normal
   quit **and** on an **escaping** throw (an uncaught exception caught by core's host backstop, or an
   error in `run()`'s own lifecycle) or signal; a test asserts restore happened on that path. (A view
   handler's `onEvent`/`draw` throw is **isolated** by the RD-04 loop — AR-66 — and does **not** end the
   run, so it is *not* a restore trigger.) (AR-71)
5. [ ] **Suspend / resume** — on SIGCONT core's host re-asserts modes and full-repaints its last
   buffer **before** firing `onResume`; a test asserts the host performed the mode re-assert + repaint
   and that RD-05's `onResume` hook does not duplicate them (PF-002). (AR-71)
6. [ ] **Desktop background** — the desktop fills its area with the core theme `desktop` role + pattern;
   windows compose over it back-to-front in child (z) order. (AR-80, AR-67)
7. [ ] **Raise on click** — a mouse-down in a non-top window raises it to the top of z-order (it now
   paints over its former coverers) **and** focuses it; `activeWindow()` returns it. (AR-67, AR-78)
8. [ ] **Drag-move** — dragging a window's title bar repositions the window by the drag delta, clamped to
   the desktop; releasing ends the drag. (AR-67)
9. [ ] **Free drag-resize** — dragging the lower-right corner resizes the window to an arbitrary size
   (≥ a minimum), and its content reflows to the new interior. (AR-74)
10. [ ] **Zoom toggle** — the zoom box / `zoom` command maximizes the window to fill the desktop and
    toggles back to the exact restored geometry. (AR-67)
11. [ ] **Cascade / Tile** — `cascade` staggers all non-modal windows from the top-left; `tile` packs
    them into a grid filling the desktop, clamping cells to the window minimum (a zoomed window is
    un-zoomed first); 0 windows is a no-op and 1 window fills the desktop (PF-006). (AR-67)
12. [ ] **Window switching** — `next`/`prev` (and Alt-`N`) cycles focus across windows, raising the
    newly-active one. (AR-67)
13. [ ] **Close** — closing a window removes it from the desktop and disposes its owner scope (its
    `onCleanup` fires); the next window becomes active. (AR-67, AR-71)
14. [ ] **Frame chrome** — a window draws its border, centered title, number, close box, zoom box, and
    resize corner; clicking the close/zoom boxes triggers close/zoom. (AR-67, AR-74)
15. [ ] **Active/inactive frame theming** — the active (top-most focused) window's frame renders in the
    active role and background windows in the inactive role, driven by the additive core `Theme` role;
    raising a window flips the two affected frames' styling. (AR-73)
16. [ ] **Menu builders + activation** — `menuBar([subMenu('~F~ile', [item('E~x~it', Commands.quit,
    'Alt+X'), separator()])])` builds the bar; F10, a title click, and `Alt+F` each open the File menu. (AR-68, AR-77)
17. [ ] **Nested menu navigation** — in an open popup, ↑/↓ move the highlight (skipping
    separators/disabled), Enter emits the highlighted item's command and closes the menu, ←/→ switch
    top-level menus, Esc closes one level, and a `subMenu` item opens a nested child popup. (AR-68)
18. [ ] **Menu/status command + enable/disable** — activating an item emits its command through the loop;
    an item whose command is disabled (`enableCommand(name,false)`) renders greyed and does not
    activate; re-enabling restores it. (AR-68, AR-72)
19. [ ] **Status line** — `statusLine([statusItem('~Q~uit', Commands.quit, 'Alt+X')])` draws the item;
    a click or its accelerator emits `quit`; a disabled item greys. (AR-72, AR-77)
20. [ ] **One frame per interaction** — a drag step, a menu key, or a command cascade each produces
    exactly one `RenderRoot.flush()` (inheriting RD-04 AR-54). (AR-71)
21. [ ] **Packaging** — RD-05 imports nothing beyond the package, its workspace dep `@jsvision/core`, and
    Node built-ins (`yarn check:deps` passes); `createApplication`/`Desktop`/`Window`/`MenuBar`/
    `StatusLine`/the builders/`Commands` are importable from `@jsvision/ui`; the additive core `Theme`
    change is the only cross-package edit. (AR-73, AR-81)
22. [ ] **Demos** — the headless `demo:shell` runs a deterministic windowed-desktop walkthrough
    (open/raise/drag/zoom a window, drop a menu, fire a command) printing ASCII frames; the real-TTY
    interactive demo launches a live windowed app via `run()` that quits with the terminal restored. (AR-70)

---

> **Next step:** run the make_plan skill on RD-05 to produce the implementation plan, then preflight,
> then exec_plan — the same path RD-01…RD-04 followed.
