# RD-03: View/Group Spine + DrawContext + Theming

> **Document**: RD-03-view-group-spine.md
> **Status**: Draft
> **Created**: 2026-06-29
> **Project**: jsvision UI (`@jsvision/ui`)
> **Depends On**: RD-01 (Reactive core — done; **+ one small additive primitive `runWithOwner`**, AR-43), RD-02 (Layout engine — done), `@jsvision/core` (render/color/safety — done)
> **CodeOps Skills Version**: 2.0.0
> **Downstream extension**: RD-05 (app shell) adds an additive `DrawContext.role<K>(name): Theme[K]` raw-role accessor (so chrome can read role-only extras `pattern`/`border`/`title` that `color()` flattens to `{fg,bg}`) — required by the desktop pattern + frame theming. Designed in `plans/app-shell/03-00-foundation-extensions.md` (Phase 0 / PA-16); `color()` is unchanged.

---

## Feature Overview

The view/group spine is the **keystone of Phase 0**: the first layer of `@jsvision/ui`
that binds the two UI-independent pillars — RD-01 (reactivity) and RD-02 (layout) — into
a **retained widget tree** that draws itself onto core's `ScreenBuffer`. Everything after
it (windows, controls, dialogs, the app shell) is built on this spine.

It reimagines Turbo Vision's `TView`/`TGroup`/`TDrawBuffer`/`TPalette` as idiomatic
TypeScript: persistent objects that keep identity between frames (a **retained tree**, no
virtual DOM), each with a `draw(ctx)` method and a clipped paint API. Per the
**disciplined-hybrid** model, subclassing `View` and overriding `draw()` is the escape
hatch for custom widgets; reactivity is a widget-attribute feature (`bind`); structure
changes go through RD-01's `Show`/`For`; color resolves through named theme roles.

RD-03 closes the two seams the pillars deliberately left open:

- **Reactive seam (closes AR-09)** — RD-01 stopped at "here are effects" and left "what
  does *mark this widget dirty* mean" to the view layer. RD-03 closes it: each `View` owns
  an RD-01 owner scope and a `bind()` helper that re-invalidates the view when a tracked
  signal changes (AR-31), and a coalescing scheduler turns invalidation into a single
  recomposed frame (closes AR-02, AR-32).
- **Layout seam** — RD-02 produces rects from a `LayoutBox` tree but knows nothing about
  views. RD-03 owns the **reflow pass**: it builds the box tree *from* the view tree, runs
  `layout(root, viewport)`, and writes the resulting parent-relative rects back onto each
  view's `bounds` (AR-33).

**Scope boundary (AR-30):** RD-03 ships the **complete** `View`/`Group` class *shape* —
including an overridable `onEvent` stub and the `state` flags (`visible`/`disabled`/
`focused`) it needs to draw correctly — but the **event-dispatch and focus-traversal
logic** belong to **RD-04**. RD-03 is the structure, layout, paint, reactivity, and theming
spine; it is independently renderable (the Phase-0 demo target — a laid-out, themed,
reactive view tree — without yet needing the event loop).

Complexity: **XL** (the retained tree + the reactive-invalidate/coalesced-repaint loop +
the reflow pass + clipped composition interplay is the make-or-break layer of the project).

---

## Functional Requirements

### Must Have

#### The retained tree

- [ ] **`View` (abstract base node)** — the retained tree node: a parent-relative
  `bounds: Rect`, `state` flags (`visible`/`disabled`/`focused`), `layout: LayoutProps`,
  an optional `measure`, an overridable `draw(ctx: DrawContext): void`, an overridable
  `onEvent(ev): void` **stub** (no dispatch logic in RD-03), and lifecycle (`onMount`/
  `onCleanup`). Subclassing + overriding `draw()` is the custom-widget escape hatch.
  (AR-30, AR-40)
- [ ] **`Group` (concrete container)** — owns ordered `children`, composites their drawing
  into the parent (clip+offset), fills an optional background theme role so overlap never
  leaks stale cells, and is the basic flex container (carries `LayoutProps`). It is the one
  concrete view in RD-03. (AR-38, AR-40)
- [ ] **Parent/child wiring** — adding a child sets its parent and creates/nests its owner
  scope **under the parent's** scope at add-time, via RD-01's `runWithOwner(owner, fn)`
  primitive (AR-43); removing a child (or unmounting via `Show`/`For`) disposes the
  child's scope, recursively disposing descendants and running their `onCleanup` — leak-free
  by construction. (AR-36, AR-43)
