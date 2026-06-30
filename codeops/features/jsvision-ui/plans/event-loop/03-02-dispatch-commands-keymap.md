# 3-Phase Dispatch, Commands & Keymap

> **Document**: 03-02-dispatch-commands-keymap.md
> **Parent**: [Index](00-index.md)

## Overview

The routing core: Turbo Vision's faithful 3-phase pre/focus/post dispatch with a `handled`
short-circuit, the typed command registry (enable/disable), and the core-`Keymap` key→command
binding. Covers AC-2, AC-9, AC-10, AC-11.

## Architecture

### 3-phase routing (`event/dispatch.ts`)

A keyboard/paste/command event flows through three phases over the live tree; the first handler to
set `ev.handled = true` halts everything after it (AR-51):

```
route(ev):                                       # ev: DispatchEvent
  if modal active: scopeRoot = top modal subtree # else scopeRoot = the mounted root (03-04)
  # resolve key→command first (consume; PA-1):
  if ev.event is KeyEvent and keymap.lookup(ev.event) is name:
     return emitCommand(name)                    # raw key NOT dispatched further (PA-1)

  # built-in focus traversal for an UNBOUND tab/shift+tab (consumed; PA-10/PF-003):
  if ev.event is KeyEvent and ev.event.key == 'tab':
     return ev.event.shift ? focus.prev() : focus.next()   # consumed; not also 3-phase-dispatched

  # mouse/wheel skip the 3-phase focus path → hit-test (03-03):
  if ev.event is MouseEvent|WheelEvent: return hitTestRoute(ev)

  # Phase 1 — pre-process, root→down (only within scopeRoot's subtree):
  for view in preOrder(scopeRoot) where view.preProcess: deliver(view, ev); if ev.handled: return
  # Phase 2 — focused leaf + focus-chain bubble (leaf→scopeRoot, CLAMPED — PA-12/PF-002):
  for view in [focusedLeaf, …ancestors up the current-chain, STOPPING AT scopeRoot]:
     deliver(view, ev); if ev.handled: return
  # Phase 3 — post-process (only within scopeRoot's subtree):
  for view in preOrder(scopeRoot) where view.postProcess: deliver(view, ev); if ev.handled: return

deliver(view, ev): try { view.onEvent(ev) } catch (e) { logger.error('event', …) }   # AR-66
```

- **Built-in Tab/Shift-Tab (PA-10/PF-003):** an unbound `tab` key drives `focus.next()`
  (`shift+tab` → `focus.prev()`) and is **consumed** (not also delivered to the 3-phase key path),
  so a real keystroke moves focus — matching AR-57. A `tab` chord **explicitly bound in the user
  keymap** wins (the keymap step above runs first, PA-1), so an app can repurpose Tab. (Per-view Tab
  interception — e.g. a future multiline control wanting a literal Tab — is an RD-06 concern, out of
  scope here where there are no controls.)
  > **Cross-layer note (PF-010/RT-1, resolved).** Plain **Tab** (`0x09` → `{key:'tab'}`) and
  > **Shift-Tab** both work end-to-end: core now decodes real backtab `ESC [ Z` → `{key:'tab',
  > shift:true}` (`keys.ts` `classifyCsi`, commit `d3d409d`) — earlier it dropped CSI final `Z`.
  > ST-04's shift+tab case still feeds a *synthetic* `{key:'tab', shift:true}` at the RD-04 layer
  > (as every RD-04 unit test uses synthetic events), but the event is genuinely producible from
  > live terminal bytes.
