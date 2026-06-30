/**
 * The retained-tree base node (RD-03). A `View` is a persistent object that keeps identity
 * between frames: a parent-relative `bounds`, `state` flags, RD-02 `layout` props, an overridable
 * `draw(ctx)`, an `onEvent` stub (dispatch logic is RD-04, AR-30), the reactive `bind` helper
 * (AR-31/AR-46), the two dirty-phase invalidators (AR-32/AR-33), and owner-scope lifecycle
 * (AR-36). Subclass + override `draw()` for custom widgets (the disciplined-hybrid escape hatch).
 *
 * Owner-scope wiring uses RD-01's additive `runWithOwner` (AR-43, PA-1): a view's scope is created
 * **under its parent's** scope at mount, so disposing any subtree disposes every descendant's
 * computations and runs their `onCleanup` — leak-free by construction.
 */
import type { Owner, Signal } from '../reactive/index.js';
import { runWithOwner, untrack, createRoot, effect, onCleanup, getOwner, signal } from '../reactive/index.js';
import { TuiError } from '@jsvision/core';
import type { Rect, Size2D, LayoutProps } from '../layout/index.js';
import type { DrawContext, ViewState, DispatchEvent } from './types.js';

/**
 * The internal seam a `View` uses to talk to its render root: the dirty-set scheduler (RT-1). The
 * Phase-5 `RenderRoot` implements this. Declared here (not in `types.ts`) so the method signatures
 * can reference `View` without a type cycle.
 */
export interface ViewHost {
  /** Mark a view as needing repaint and schedule a flush (AR-32). */
  markRepaint(view: View): void;
  /** Mark the tree as needing reflow and schedule a flush (AR-33). */
  markRelayout(): void;
}

/**
 * Abstract retained-tree node. Concrete views subclass this and implement `draw`; `Group`
 * (the one RD-03 container) is the only built-in concrete subclass.
 */
export abstract class View {
  /** Parent-relative integer rect; written by the reflow pass (AR-33). */
  bounds: Rect = { x: 0, y: 0, width: 0, height: 0 };
  /** Draw-against flags (AR-30). The reference is fixed; fields mutate (e.g. RD-04 sets `focused`). */
  readonly state: ViewState = { visible: true, disabled: false, focused: false };
  /** RD-02 layout props for this view (AR-33). */
  layout: LayoutProps = {};
  /** Optional intrinsic-size seam for `auto` sizing (AR-33). */
  measure?(available: Size2D): Size2D;

  /**
   * When true, the compose walker paints a Turbo Vision-style drop-shadow on the cells just
   * below and to the right of this view's rect, in z-order (a later sibling's shadow falls over an
   * earlier one). Default `false`. The `Desktop` sets it per-window from its `shadow` flag.
   */
  castsShadow = false;

  // --- RD-04 dispatch surface (additive; defaults preserve RD-03 behavior) ----------------------
  /**
   * Focus eligibility (TV `ofSelectable`): a view is focusable iff
   * `visible && !disabled && focusable` AND it has no `!visible`/`disabled` ancestor (subtree
   * semantics, AR-56/AR-65). Default `false`. Driven by the RD-04 focus manager.
   */
  focusable = false;
  /** Participate in the pre-process sweep (root→down, before the focused chain) (AR-51, PA-2). */
  preProcess = false;
  /** Participate in the post-process sweep (after the focused chain) (AR-51, PA-2). */
  postProcess = false;

  /**
   * @internal Reactive focus-change tick (RD-06 PF-009). Lazily created by {@link focusSignal} the
   * first time a view's focus is observed; the focus manager pokes it on every focus flip. Stays
   * `undefined` (zero cost) for views nobody observes.
   */
  focusTick?: Signal<void>;

  /**
   * Subscribe to this view's focus changes (RD-06 PF-009). Reading the returned signal inside a
   * `bind`/`effect` re-runs that effect on every focus flip (the manager pokes `focusTick`), letting
   * one view react to **another** view's focus — `Label` repaints on its link's focus, `Input` runs
   * its blocking validator on its own focus-loss. The signal uses `equals: () => false`, so even a
   * same-value poke notifies. Lazy: the backing signal is created on first call.
   *
   * @returns A signal that ticks whenever this view gains or loses focus.
   */
  focusSignal(): Signal<void> {
    return (this.focusTick ??= signal(undefined, { equals: () => false }));
  }

  // --- Internal wiring (RT-1/RT-2/RT-3) ---------------------------------------------------------
  // Public-but-internal: it crosses the module boundary to the render root, so it is `public`
  // (project standard: prefer public/protected) and marked `@internal`. Not part of the API.
  /** @internal The parent view, or `null` at the root / before wiring. */
  parent: View | null = null;
  /** @internal This view's RD-01 owner scope, created at mount; `null` before mount. */
  scope: Owner | null = null;
  /** @internal Disposes this view's scope (the `createRoot` handle). */
  disposeScope: (() => void) | null = null;
  /** @internal The render-root seam; `null` until mounted by a render root. */
  host: ViewHost | null = null;
  /** @internal Whether the view is currently in the live tree. */
  mounted = false;

