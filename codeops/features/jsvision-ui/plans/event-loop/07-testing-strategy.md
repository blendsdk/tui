# Testing Strategy — Event Loop + Focus + Modality + Commands

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)
> **CodeOps Skills Version**: 3.0.0

Specification-first (CLAUDE.md): write `*.spec.test.ts` from RD-04 acceptance criteria → confirm
red → implement → green → add `*.impl.test.ts` for internals/edges → verify. **Spec tests are
immutable oracles**: each ST below derives from an RD-04 AC (1:1) or a plan PA, never from
implementation behavior. If a spec test fails after implementation, the implementation is wrong.

Tests are vitest `unit` (`*.{spec,impl}.test.ts`) importing the API by name from
`../src/event/index.js` (or `@jsvision/ui` for the packaging spec); the demo is `e2e`. Tests use
**real** `View` subclasses + a **real** loop-built `RenderRoot` over a fixed `caps` (real objects,
not mocks). Synthetic `InputEvent`s drive `dispatch()`; the per-tick flush is asserted via a frame
counter (a spy wrapping the loop-built root's `flush`). Focus/`handled` are asserted via the public
surface + `state.focused`.

> **Flush-counter caveat (PF-006).** `renderRoot.mount()` calls `flush()` once internally (the
> initial paint, `render-root.ts:151`) and `serialize()` force-flushes a pending frame (`:213`).
> So install/reset the `flush` spy **after** `loop.mount(root)` and assert counts from the spy — not
> from `serialize()` deltas (reading `serialize()` would itself trigger a flush) — for the
> "exactly one flush per tick" oracles (ST-16/17/18/19).

## Specification test cases (ST → AC, 1:1)

| ST | File | Input → Expected | Trace |
|----|------|------------------|-------|
| ST-01 | event.loop.spec | `createEventLoop({80,24},{caps})` + `mount(tree)` + a synthetic `dispatch(keyEvent)` runs with **no** `createHost`/TTY — the loop drives behavior from `dispatch` alone | AC-1 / AR-49 |
| ST-02 | event.dispatch.spec | a key event visits **pre** (root→down) → **focused** (+focus-chain bubble) → **post** in that order (a spy records visit order); a handler setting `ev.handled=true` in an earlier phase stops all later phases/views from seeing it. *(The focused leaf is established by setting `Group.current` + `leaf.state.focused` directly — those data-model fields land in Phase 1; the focus **manager** that sets them lands in Phase 3, so this Phase-2 spec wires the chain by hand. PF-004.)* | AC-2 / AR-51 |
| ST-03 | event.focus.spec | `focusView(leaf)` sets `current` at **every** ancestor group so root→…→leaf; `getFocused()===leaf`; exactly `leaf.state.focused===true` and no other view's is | AC-3 / AR-48 |
| ST-04 | event.focus.spec | `focusNext()` advances to the next focusable sibling and `focusPrev()` the previous, **wrapping** at the ends; a hidden/disabled/`!focusable` sibling is **skipped**. **Built-in Tab (PA-10):** a dispatched unbound `tab` KeyEvent moves focus like `focusNext()` and `shift+tab` like `focusPrev()`, and the raw key is **not** also delivered to a plain-key handler spy. *(The `shift+tab` half constructs a synthetic `{key:'tab', shift:true}` at the RD-04 layer, like every RD-04 unit test; the event is producible end-to-end since core now decodes real backtab `ESC [ Z` — PF-010/RT-1, resolved.)* | AC-4 / AR-56, AR-57, PA-10 |
| ST-05 | event.focus.spec | a view is focus-eligible iff `visible && !disabled && focusable` (default `false`) **and** no `!visible`/`disabled` ancestor; toggling any factor flips eligibility; a `Group` is focusable iff it has a focusable descendant | AC-5 / AR-56, AR-65 |
| ST-06 | event.focus.spec | moving focus invalidates **exactly** the old + new focused views (their `focused`-dependent roles repaint) and coalesces into **one** flush | AC-6 / AR-48, AR-54 |
| ST-07 | event.mouse.spec | a `MouseEvent` at 1-based `(x,y)` (normalized to 0-based) is delivered to the **top-most** front-to-back view whose ancestor-clipped bounds contain the point; two overlapping siblings resolve to the later (on-top) one; the handler sees view-local `ev.local` | AC-7 / AR-50, AR-63 |
| ST-08 | event.mouse.spec | a mouse-`down` on a focusable view (or a descendant) moves focus to it (its `current` chain); a `down` on empty space steals **no** focus | AC-8 / AR-50, AR-57 |
| ST-09 | event.dispatch.spec | `emitCommand('ok')` raises a `CommandEvent` routed through the 3-phase machine; the nearest interested handler consumes it (sets `ev.handled`) | AC-9 / AR-52 |
| ST-10 | event.dispatch.spec | `enableCommand('save',false)` makes `emitCommand('save')` a **no-op** (not dispatched — a handler spy never fires); re-enabling restores dispatch; `isCommandEnabled` reflects state; an **unregistered** command dispatches (enabled by default) | AC-10 / AR-52, PA-3 |
| ST-11 | event.dispatch.spec | with `{ keymap: createKeymap({'ctrl+q':'quit'}) }`, a `ctrl+q` key raises the `'quit'` command **and the raw key is not also dispatched** (a plain-key handler spy never fires); an unbound key dispatches as a plain key | AC-11 / AR-52, AR-62, PA-1 |
| ST-12 | event.modal.spec | `const r = await execView(dialog)` blocks input to everything but `dialog`'s subtree; calling `endModal('ok')` resolves `r==='ok'` | AC-12 / AR-53 |
| ST-13 | event.modal.spec | while a modal is active, key/mouse/command events dispatch **only** within the top modal subtree; an outer view's `onEvent` receives nothing until the modal ends; a click outside the modal is ignored | AC-13 / AR-53, PA-6 |
| ST-14 | event.modal.spec | the outer focused view is **restored** when the modal closes (not reset to the first focusable) | AC-14 / AR-48, AR-53 |
| ST-15 | event.modal.spec | a second `execView` inside a modal **stacks**; each `endModal` resolves the matching promise in **LIFO** order, restoring each saved focus | AC-15 / AR-53 |
| ST-16 | event.loop.spec | one `dispatch` tick (an event plus the commands it cascades) causing M `invalidate()`s produces **exactly one** `RenderRoot.flush()` (frame counter == 1) | AC-16 / AR-54, AR-61, AR-64 |
| ST-17 | event.loop.spec | `loop.resize({100,40})` triggers a `RenderRoot.resize` (reflow) and **exactly one** subsequent frame | AC-17 / AR-54 |
| ST-18 | event.loop.spec | after a dispatch tick's cascade queue drains, the `onIdle` hook fires **once** | AC-18 / AR-58 |
| ST-19 | event.loop.spec | a test `View` whose `onEvent` throws is logged via the injected `EventLoopOptions.logger` (spy) and the loop **continues** dispatching/rendering (later phases + the flush still run) | AC-19 / AR-66 |
| ST-20 | event.packaging.spec | `createEventLoop`/`EventLoop`/`CommandEvent`/`DispatchEvent` import from `@jsvision/ui`; `yarn check:deps` passes; a dispatch + hit-test + flush are bounded single passes over a finite tree; no external-input/injection/auth surface (output guarded by RD-03→core `sanitize`) | AC-20 / AR-47, Security § |

> **AUTHORING RULE:** every expectation above is derived from the RD-04 AC / PA it traces to, not
> from imagined implementation output. The pre/post visit order (ST-02), the consume semantics
> (ST-11), the enabled-by-default default (ST-10), and the explicit-`endModal` modal flow (ST-12/15)
> come straight from AR-51 / PA-1 / PA-3 / PA-4.

## Test categories

### Specification tests (from ST-cases) — written BEFORE implementation

| Test File | ST Cases | Component |
|-----------|----------|-----------|
| `event.loop.spec.test.ts` | ST-01, 16, 17, 18, 19 | Loop assembly / frame ownership (03-01, 03-04) |
| `event.dispatch.spec.test.ts` | ST-02, 09, 10, 11 | 3-phase + commands + keymap (03-02) |
| `event.focus.spec.test.ts` | ST-03, 04, 05, 06 | Focus manager (03-03) |
| `event.mouse.spec.test.ts` | ST-07, 08 | Mouse hit-test (03-03) |
| `event.modal.spec.test.ts` | ST-12, 13, 14, 15 | Modality (03-04) |
| `event.packaging.spec.test.ts` | ST-20 | Packaging / security (03-04) |

### Implementation tests (`*.impl.test.ts`) — internals & edges (not exhaustive)

- **event.loop.impl:** deferring `schedule` never self-flushes; re-entrant `emitCommand` coalesces
  into one flush; `serialize()` reflects the single tick frame; `renderRoot` accessor returns the
  live root; `onEvent` retype compiles against an `onEvent(_ev: unknown)` subclass.
- **event.dispatch.impl:** a view flagged both `preProcess` + `postProcess` is visited in both
  sweeps; `handled` in pre skips focus+post; a command handled in the post phase; `opts.commands`
  seeding; a disabled **bound** key drops (no plain-key fall-through); a `tab` chord **bound in the
  keymap** takes the command path (built-in traversal skipped, PA-10); the **Phase-2 bubble stops at
  the modal `scopeRoot`** so an outer ancestor never receives a captured key (PA-12).
- **event.focus.impl:** save/restore on group re-entry; descending into a child `Group` focuses its
  `current` (or first focusable); `focusView` on a non-focusable view is a no-op; `focusNext` with
  zero focusable views is a no-op.
- **event.mouse.impl:** reverse-z overlap resolution; hidden/disabled subtree skipped in hit-test;
  `focusOnClick` climbs to the nearest focusable ancestor; off-tree point → null hit no-op.
- **event.modal.impl:** `endModal` empty-stack no-op; nested LIFO ordering; `savedFocus` no longer
  focusable on close (restore skipped, no throw); modal capture excludes the outer tree;
  **`execView` paints exactly one frame on open** (flush-spy count `== 1` for the open tick, read
  from the spy not `serialize()`) — even for a modal with no focusable child (PF-009).

> Packaging has **no separate `.impl`**: re-export shape, `check:deps`, and the bounded/no-injection
> checks are covered by ST-20 in `event.packaging.spec.test.ts`.

## E2E (demo, PA-9)

- `packages/examples/test/event-demo.e2e.test.ts`: spawns `demo:events` (as the probe/view-demo e2e
  does); asserts exit 0 and a non-empty themed ASCII frame across the Tab-focus → `Enter`→`'ok'` →
  modal `execView`/`endModal` walkthrough. Mirrors `view-demo`.

## Security tests (mandatory subset)

- **Injection boundary** (ST-20): RD-04 emits no raw escapes; all output flows through RD-03's
  `DrawContext`→core `serialize`/`sanitize`. Command names are opaque keys compared by equality (no
  `eval`/SQL/shell/fs).
- **Degenerate inputs** (ST-07/ST-20): off-tree hit-tests, out-of-range focus requests, unknown
  event kinds → no-ops, never throw.
- **Availability/bounded** (ST-16/ST-20): a dispatch is a single bounded pass (3-phase walk + ≤1
  hit-test + 1 coalesced flush); modal/focus state are bounded stacks/pointers; reactivity inherits
  RD-01's 1000-iteration runaway guard. No external-input/auth surface — categories N/A, recorded
  honestly (RD-04 §Security).

## Verification checklist
- [ ] ST-01…ST-20 defined with concrete input/output pairs, each traced to an AC/PA
- [ ] Spec tests written + confirmed **red** before implementation (per phase)
- [ ] All spec tests **green** after implementation; no spec test weakened to match code
- [ ] Impl tests added for internals/edges; security subset present
- [ ] `yarn verify` + `yarn test:e2e` + `yarn workspace @jsvision/ui check:deps` + `yarn lint` green
- [ ] No regressions in RD-01/RD-02/RD-03 suites; no `event/` file > 500 lines

## Verification commands
- Targeted: `yarn workspace @jsvision/ui test` (`test -- <file>` while iterating); demo via
  `yarn workspace @jsvision/examples test:e2e`.
- Full gate before done: `yarn verify` + `yarn test:e2e` + `yarn workspace @jsvision/ui check:deps`
  + `yarn lint`.