- [ ] **Z-order = child order** — within a `Group`, paint order is child-array order
  (back-to-front); explicit raise/lower is RD-05 (window management). (AR-38, AR-42-adjacent)

#### Reactivity (the AR-09 seam)

- [ ] **Per-view owner scope** — each `View` gets an RD-01 owner scope when it is wired into
  a parent (`Group.add`, `Show`/`For` mount), created **under the parent's** scope via RD-01's
  `runWithOwner` (the root view's scope is created by `RenderRoot.mount` under the root scope).
  Disposing the view disposes every computation/effect created under it and runs its
  `onCleanup`. RD-01's plain `createRoot` nests under the *ambient* owner, which is not the
  parent for an imperatively-added child — hence the explicit-parent `runWithOwner` seam. (AR-31, AR-36, AR-43)
- [ ] **`view.bind(reader, apply?)`** — binds a reactive property: creates an `effect`
  under the view's scope that reads `reader()` (tracking its signals) and runs `apply(value)`
  then `this.invalidate()` whenever a tracked signal changes; auto-disposed on unmount. This
  is the canonical way a widget makes an attribute reactive. A bind defaults to **repaint
  only**; a binding to a layout-affecting/auto-measured property must request a reflow — either
  `bind(reader, apply, { relayout: true })` or by calling `this.invalidateLayout()` inside
  `apply`. (AR-31, AR-46, PF-005)
- [ ] **`view.invalidate()`** — marks the view as needing repaint and schedules a flush.
  A separate **relayout** request (e.g. a layout-affecting prop changed) marks the view as
  needing reflow; relayout and repaint are **distinct dirty-phases** so a draw-only change
  never triggers a full reflow. (AR-32, AR-33)

#### The redraw pump (closes AR-02)

- [ ] **Coalescing scheduler** — `invalidate()` adds the view to a dirty set and schedules
  **one** flush per tick; many invalidations within a tick coalesce into a single frame.
  The scheduler is **injectable** (default `queueMicrotask`) so RD-04's event loop can drive
  flushes deterministically later. (AR-32)
- [ ] **Frame flush** — a flush (1) runs any pending reflow (see below), then (2)
  recomposes dirty subtrees into the shared `ScreenBuffer`. Producing the minimal output
  bytes is core's `serialize()` damage-diff — RD-03 composes into the buffer; emitting/
  writing to a stream is the render root's seam to the host (RD-04/RD-05). (AR-32, AR-38)

#### The layout seam (reflow pass)

- [ ] **Reflow pass** — RD-03 builds a `LayoutBox` tree from the view tree (each `View`'s
  `props` = its `layout`, `children` = its child views, `measure` defers to the widget),
  calls RD-02 `layout(root, viewport)`, and writes each resulting parent-relative `Rect`
  back onto the corresponding `view.bounds`. (AR-33)
- [ ] **Reflow triggers** — reflow runs on viewport resize and on structural change (child
  add/remove, `Show`/`For` flip) or when a view marks itself needing relayout (e.g. a
  measured size changed). A repaint-only invalidation does **not** reflow. (AR-32, AR-33)
- [ ] **`visible:false` ⇒ `display:none`** — an invisible view is skipped in draw **and**
  omitted from the `LayoutBox` tree, so its siblings reflow to fill the freed space. (AR-41)

#### Painting & composition

- [ ] **`DrawContext` (stateless, clipped facade)** — the object handed to `draw(ctx)`.
  A stateless, view-local API mirroring `ScreenBuffer` essentials: `text(x,y,str,style?)`,
  `fill(char, style?)` / `fillRect(x,y,w,h,char,style?)`, `box(...)`, `shadow(...)`, and
  `color(role) → Style`. Coordinates are **view-local** (origin = the view's top-left);
  the context offsets to the view's absolute position and **clips** to the view's rect ∩
  ancestor rects. Writes outside the clip are silently dropped. (AR-38, AR-39)
- [ ] **Bounds-clip + back-to-front composition** — children paint within their clip,
  back-to-front; an overlapping later sibling/window overpaints an earlier one (correct
  overlap). No sibling cover-detection in v1 — core's `serialize()` only emits changed
  cells, so overpaint is free. (AR-34, AR-38)
- [ ] **Draw-error isolation** — if a view's `draw()` throws, the spine catches it, logs
  via core's screen-safe logger (`createLogger`), skips that view's subtree, and finishes
  the frame. One crashing widget never blanks the app. (AR-42)

#### Theming

- [ ] **One app-level theme** — the render root holds a single theme (core's `Theme`
  shape; default `defaultTheme`). (AR-35)
- [ ] **`ctx.color(role)`** — resolves a named theme role (e.g. `'window'`, `'button'`,
  `'buttonFocused'`) to a `Style` (fg/bg/attrs) at draw time, via core's color subsystem.
  Widgets pick the **state-dependent role themselves** (`this.focused ? 'buttonFocused' :
  'button'`); RD-03 only resolves names. (AR-35)

#### Render root

- [ ] **Render root** — a small object that owns the root view, the `ScreenBuffer`, the
  viewport size, the active theme, the dirty set, and the scheduler; exposes
  `mount(rootView)`, `resize(size)` (triggers reflow), and a `flush()`/serialized-frame
  seam. This is what makes the spine independently renderable for the Phase-0 demo and is
  the injection point RD-04/RD-05 wire to the host. (AR-32, AR-38)

#### Packaging

- [ ] **Packaging** — pure TypeScript, no third-party/native runtime dependencies (only
  Node built-ins + the declared workspace dep `@jsvision/core`); ESM/NodeNext; lives in
  `packages/ui/src/view/` and is re-exported through the single `@jsvision/ui` entry point;
  `yarn check:deps` passes. (AR-37)

### Should Have

- [ ] **`Point` + geometry helpers** — `Point` plus pure helpers (`intersect`, `translate`,
  `contains`) over the reused `Rect`/`Size2D` interfaces, for clip math. (AR-37)
- [ ] **`onMount` hook** — a lifecycle callback fired when a view enters the live tree
  (after its first reflow), for post-mount widget setup. (AR-36)
- [ ] **Per-subtree theme seam** — `DrawContext` carries the active theme so a future
  per-`Group` theme override is a non-breaking addition. (AR-35)

### Won't Have (Out of Scope)

- **Event dispatch, focus traversal, modality, commands** — the `onEvent` **logic**, focus
  chain, 3-phase dispatch, `execView`, and command routing are **RD-04**. RD-03 ships only
  the overridable `onEvent` stub + the `focused` state flag. (AR-30)
- **Leaf widgets** (`Text`, `Label`, `Button`, `Input`, …) — first controls land in RD-06;
  RD-03 acceptance uses test `View` subclasses + the demo. (AR-40)
- **Windows, frames, scrollbars, desktop, menu/status** — RD-05 (app shell). RD-03 is the
  generic spine they are built on. (component map §3, §5)
- **Sibling occlusion / cover-detection (`exposed()`)** — deferred optimization; back-to-
  front paint + damage-diff already give correct, efficient output. (AR-34)
- **Per-subtree theme override (live)** — only the seam ships in v1; the inheritance
  mechanism is deferred until a widget needs it. (AR-35)
- **`visibility:hidden` (space-reserving hide)** — only `display:none` ships; a space-
  reserving variant can be added later as a separate prop. (AR-41)
- **Mouse hit-testing** — depends on the event model; RD-04. (component map §1)

---

## Technical Requirements

### Public API surface

```ts
import type { Style, Theme, CapabilityProfile } from '@jsvision/core';
import type { Rect, Size2D, LayoutProps } from '../layout/index.js'; // intra-package reuse from RD-02 (AR-37, PF-004)

/** A point in integer cells. */
interface Point { x: number; y: number; }

/** Named theme role — the resolvable surface keys. RD-03-owned (core has no such type, PF-003). */
type ThemeRoleName = keyof Theme; // 'desktop' | 'menuBar' | 'window' | 'button' | 'buttonFocused' | …

/** View state flags drawn-against in RD-03; focus/disabled are driven by RD-04 (AR-30). */
interface ViewState {
  visible: boolean;   // false ⇒ display:none — skipped in draw AND layout (AR-41)
  disabled: boolean;  // widget chooses a dimmed role; no dispatch effect until RD-04
  focused: boolean;   // set by RD-04; RD-03 only reads it to pick a role (e.g. buttonFocused)
}

/** The clipped, view-local, stateless paint API handed to draw() (AR-39). */
interface DrawContext {
  text(x: number, y: number, str: string, style?: Style): void;
  fillRect(x: number, y: number, w: number, h: number, char: string, style?: Style): void;
  fill(char: string, style?: Style): void;             // fill the whole view rect
  box(x: number, y: number, w: number, h: number, style?: Style, title?: string): void;
  shadow(x: number, y: number, w: number, h: number, style?: Style): void;
  color(role: ThemeRoleName): Style;                   // resolve a named theme role → Style (AR-35; adapter PF-003)
  readonly size: Size2D;                               // the view's content size, in cells
}

/** The retained-tree base node (abstract). Subclass + override draw() for custom widgets. */
abstract class View {
  bounds: Rect;                                        // parent-relative; written by reflow (AR-33)
  readonly state: ViewState;
  layout: LayoutProps;                                 // RD-02 props for this view (AR-33)
  measure?(available: Size2D): Size2D;                 // auto/content sizing seam (AR-33)

  abstract draw(ctx: DrawContext): void;
  onEvent(ev: unknown): void;                          // stub in RD-03; logic in RD-04 (AR-30)

  invalidate(): void;                                  // schedule a repaint (AR-32)
  invalidateLayout(): void;                            // schedule a reflow (AR-33)
  bind<T>(reader: () => T, apply?: (v: T) => void, opts?: { relayout?: boolean }): void; // reactive property; relayout opt-in (AR-31, AR-46)

  onMount(fn: () => void): void;                       // fired when live (Should-Have, AR-36)
  onCleanup(fn: () => void): void;                     // RD-01 onCleanup on this view's scope
}

/** Concrete container: owns children, composites them, fills an optional bg role (AR-40). */
class Group extends View {
  children: View[];
  background?: ThemeRoleName;                           // optional fill role (AR-38)
  add(child: View): void;                               // wires parent + nests owner scope (AR-36)
  remove(child: View): void;                            // disposes child scope + descendants (AR-36)
  draw(ctx: DrawContext): void;                         // fills bg + composites children
}

/** Dynamic children reuse RD-01's Show/For specialized to View (N = View) (AR-36). */
// children may be static Views or reactive producers: Show<View>(...) / For<T, View>(...)

/** Owns the buffer(s), viewport, theme, dirty set, and (injectable) scheduler (AR-32, AR-38, AR-44). */
interface RenderRootOptions {
  theme?: Theme;                                        // default defaultTheme (AR-35)
  schedule?: (flush: () => void) => void;              // default queueMicrotask (AR-32)
  caps: CapabilityProfile;                              // REQUIRED by core serialize() for depth-aware encoding (AR-44, PF-002)
}
interface RenderRoot {
  mount(root: View): void;
  resize(size: Size2D): void;                          // triggers reflow (AR-33)
  flush(): void;                                        // force a synchronous frame
  serialize(): string;                                  // diff bytes vs the retained previous frame (core serialize, AR-44)
}
function createRenderRoot(size: Size2D, opts: RenderRootOptions): RenderRoot;
```

> `Theme`/`Style`/`CapabilityProfile` come from `@jsvision/core`; `ThemeRoleName` is
> RD-03-owned (`keyof Theme` — core exports no such type, PF-003). RD-03 also requires one
> small **additive** RD-01 primitive, `runWithOwner(owner, fn)`, exported through
> `@jsvision/ui`'s reactive surface (AR-43). Method signatures are indicative and finalized
> during planning.

### Behavior notes

- **Frame pipeline** — `invalidate()` → dirty set → scheduled flush → (reflow if any view
  needs relayout) → compose dirty subtrees into the `ScreenBuffer` → `serialize()` diff.
  Reflow and repaint are distinct phases (AR-32, AR-33).
- **Reflow** — builds a fresh `LayoutBox` tree each pass from the live (visible) view tree
  (`visible:false` views omitted, AR-41), calls `layout(root, viewport)`, and copies rects
  to `view.bounds`. RD-02's "fresh tree, distinct instances" precondition is satisfied by
  construction. (AR-33)
- **Composition** — each view draws into a `DrawContext` clipped to its rect ∩ ancestor
  rects and offset to its absolute origin; a `Group` first fills its `background` role (if
  set), then composites children back-to-front. All writes target the single shared
  `ScreenBuffer`. (AR-34, AR-38)
- **Reactivity** — `bind(reader, apply)` creates one `effect` under the view's owner scope;
  the effect's body reads `reader()` (subscribing), runs `apply` + `invalidate()`. Because
  the scope is nested under the parent, unmounting the parent disposes the effect — no
  leaks. (AR-31, AR-36)
- **Theming** — `ctx.color(role)` is a pure lookup into the root's `Theme` followed by a
  `ThemeRole → Style` adapter (map `fg`/`bg`, default `attrs`, ignore role-only extras such as
  `hotkey`/`border`/`title`); the widget owns role selection from its state. (AR-35, PF-003)
- **Frame buffering** — the render root retains the **previous** `ScreenBuffer` and composes
  the next frame into a current buffer, so `serialize(current, previous, { caps })` emits a true
  damage diff; the buffers swap each flush. The required `caps` is supplied at construction. (AR-44, PF-002)
- **Error isolation** — `draw()` is wrapped per view; a throw is logged via the screen-safe
  logger and that subtree is skipped, so the rest of the frame still composes. This
  deliberately differs from RD-01's effect-propagation policy (AR-15) — a render loop
  degrades gracefully. (AR-42)

---

## Integration Points

### With RD-01 (Reactive core — done)

- **Owner scopes** — each `View`'s scope is created **under its parent's** scope at add-time
  via RD-01's `runWithOwner(owner, fn)` (a small additive primitive this RD requires, AR-43),
  so `Show`/`For` unmount and `remove()` dispose cleanly (`onCleanup` fires). RD-01's plain
  `createRoot` nests under the *ambient* owner, which is not the parent for an imperatively-added
  child — `runWithOwner` is the explicit-parent seam. (AR-36, AR-43)
- **`bind`** — the reactive-property helper is a thin wrapper over `effect` +
  `view.invalidate()`; this is the concrete realization of RD-01's AR-09 seam. (AR-31)
- **`Show`/`For`** — reused with `N = View` for all dynamic structure; RD-03 adds no parallel
  reconciler. (AR-36)

### With RD-02 (Layout engine — done)

- **Reflow** — RD-03 maps the view tree to a `LayoutBox` tree and calls `layout(root,
  viewport)`; each `View` supplies `props` (its `layout`), `children`, and an optional
  `measure`. Rects come back parent-relative and are written to `view.bounds`. (AR-33)
- **Geometry reuse** — RD-03 imports `Rect`/`Size2D` (and `Padding`) from `@jsvision/ui`'s
  public surface rather than redefining them; it adds `Point` + clip helpers. (AR-37)

### With `@jsvision/core` (done)

- **Render** — composes into `ScreenBuffer` (`set`/`text`/`fillRect`/`box`/`shadow`) and
  emits frames via `serialize()`'s damage-diff. (AR-38, AR-39)
- **Color/theme** — resolves roles through the color subsystem against `Theme`/
  `defaultTheme`; `encode`/`encodeStyle` downsample to the active depth. (AR-35)
- **Safety** — `draw()`-error isolation logs through the screen-safe `createLogger`; the
  typed `TuiError` model is shared. (AR-42)

### With RD-04 (Event loop + focus — backlog)

- RD-04 extends the **already-final** `View` shape: it implements `onEvent` dispatch, drives
  the `focused`/`disabled` state flags, and may inject its event-loop tick as the render
  root's `schedule` driver for deterministic frames. No `View` re-shape required. (AR-30, AR-32)

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| RD-03/RD-04 boundary | complete shape, defer logic · pure structure spine | complete `View` shape (onEvent stub + state flags), logic in RD-04 | final base class, zero subclass churn; RD-03 needs `focused`/`disabled` to draw | AR-30 |
| Reactive seam (AR-09) | View scope + `bind()` · manual effects | View owns a scope + `bind()` helper | disciplined-hybrid DX, leak-free auto-dispose | AR-31 |
| Redraw pump (AR-02) | RD-03 coalescing scheduler (injectable) · RD-04 drives | RD-03 owns it, scheduler injectable | renders standalone now, composable later | AR-32 |
| Layout seam | RD-03 owns reflow · external | RD-03 owns the reflow pass | single owner of the RD-02↔RD-03 seam | AR-33 |
| Clipping/occlusion | bounds-clip only · cover-detection | bounds-clip + back-to-front; occlusion deferred | damage-diff neutralizes overdraw | AR-34 |
| Theming | one app theme · per-subtree override | one theme, `ctx.color(role)`; override deferred behind a seam | `defaultTheme` roles cover Phase 0; no premature inheritance | AR-35 |
| Dynamic children | reuse `Show`/`For` (N=View) · bespoke reconciler | reuse `Show`/`For`; nested scopes | one structure primitive, leak-free unmount | AR-36 |
| Geometry | reuse `Rect`/`Size2D` + helpers · `Rect` class | reuse interfaces + `Point` + pure helpers | DRY; RD-02 types already public | AR-37 |
| Composition | single shared buffer · per-view buffers | single `ScreenBuffer`, clip+offset | matches core's one-buffer + diff | AR-38 |
| `DrawContext` | stateless facade · stateful cursor | stateless, clipped, view-local facade | consistent with `ScreenBuffer` x,y API | AR-39 |
| Concrete surface | `View` abstract + `Group` concrete · ship leaf widgets | `View` abstract, `Group` concrete; no leaves | spine focus; controls cohere in RD-06 | AR-40 |
| `visible:false` | `display:none` · `visibility:hidden` | `display:none` — excluded from layout | matches TV `sfVisible`; common intent | AR-41 |
| `draw()` throws | isolate + log · propagate/abort | isolate + log, finish the frame | render loop degrades gracefully | AR-42 |
| Scope nesting (PF-001) | construction-time `createRoot` · explicit-parent `runWithOwner` | add a small additive RD-01 `runWithOwner(owner, fn)`; create child scopes under the parent at add-time | plain `createRoot` nests under the *ambient* owner, not the parent for an imperatively-added child — would leak | AR-43 |
| Render-root encoding (PF-002) | omit caps · carry `caps` + previous buffer | RenderRoot takes a required `caps: CapabilityProfile` and retains the previous `ScreenBuffer` | core `serialize(current, previous, { caps })` requires both; without them no frame can be emitted | AR-44 |
| Theme-role resolution (PF-003) | core `ThemeRoleName` type · `keyof Theme` + adapter | `ThemeRoleName = keyof Theme` (RD-03-owned); `color()` runs a `ThemeRole → Style` adapter | core exports no `ThemeRoleName`; roles are `{fg,bg,hotkey?}`, not `Style` | AR-45 |
| Bind & relayout (PF-005) | repaint-only `bind` · opt-in relayout | `bind` repaints by default; layout-affecting binds opt into a reflow (`{ relayout: true }` / `invalidateLayout()`) | a bound auto-measured prop would otherwise repaint with stale bounds | AR-46 |

> **Traceability:** every decision references its Ambiguity Register entry
> (`00-ambiguity-register.md`, AR-30…AR-46). AR-43…AR-46 resolve the RD-03 preflight findings
> PF-001/PF-002/PF-003/PF-005 (`00-preflight-report.md`).

---

## Security Considerations

> An in-process UI spine over developer-authored views: no network, no persistence, no
> untrusted-input parsing. Most categories are N/A and are recorded as such honestly. The
> one real surface is **output safety** to the terminal, which core already owns.

- **Data sensitivity**: none — operates on developer-provided view trees and theme data; no
  PII, credentials, or persistence in RD-03.
- **Input validation**: RD-03 consumes developer-authored views and signal values, not
  untrusted external input. Any *text content* a widget draws is ultimately rendered through
  core's render/`sanitize` boundary, which is the canonical injection guard against rogue
  control sequences (RD-08); RD-03 must route all glyph output through `ScreenBuffer`/
  `serialize()` and never emit raw escape sequences itself. Degenerate geometry (zero/
  negative bounds, oversized clips) resolves to clipped no-ops, never throws.
- **Authentication & authorization**: N/A (in-process library, no access boundary).
- **Injection risks**: terminal-escape injection is the only applicable class; it is
  prevented by drawing exclusively through the core buffer + `sanitize` boundary (no raw
  stream writes from RD-03). No SQL/HTML/shell/`eval`/filesystem surface exists.
- **Availability**: a frame flush is a single bounded pass over a finite tree; the reflow
  delegates to RD-02's bounded pass. Reactivity inherits RD-01's fixed 1000-iteration
  runaway guard (AR-18). Draw-error isolation (AR-42) prevents one widget from aborting the
  render loop. The coalescing scheduler bounds redraws to one frame per tick (AR-32).
- **Encryption / rate limiting / infrastructure**: N/A.

---

## Acceptance Criteria

1. [ ] **Retained tree** — a `Group` with child `View`s composes; children keep identity
   across frames (the same instances draw on the next frame). (AR-40)
2. [ ] **Reflow writes bounds** — after `mount` + `resize`, every view's `bounds` equals the
   `Rect` RD-02's `layout` computes for its `LayoutBox`; nested rects are parent-relative.
   (AR-33)
3. [ ] **`visible:false` ⇒ excluded from layout** — hiding a child makes its siblings reflow
   to fill the space, and the hidden view is not drawn. (AR-41)
4. [ ] **Clipped, view-local paint** — a view's `draw(ctx)` writing at local `(0,0)` lands at
   the view's absolute origin; writes beyond the view's rect (or an ancestor's) are dropped,
   not painted into a neighbor. (AR-39)
5. [ ] **Back-to-front overlap** — two overlapping siblings render with the later child on
   top (it overpaints the earlier one); no cover-detection is required for correctness.
   (AR-34, AR-38)
6. [ ] **`Group` background fill** — a `Group` with a `background` role fills its rect with
   that role's style before compositing children, so no stale cells show through on overlap.
   (AR-38)
7. [ ] **`bind` ⇒ repaint** — `view.bind(() => sig(), apply)` re-runs `apply` + repaints the
   view when `sig` changes, and only that view is recomposed (coalesced into one frame).
   (AR-31, AR-32)
8. [ ] **Coalescing** — N `invalidate()` calls within one tick produce exactly **one** flush
   (assert via an injected synchronous scheduler counting flushes). (AR-32)
9. [ ] **Relayout vs repaint** — a draw-only signal change repaints **without** running a
   reflow; a layout-affecting change (`invalidateLayout`) runs a reflow. (AR-32, AR-33)
10. [ ] **Injectable scheduler** — `createRenderRoot(size, { caps, schedule })` routes all flush
    scheduling through the injected function (no `queueMicrotask` when overridden). (AR-32)
11. [ ] **Owner-scope disposal** — removing a subtree (via `Group.remove` or a `Show`/`For`
    flip) disposes the descendants' scopes and runs their `onCleanup`; a signal that fed a
    removed view no longer triggers any work. (AR-36)
12. [ ] **`Show`/`For` with `N=View`** — `Show<View>`/`For<T, View>` mount/unmount view
    subtrees in a `Group`, reusing RD-01's primitives with no parallel reconciler. (AR-36)
13. [ ] **`ctx.color(role)` resolution** — `ctx.color('button')` and `ctx.color('buttonFocused')`
    resolve to the corresponding `defaultTheme` roles' styles; a widget selects the role from
    its `focused` state. (AR-35)
14. [ ] **Draw-error isolation** — a `View` whose `draw()` throws is logged via the screen-safe
    logger, its subtree is skipped, and the rest of the frame still composes (the other views
    render). (AR-42)
15. [ ] **`onEvent` stub only** — `View.onEvent` exists and is overridable but performs no
    dispatch/focus logic in RD-03 (that surface is RD-04). (AR-30)
16. [ ] **Output via core only** — all glyph output flows through `ScreenBuffer` + `serialize()`;
    RD-03 emits no raw escape sequences, preserving core's `sanitize` injection boundary.
    (Security §)
17. [ ] **Degenerate geometry** — a zero-size viewport / zero-size view / over-large clip
    produces clipped no-op draws and zero-size bounds without throwing. (Security §)
18. [ ] **Packaging** — RD-03 imports nothing beyond the package, its declared workspace dep
    `@jsvision/core`, and Node built-ins (`yarn check:deps` passes); `View`, `Group`,
    `DrawContext`, `createRenderRoot`, `Point` (and the reused `Rect`/`Size2D`) are importable
    from `@jsvision/ui`. (AR-37)
19. [ ] **Standalone render** — a render root can `mount` a small test view tree, reflow it,
    and produce a serialized frame **without** RD-04 (the Phase-0 spine demo). (AR-32, AR-40)
20. [ ] **Security verified** — no external-input/injection/auth surface beyond terminal
    output (guarded by the core `sanitize` boundary); frame + reflow are bounded passes;
    reactivity inherits the 1000-iteration runaway guard. (Security §)

---

> **Next step:** run the make_plan skill on RD-03 to produce the implementation plan, then
> preflight, then exec_plan — the same path RD-01 and RD-02 followed.
