# Component: The Retained Tree (`view.ts`, `group.ts`, `types.ts`)

> **Files**: `view.ts`, `group.ts`, `types.ts`
> **CodeOps Skills Version**: 2.0.0

The persistent `View`/`Group` node graph: identity across frames, per-view RD-01 owner scope,
the reactive `bind` helper, the two dirty-phase invalidators, and lifecycle. Dispatch/focus
**logic** is RD-04 — RD-03 ships the complete shape with an `onEvent` **stub** (AR-30).

## State & types (`types.ts`)

```ts
interface ViewState { visible: boolean; disabled: boolean; focused: boolean; }
// defaults: visible:true, disabled:false, focused:false
```

`visible:false` ⇒ `display:none` (skipped in draw + omitted from layout, AR-41). `disabled`
and `focused` are drawn-against by widgets (`this.focused ? 'buttonFocused' : 'button'`) but
carry **no dispatch effect** in RD-03; RD-04 drives them (AR-30).

## `View` (abstract base, `view.ts`)

```ts
abstract class View {
  bounds: Rect;                 // parent-relative; written by reflow; init {x:0,y:0,width:0,height:0}
  readonly state: ViewState;
  layout: LayoutProps;          // RD-02 props for this view
  measure?(available: Size2D): Size2D;

  abstract draw(ctx: DrawContext): void;
  onEvent(ev: unknown): void;   // STUB — no-op, overridable (AR-30)

  invalidate(): void;           // schedule a repaint of this view's subtree (AR-32)
  invalidateLayout(): void;     // schedule a reflow (AR-33)
  bind<T>(reader: () => T, apply?: (v: T) => void, opts?: { relayout?: boolean }): void; // (AR-31, AR-46)
  onMount(fn: () => void): void;
  onCleanup(fn: () => void): void;

  // internal seams (protected; set by the mount machinery)
  protected parent: View | null;
  protected scope: Owner | null;          // created at add/mount via runWithOwner (PA-1)
  protected disposeScope: (() => void) | null;
  protected root: RenderRoot | null;       // for dirty-set + scheduler + theme access
  protected mounted: boolean;
}
```

### Reactivity (`bind`, AR-31/AR-46/PA-2)

`bind` requires a **mounted** scope. Per PA-2 the canonical site is `onMount`:

```ts
bind(reader, apply, opts) {
  if (this.scope === null) throw new TuiError('view.bind() requires a mounted view; call it in onMount()');
  runWithOwner(this.scope, () => {
    effect(() => {
      const v = reader();          // subscribes to signals read here
      apply?.(v);
      if (opts?.relayout) this.invalidateLayout(); else this.invalidate();
    });
  });
}
```

- One `effect` per `bind`, created **under the view's scope** (so unmount disposes it — no
  leak). The effect's first run applies the initial value + schedules a frame.
- Default is **repaint** (`invalidate`); a layout-affecting/auto-measured property opts in with
  `{ relayout: true }` (or calls `this.invalidateLayout()` inside `apply`) — AR-46.
- Pre-mount `bind` throws a `TuiError` (fail-fast — a silently-dropped bind would leave the UI
  never updating, a worse footgun than the no-owner dev-warn, PA-2).

### Invalidation (two dirty-phases, AR-32/AR-33)

- `invalidate()` → `this.root?.markRepaint(this)` (adds the view to the dirty set + schedules a
  flush). No-op before mount (the first frame paints everything).
- `invalidateLayout()` → `this.root?.markRelayout()` (sets the root's reflow flag + schedules a
  flush). Reflow forces a full recompose (cached compose contexts are stale after layout moves).

### Lifecycle (`onMount`/`onCleanup`, AR-36)

- `onMount(fn)` registers `fn` to fire **once**, after the view's first reflow (when it is live
  and has bounds). Internally the render root drains pending `onMount` callbacks after each
  reflow for newly-mounted views.
- `onCleanup(fn)` registers `fn` on the view's scope (via RD-01 `onCleanup` under
  `runWithOwner(this.scope, …)`); it fires once when the scope is disposed (unmount).

## `Group` (concrete container, `group.ts`)

```ts
class Group extends View {
  children: View[];
  background?: ThemeRoleName;
  add(child: View): void;
  remove(child: View): void;
  draw(ctx: DrawContext): void;   // fills `background` role if set; children composited by the spine
}
```

### `add(child)` — parent/child wiring + scope nesting (AR-36, PA-1)

1. Set `child.parent = this`; push to `children` (array order = z-order, back-to-front, AR-38).
2. If **this Group is mounted**, mount the child subtree immediately:
   `mountView(child, this.root, this.scope)` — see below — and schedule a reflow (structural
   change, AR-33). If this Group is **not** yet mounted, defer: the child's scope/root are
   created when this Group itself mounts (recursive mount).

### `mountView(view, root, parentScope)` (the mount seam)

```
runWithOwner(parentScope, () =>
  createRoot((dispose) => {
    view.scope = getOwner();          // the fresh child scope, nested under parentScope (PA-1)
    view.disposeScope = dispose;
    view.root = root;
    view.mounted = true;
    if (view is Group) for (const c of view.children) mountView(c, root, view.scope);
  }));
// queue view.onMount to fire after the next reflow
```

Depth-first; children's scopes nest under their parent's, so disposing any subtree's scope
disposes all descendants (AC-11).

### `remove(child)` — disposal (AR-36)

`child.disposeScope?.()` — disposes the child's scope, recursively disposing descendant scopes
and running their `onCleanup` (RD-01 `dispose`, `owner.ts:104`) — then splice from `children`,
clear `child.parent/root/scope/mounted`, and schedule a reflow. A signal that fed a removed
view reaches no live computation afterward (AC-11).

### `draw(ctx)`

If `background` is set, `ctx.fill(' ', ctx.color(this.background))` paints the whole group rect
so overlap never leaks stale cells (AC-6, AR-38). **Children are not iterated here** — the
render root's compose walker draws the group's background (via this `draw`) then recurses into
the group's visible children in array order (03-04). This realizes AR-38's "Group composites
children" without coupling child iteration into `draw()` (keeps clip/offset centralized).

## `onEvent` stub (AR-30, AC-15)

`onEvent(ev: unknown): void {}` — present, overridable, no dispatch/focus logic. RD-04 extends
the same class to implement dispatch; no `View` re-shape (AR-30).

## Invariants (asserted by tests)

- Children are the same instances across frames (retained identity, AC-1).
- After `remove` (or a `Show`/`For` unmount), the descendants' `onCleanup` ran exactly once and
  their bound signals trigger no further work (AC-11).
- `onEvent` exists and is overridable but performs no dispatch (AC-15).

## Traceability

AR-30, AR-31, AR-36, AR-40, AR-43, AR-46 · PA-1, PA-2. ACs: 1, 11, 15 (+ feeds 7, 12).
