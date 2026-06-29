# Component: Reflow, Scheduler & Render Root (`reflow.ts`, `render-root.ts`)

> **Files**: `reflow.ts`, `render-root.ts` (split a `compose.ts` if `render-root.ts` nears 500 lines)
> **CodeOps Skills Version**: 2.0.0

The make-or-break layer: the reflow pass (RD-02↔RD-03 seam), the coalescing repaint pump
(closes AR-02), and the `RenderRoot` that ties buffer + viewport + theme + dirty set + scheduler
into an independently renderable spine (the Phase-0 demo target). The compose walker does
clip + back-to-front + background fill + draw-error isolation. Dynamic children reuse `Show`/`For`.

## Reflow pass (`reflow.ts`, AR-33/AR-41/PA-7)

```ts
function reflow(root: View, viewport: Size2D): void;
```

1. **Build a fresh `LayoutBox` tree** from the live view tree, depth-first, keeping a per-pass
   `Map<LayoutBox, View>`. For each view: `box = { props: view.layout, children: [boxes of its
   visible children], measure: view.measure?.bind(view) }`. A `visible:false` view (and its
   subtree) is **omitted** (AR-41) — its siblings reflow to fill the freed space.
2. **`layout(rootBox, viewport)`** → `Map<LayoutBox, Rect>` (RD-02, parent-relative integer
   rects). The "fresh tree, distinct instances" precondition holds by construction (PA-7).
3. **Write back**: for each `(box, rect)`, set `boxToView.get(box)!.bounds = rect`. Rects are
   parent-relative, exactly as `view.bounds` is defined (AR-27/AR-33).
4. Fire any queued `onMount` callbacks for newly-mounted views (now that they have bounds, AR-36).

Pure w.r.t. the view tree except the intended `bounds` writes; a fresh box tree + map each pass
(no caching across reflows). Degenerate viewport → RD-02 returns zero-size rects → zero bounds,
no throw (AC-17).

## Coalescing scheduler & dirty phases (`render-root.ts`, AR-32/AR-33)

The render root holds the dirty state and the **injectable** scheduler:

```ts
interface RenderRootOptions {
  caps: CapabilityProfile;                       // REQUIRED — serialize() depth-aware encoding (AR-44)
  theme?: Theme;                                 // default defaultTheme (AR-35)
  schedule?: (flush: () => void) => void;        // default queueMicrotask (AR-32)
  logger?: Logger;                               // default createLogger() (disabled); draw-error log (AR-42, AC-14)
}
```

- `view.invalidate()` → `markRepaint(view)`: `dirty.add(view)`; `scheduleFlush()`.
- `view.invalidateLayout()` → `markRelayout()`: `needsReflow = true`; `scheduleFlush()`.
- `scheduleFlush()`: if not already scheduled, set `scheduled = true` and call
  `schedule(() => this.flush())`. **All** scheduling routes through the injected `schedule`
  (no direct `queueMicrotask` when overridden) — AC-10.
- Many `invalidate()`/`invalidateLayout()` within one tick coalesce: only the first schedules;
  the single `flush()` drains everything ⇒ exactly one flush per tick (AC-8).

### `flush()` — the frame (AR-32, AR-44, PA-8)

```
scheduled = false
previous = current.clone()                       // faithful snapshot for the diff (PA-8)
if (needsReflow) { reflow(root, viewport); needsReflow = false; composeFull(root) }
else { for (view of topmostDirty(dirty)) composeSubtree(view) }   // partial recompose (AC-7)
dirty.clear()
lastFrame = serialize(current, previous, { caps, encodeStyle? })  // cached for serialize()
```

- **Relayout vs repaint (AC-9)**: a draw-only `invalidate()` runs **no** reflow (partial
  recompose only); an `invalidateLayout()` runs the reflow + a full recompose. Distinct phases.