- **Paste / focus events (PF-011):** a `PasteEvent` is intentionally routed through the 3-phase
  machine (it reaches the focused view + pre/post sweeps, like a key). A `FocusEvent` (terminal
  focus in/out — distinct from widget focus) is **not** widget input; RD-04 takes it through the
  same default 3-phase path (handlers ignore kinds they don't care about), and app-level
  focus-in/out policy is an RD-05 concern. No special-casing in `route` beyond the key/mouse/wheel
  branches above.
- **pre-order, root→down** for pre/post sweeps (accelerators/menu-hotkeys see events before the
  focused view; default/cancel buttons after). `preProcess`/`postProcess` are the PA-2 booleans.
  Both sweeps are confined to `scopeRoot`'s subtree, so a modal makes the outer tree inert (AR-53).
- **Phase 2** walks the focus chain leaf→`scopeRoot`: the focused leaf first, then its ancestor
  `Group`s up to **and including** `scopeRoot`, then **stops** (the chain is the per-group `current`
  path, 03-03). The clamp at `scopeRoot` is PA-12/PF-002: without it the `parent`-pointer walk would
  cross a modal boundary up to the desktop/root and the outer tree would receive captured input,
  violating modal capture (ST-13). With no modal, `scopeRoot` is the mounted root, so the walk is the
  full leaf→root chain as before.
- A `CommandEvent` runs the **same** 3-phase machine (so a command can be handled pre/focus/post),
  except the key→command resolution step is skipped (it is already a command) (AR-52).

### Command registry (`event/commands.ts`)

```ts
interface CommandRegistry {
  emit(name: string, arg?: unknown): void;     // raise + 3-phase route, unless disabled
  enable(name: string, on: boolean): void;     // toggle; default-enabled is implicit (PA-3)
  isEnabled(name: string): boolean;            // unknown ⇒ true (enabled by default, PA-3)
}
```

- State is a single `Map<string, boolean>` of **explicit overrides**. `isEnabled(name)` returns the
  override if present, else `true` (unknown commands enabled by default, PA-3). `opts.commands`
  seeds the map with `true` (a documentation/introspection hint), but absence still means enabled.
- `emit(name, arg)`: if `!isEnabled(name)` → **drop** (no envelope, no dispatch, AR-52, PA-3);
  else build `CommandEvent { type:'command', command:name, arg }`, wrap in an envelope, and enqueue
  onto the current dispatch tick (cascade — 03-01).

### Keymap glue (`event/commands.ts`)

- `opts.keymap` is a core `Keymap` (from `createKeymap`, AR-62). In `route`, a `KeyEvent` is passed
  to `keymap.lookup(keyEvent)`; a non-`undefined` result is the bound command name → `emit(name)`
  and the raw key is **consumed** (not dispatched further, PA-1). An unbound key proceeds to the
  3-phase key path. A bound-but-disabled command drops the key (PA-1/PA-3).

## Implementation Details

### Public methods (on `EventLoop`)
- `emitCommand(command, arg?)` → `registry.emit` (raises + routes through `route`).
- `enableCommand(command, on)` → `registry.enable`.
- `isCommandEnabled(command)` → `registry.isEnabled`.

### Integration Points
- **Envelope/cascade (03-01):** `emit` enqueues onto the active tick; the single flush happens at
  drain.
- **Focus chain (03-03):** Phase 2 consumes the `current`-chain path + focused leaf.
- **Hit-test (03-03):** mouse/wheel branch.
- **Modal scope (03-04):** `scopeRoot` confines all phases to the top modal subtree when active,
  and the Phase-2 bubble is clamped to it (PA-12).

## Error Handling

| Error Case | Handling Strategy | AR Ref |
|------------|-------------------|--------|
| `onEvent` throws mid-phase | caught in `deliver`, logged, phase continues to next view | AR-66 |
| `emitCommand` on a disabled command | dropped before dispatch (no envelope) | AR-52, PA-3 |
| Bound key whose command is disabled | key consumed, command dropped (no fall-through to plain key) | PA-1, PA-3 |
| `keymap` undefined | every key takes the plain 3-phase key path (Tab still drives built-in traversal) | AR-62 |
| Command with no interested handler | routed, unhandled, tick completes (no error) | AR-52 |
| `tab`/`shift+tab` key, not keymap-bound | consumed → `focus.next()`/`focus.prev()`; not also 3-phase-dispatched | PA-10 |
| `tab` chord explicitly keymap-bound | keymap step wins (command), built-in traversal skipped | PA-1, PA-10 |
| Phase-2 bubble with a modal active | ancestor walk stops at the modal `scopeRoot` (outer tree inert) | PA-12, AR-53 |

> **Traceability:** see [00-ambiguity-register.md](00-ambiguity-register.md).

## Testing Requirements
- **Spec (ST-02,04,09,10,11):** 3-phase order + `handled` short-circuit; `emitCommand` routed
  3-phase; enable/disable + `isCommandEnabled` (incl. unknown ⇒ enabled); keymap consume (bound ⇒
  command only, unbound ⇒ plain key); **built-in Tab** — a dispatched unbound `tab`/`shift+tab`
  KeyEvent moves focus and is not also plain-dispatched (ST-04, PA-10).
- **Impl:** pre/post both-flag view visited in both sweeps; `handled` in pre skips focus+post; a
  command handled in post; re-enable restores dispatch; `opts.commands` seed introspection;
  disabled bound key drops; a `tab` chord bound in the keymap takes the command path (built-in
  traversal skipped, PA-10); **Phase-2 bubble stops at the modal `scopeRoot`** (PA-12).