  private readonly pendingMounts: Array<() => void> = [];
  private mountFired = false;

  /**
   * Paint this view through a clipped, view-local context. Overridden by every widget; this is
   * the custom-widget escape hatch (AR-40).
   */
  abstract draw(ctx: DrawContext): void;

  /**
   * Event hook — a **stub** by default (AR-30): present and overridable but performing no dispatch
   * or focus logic. The RD-04 event loop wraps each event in a {@link DispatchEvent} envelope and
   * routes it 3-phase; a widget overrides this to handle input and set `ev.handled` to consume it.
   *
   * @param _ev The dispatch envelope (the wrapped event + the mutable `handled` flag).
   */
  onEvent(_ev: DispatchEvent): void {
    // intentionally empty (the base ships only the stub; widgets override)
  }

  /** Schedule a repaint of this view's subtree (AR-32). No-op before mount (the first frame paints all). */
  invalidate(): void {
    this.host?.markRepaint(this);
  }

  /** Schedule a reflow (AR-33). Relayout and repaint are distinct dirty-phases. */
  invalidateLayout(): void {
    this.host?.markRelayout();
  }

  /**
   * Bind a reactive property: create an `effect` under this view's scope that reads `reader()`
   * (subscribing to its signals), runs `apply(value)`, then schedules a frame — a repaint by
   * default, or a reflow when `{ relayout: true }` (AR-31, AR-46). Auto-disposed on unmount.
   *
   * Requires a mounted view (its scope exists): per PA-2 the canonical call site is `onMount`.
   * A pre-mount `bind` throws (fail-fast — a silently-dropped bind would leave the UI never
   * updating).
   *
   * @param reader  Reads the reactive source (its signal reads subscribe the effect).
   * @param apply   Applies the read value to the widget (optional).
   * @param opts    `{ relayout: true }` to reflow instead of repaint (layout-affecting props).
   */
  bind<T>(reader: () => T, apply?: (v: T) => void, opts?: { relayout?: boolean }): void {
    if (this.scope === null) {
      throw new TuiError('view.bind() requires a mounted view; call it in onMount()');
    }
    runWithOwner(this.scope, () => {
      effect(() => {
        const value = reader();
        apply?.(value);
        if (opts?.relayout === true) this.invalidateLayout();
        else this.invalidate();
      });
    });
  }

  /**
   * Register a callback to fire once when the view becomes live (after its first reflow gives it
   * bounds, AR-36). Registering after the view is already live runs the callback immediately.
   *
   * @param fn Post-mount setup (the canonical site for `bind`).
   */
  onMount(fn: () => void): void {
    if (this.mountFired) {
      fn();
      return;
    }
    this.pendingMounts.push(fn);
  }

  /**
   * Register a teardown callback on this view's scope; it fires once when the scope is disposed
   * (unmount). Requires a mounted view.
   *
   * @param fn The teardown callback.
   */
  onCleanup(fn: () => void): void {
    if (this.scope === null) {
      throw new TuiError('view.onCleanup() requires a mounted view; call it in onMount()');
    }
    runWithOwner(this.scope, () => onCleanup(fn));
  }

  /**
   * @internal Mount this view: create its owner scope **under `parentScope`** via `runWithOwner`
   * (AR-43, RT-2) and wire the host. A cleanup registered on the scope resets this view's wiring
   * when the scope is disposed, so an unmount cascade auto-clears every descendant (RT-3).
   * `Group` overrides this to recurse into its children under the new scope.
   *
   * @param host        The render-root seam (or `null` in lifecycle-only contexts).
   * @param parentScope The owner to nest this view's scope under.
   */
  mount(host: ViewHost | null, parentScope: Owner | null): void {
    // `untrack` so the scope setup (and its wiring-reset onCleanup) binds to THIS view's scope and
    // never to an ambient computation — a view may be mounted from inside a reconcile effect
    // (dynamic children), where onCleanup would otherwise attach to that effect (RT-2/RT-3).
    runWithOwner(parentScope, () => {
      untrack(() => {
        createRoot((dispose) => {
          this.scope = getOwner();
          this.disposeScope = dispose;
          this.host = host;
          this.mounted = true;
          onCleanup(() => {
            this.mounted = false;
            this.scope = null;
            this.host = null;
            this.parent = null;
            this.disposeScope = null;
            this.mountFired = false;
          });
        });
      });
    });
  }

  /**
   * @internal Fire the pending `onMount` callbacks exactly once, after the first reflow gives the
   * view bounds (called by the reflow pass for newly-mounted views, AR-36). Idempotent.
   */
  runPendingMounts(): void {
    if (this.mountFired) return;
    this.mountFired = true;
    const callbacks = this.pendingMounts.splice(0, this.pendingMounts.length);
    for (const fn of callbacks) fn();
  }

  /**
   * @internal Unmount this view: dispose its owner scope, which recursively disposes descendant
   * scopes and runs their `onCleanup` (RD-01 `dispose`). Idempotent.
   */
  unmount(): void {
    this.disposeScope?.();
  }
}