- **Partial recompose (AC-7)**: recompose only the dirty views' subtrees using each view's
  **cached** absolute origin + clip from the last full compose. `topmostDirty` drops a dirty
  view whose ancestor is also dirty (the ancestor's subtree already covers it). Reflow
  invalidates the caches (a moved view's cached context is stale ⇒ full compose).
- A repainting view must fully cover its rect; a `Group` fills its `background`. A leaf that
  under-paints leaves stale cells until the next reflow — documented v1 behavior (PA-8).

## Compose walker (clip + back-to-front + bg + error isolation, AR-34/AR-38/AR-42)

```ts
function composeSubtree(view, absOrigin, clip): void {   // clip = view rect ∩ ancestor clip (absolute)
  if (!view.state.visible) return;                       // display:none (AR-41)
  const ctx = makeDrawContext(buffer, absOrigin, clip, theme);
  try { view.draw(ctx); }
  catch (e) { logger.error('view.draw threw', e); return; }  // isolate + skip subtree (AR-42, AC-14)
  if (view is Group) {
    for (const child of view.children) {                 // array order = back-to-front (AC-5)
      const childOrigin = { x: absOrigin.x + child.bounds.x, y: absOrigin.y + child.bounds.y };
      const childClip = intersect(clip, rectAt(childOrigin, child.bounds)); // bounds-clip (AR-34)
      composeSubtree(child, childOrigin, childClip);
    }
  }
  cache(view, absOrigin, clip);                            // for later partial recompose
}
```

- **Back-to-front (AC-5)**: later children overpaint earlier ones; no cover-detection — core's
  `serialize()` only emits changed cells, so overdraw is free (AR-34).
- **Background fill (AC-6)**: `Group.draw` fills its `background` role before the walker recurses
  into children, so overlap never leaks stale cells.
- **Error isolation (AC-14)**: a throwing `draw()` is logged via the injected screen-safe
  `logger` and its **subtree is skipped**; siblings/ancestors still compose — one crashing
  widget never blanks the app. Deliberately differs from RD-01 AR-15 (effects propagate) — a
  render loop degrades gracefully (AR-42).
- A full compose starts at the root with `absOrigin = {0,0}` and `clip = {0,0,viewport}`.

## `RenderRoot` (`render-root.ts`, AR-32/AR-38/AR-44)

```ts
interface RenderRoot {
  mount(root: View): void;     // mounts the tree (scopes via runWithOwner under the root scope), reflow, first compose
  resize(size: Size2D): void;  // viewport = size; needsReflow = true; scheduleFlush()
  flush(): void;               // force a synchronous frame (drains dirty state now)
  serialize(): string;         // the last flushed frame's diff bytes (core serialize, AR-44)
}
function createRenderRoot(size: Size2D, opts: RenderRootOptions): RenderRoot;
```

- Holds: the root view, the persistent `current` ScreenBuffer (ctor `(w,h, { …blank style, char:' ' })`),
  the `previous` snapshot, `viewport`, `theme`, `caps`, `logger`, the dirty set, `needsReflow`,
  `scheduled`, the injected `schedule`, and the per-view compose-context cache.
- `mount(root)`: creates the root view's scope under a fresh root `createRoot` scope, recursively
  mounts the tree (`mountView`, 03-02), sets `needsReflow`, and flushes once (reflow + full
  compose) so the spine renders standalone — no RD-04 (AC-19).
- `serialize()` returns the bytes computed in the last `flush()` (or forces a flush if dirty).
  All output is buffer cells via `serialize()` — no raw escapes (AC-16).

## Dynamic children — `Show`/`For` with `N=View` (AR-36, AC-12)

A `Group` accepts reactive child **producers** alongside static children: `Show<View>(…)` →
`() => View | undefined`, `For<T, View>(…)` → `() => View[]`. The Group runs a child-reconcile
**effect under its own scope** (via `runWithOwner(group.scope, () => effect(...))`):

- The effect reads the producer accessor (subscribing) and gets the current `View[]`.
- It **diffs** against the currently-mounted dynamic children: newly-appearing views are
  `mountView`-ed under the group's scope; disappearing views are `remove`-d (scope disposed →
  `onCleanup` runs). `For` already does the **keyed** reconcile of `T → View` and disposes
  dropped items' per-item scopes (`for.ts`); the Group adds **no parallel reconciler** — it only
  mounts/unmounts the produced `View` nodes and schedules a reflow on any change.
- Because the reconcile effect and the produced views' scopes nest under the group's scope,
  unmounting the group disposes them all (AC-11). A `Show` flip disposes the inactive branch's
  views (AC-11, AC-12).

## Invariants (asserted by tests)

- N invalidations in one tick ⇒ exactly one `schedule`/flush (AC-8); injected scheduler used
  exclusively (AC-10).
- `bind` change ⇒ only the bound view's subtree recomposes (other views' `draw` not called),
  one frame (AC-7); draw-only change runs no reflow, `invalidateLayout` runs one (AC-9).
- After `mount`+`resize`, every view's `bounds` equals RD-02's computed rect; nested rects
  parent-relative (AC-2); hidden view omitted, siblings refill (AC-3).
- A throwing `draw()` is logged and its subtree skipped; the rest of the frame composes (AC-14).
- `mount`→reflow→`serialize()` yields a non-empty first frame with no RD-04 (AC-19).

## Traceability

AR-32, AR-33, AR-34, AR-36, AR-38, AR-41, AR-42, AR-44 · PA-7, PA-8. ACs: 2, 3, 5, 6, 7, 8, 9,
10, 12, 14, 19 (+ 16, 17).
