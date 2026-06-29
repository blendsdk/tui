# Current State Analysis — View/Group Spine

> **CodeOps Skills Version**: 2.0.0

## Summary

`packages/ui/src/view/` does **not** exist yet — this is a greenfield subsystem inside the
existing `@jsvision/ui` package. RD-03 is an **additive** build-out: it consumes the landed
RD-01 reactive core and RD-02 layout engine unchanged, and `@jsvision/core` unchanged except
for one small additive method (`ScreenBuffer.clone()`). The only other change to a done
subsystem is the additive RD-01 `runWithOwner` primitive. No migration, no rewrite.

## What already exists (verified against the code)

### RD-01 reactive core — `packages/ui/src/reactive/`

| Symbol | File:line | Shape | RD-03 use |
|--------|-----------|-------|-----------|
| `createRoot(fn)` | `owner.ts:63` | runs `fn(dispose)` under a **new child scope nested under the ambient owner** (`createChildScope`, `owner.ts:49`) | the View's scope is created via `createRoot` **inside** `runWithOwner(parent.scope, …)` so it nests under the parent (PA-1) |
| `onCleanup(cb)` | `owner.ts:82` | registers teardown on the running computation or owner | `View.onCleanup` delegates to it |
| `effect(fn)` | `effect.ts:20` | runs `fn` now + on dep change; disposed with its owner scope; returns `void` | `bind` wraps one `effect` |
| `getOwner()` / `setOwner()` | `scheduler.ts:41`/`:52` | read/replace the ambient owner (module-exported, **not** on the public barrel) | `runWithOwner` is built on these; `getOwner` is re-exported (PA-1) |
| `Owner` | `types.ts:134` | internal disposal-tree node (`owner`/`owned`/`children`/`cleanups`/`disposed`) | re-exported as an **opaque** token for `runWithOwner`/`getOwner` (PA-1) |
| `Show<N>(when, then, else?)` | `show.ts:24` | returns `() => N \| undefined`; disposes the inactive branch scope | dynamic child with `N=View` (AR-36) |
| `For<T,N>(each, key, render)` | `for.ts:43` | returns `() => N[]`; per-item `createRoot` (`for.ts:56`), keyed reconcile, disposes dropped items | dynamic children with `N=View` (AR-36) |
| `ReactiveCycleError`/`TuiError` | `errors.ts` | error model (extends core `TuiError`) | `bind`-before-mount throws a `TuiError` (PA-2) |

> **Key fact (drove PF-001 → AR-43):** `createRoot` nests under the **ambient** owner at call
> time. An imperatively-constructed `new View()` has `getOwner() === null`, so without
> `runWithOwner` its scope would not nest under its parent. `Show`/`For` already create their
> child scopes under the reconcile context, so the dynamic path nests correctly today.

### RD-02 layout — `packages/ui/src/layout/`

| Symbol | File:line | Shape | RD-03 use |
|--------|-----------|-------|-----------|
| `layout(root, viewport)` | `layout/layout.ts` | pure `(LayoutBox, Size2D) → Map<LayoutBox, Rect>`, parent-relative integer rects; fresh map; degenerate→zero | the reflow pass calls it (AR-33) |
| `LayoutBox` | `layout/types.ts:80` | `{ props: LayoutProps; children: readonly LayoutBox[]; measure?(available): Size2D }` | reflow builds one per visible view (PA-7) |
| `LayoutProps` | `layout/types.ts:55` | `{ direction?/size?/justify?/align?/gap?/padding? }` | `View.layout` is this |
| `Rect`/`Size2D`/`Padding` | `layout/types.ts:20`/`:14`/`:28` | geometry interfaces, **exported from `@jsvision/ui`** | reused directly (AR-37) |

### `@jsvision/core` (verified exports — `engine/index.ts`)

| Symbol | File:line | Shape | RD-03 use |
|--------|-----------|-------|-----------|
| `ScreenBuffer` | `render/buffer.ts` | width-correct cell buffer: `set`/`get`/`fillRect`/`text`/`box`/`shadow`/`rows`; ctor `(w,h,fill: Style & {char?})`; `.text()` runs `sanitize` (`:159`); **no clone** | the single shared compose target (AR-38); add `clone()` (PA-8) |
| `serialize(current, previous, opts)` | `render/serialize.ts:64` | damage-diff → string; `opts.caps: CapabilityProfile` **required** (`:31`); `previous: ScreenBuffer\|null` | `RenderRoot.serialize()` (AR-44) |
| `Style` | `render/types.ts:54` | `{ fg: Color; bg: Color; attrs?: AttrMask }` | `ctx.color` returns it; the bg-fill style |
| `Theme`/`ThemeRole`/`defaultTheme` | `color/theme.ts` | `ThemeRole = {fg,bg,hotkey?}`; roles `desktop/menuBar/menuSelected/window/dialog/button/buttonFocused/statusBar/shadow` | `ThemeRoleName = keyof Theme`; `color` adapter (PA-6) |
| `createLogger(options={})` | `safety/logger.ts:214` | screen-safe logger; disabled no-op unless `sink:'ring'` or `BLENDTUI_DEBUG=1` | injectable draw-error log (AR-42, AC-14) |
| `TuiError` | `safety/errors.ts` | SDK-wide error base | `bind`-before-mount error (PA-2) |
| `CapabilityProfile` | `capability/index.ts` | depth/glyph/… caps | `RenderRoot` holds it for `serialize` (AR-44) |
| `charWidth`/`Attr`/`sanitize` | `render`/`safety` | width measure, attr mask, injection guard | clipped `DrawContext` writers |

**No `Point`/`intersect`/`translate`/`contains`** exist anywhere (verified by grep across
`packages/ui/src` and `core/render`) — RD-03 adds them fresh (no DRY conflict, AR-37).

## Patterns to mirror (verified against the code)

| Pattern | Evidence | Apply to view |
|---------|----------|---------------|
| Subsystem barrel → single entry, **explicit named** re-exports (not `export *`) | `src/index.ts:19-34` (layout) | add `export { … } from './view/index.js'` with an explicit symbol list (AC-18) |
| `.js` specifier on `.ts` source (NodeNext) | all `reactive/*`, `layout/*` | every intra-module import uses `.js` |
| Granular split, foundation-first, ≤ 500 lines + JSDoc | `src/reactive/` (12 files), `src/layout/` (5) | same under `src/view/` (PA-4) |
| Spec test = immutable oracle from the AC | `test/layout.*.spec.test.ts` | ST cases derive from RD-03 ACs |
| spec/impl split + `e2e` for runnable demos | `test/reactive.*`, `examples/test/*.e2e` | `view.*.{spec,impl}` + `view-demo.e2e` |
| Demo example via `tsx` | `examples/reactive-demo/`, `layout-demo/` + `demo:*` scripts | add `view-demo/` + `demo:view` (PA-3) |
| Additive primitive on a done subsystem, spec-tested in its own subsystem | RD-03's `createTerminalQuery` added to core host | `runWithOwner`→reactive tests, `clone()`→core render test (PA-5) |

## Constraints confirmed from manifests

- `tsconfig.base.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, NodeNext, ES2022.
- `packages/ui/package.json`: depends only on `@jsvision/core`; `check:deps` fails only on native deps — pure-TS additions fine.
- `packages/ui/vitest.config.ts`: `unit` = `*.{spec,impl}.test.ts`, `e2e` = `*.e2e.test.ts`.
- `packages/examples`: imports `@jsvision/core` **and** `@jsvision/ui` by name; demos run via `tsx`.

## Target file layout (PA-4, granular split)

```
packages/ui/src/view/
├── index.ts          # barrel: View, Group, ViewState, DrawContext, RenderRoot, createRenderRoot,
│                     #   RenderRootOptions, Point, intersect, translate, contains, ThemeRoleName
│                     #   (→ explicit re-exports added to src/index.ts)
├── geometry.ts       # NEW — Point + pure intersect/translate/contains over Rect/Size2D (AR-37)
├── types.ts          # NEW — ViewState, DrawContext, ThemeRoleName, RenderRootOptions, internal seams
├── theme-style.ts    # NEW — themeRoleToStyle(role): Style adapter (PA-6, AR-45)
├── view.ts           # NEW — abstract View: state, bounds, onEvent stub, bind/invalidate/invalidateLayout,
│                     #   onMount/onCleanup, scope wiring helpers (AR-30,31,46)
├── group.ts          # NEW — Group: children, background, add/remove, mount/unmount, draw bg (AR-40,38,36)
├── draw-context.ts   # NEW — the clipped, offset, view-local DrawContext over ScreenBuffer (AR-38,39)
├── reflow.ts         # NEW — view tree → LayoutBox tree (+ box→view map) → layout() → bounds (AR-33, PA-7)
└── render-root.ts    # NEW — RenderRoot: buffers (+clone snapshot), caps, theme, dirty set, scheduler,
                      #   compose walker (clip+back-to-front+bg+error isolation), Show/For children (AR-32,38,42,44)

packages/ui/src/reactive/
├── owner.ts          # EXTEND — add runWithOwner(owner, fn) (PA-1, AR-43)
└── index.ts          # EXTEND — export { runWithOwner }, { getOwner }, type { Owner }

packages/core/src/engine/render/
└── buffer.ts         # EXTEND — add ScreenBuffer.clone() (PA-8, AR-44)

packages/examples/
├── view-demo/main.ts # NEW — demo:view walkthrough (PA-3)
└── package.json      # EXTEND — "demo:view": "tsx view-demo/main.ts"
```

> **Layering** (foundation-first): `geometry`/`theme-style`/`types` → `draw-context` →
> `view` → `group` → `reflow` → `render-root` → `index`. `view`↔`group` reference each other
> only through the abstract `View` base + the internal mount seam (no cycle). Keep each file
> ≤ 500 lines; split `render-root.ts` (compose walker into `compose.ts`) if it approaches the
> limit.

## Test file layout (PA-4, PA-5)

```
packages/ui/test/
├── reactive.ownership.spec.test.ts / .impl.test.ts   # EXTEND — runWithOwner (ST-21) + edges
├── view.tree.spec.test.ts     / .impl.test.ts   # AC-1, 11, 15 (retained identity, scope disposal, onEvent stub)
├── view.drawcontext.spec.test.ts / .impl.test.ts # AC-4, 13, 16 (clipped paint, color, output-via-core)
├── view.reflow.spec.test.ts   / .impl.test.ts   # AC-2, 3 (bounds writeback, visible:false omission)
├── view.render.spec.test.ts   / .impl.test.ts   # AC-5, 6, 14, 19 (overlap, bg fill, error isolation, standalone)
├── view.scheduler.spec.test.ts / .impl.test.ts  # AC-7, 8, 9, 10 (bind repaint, coalescing, relayout/repaint, injectable)
├── view.dynamic.spec.test.ts  / .impl.test.ts   # AC-12 (Show/For N=View mount/unmount)
└── view.packaging.spec.test.ts                  # AC-17, 18, 20 (degenerate, packaging, security)

packages/core/test/
└── render-buffer-clone.spec.test.ts             # ST-22 — clone() exactness (incl. wide/continuation cells)

packages/examples/test/
└── view-demo.e2e.test.ts                        # demo:view runs, prints a themed frame (AC-19 e2e flavor)
```

## Risks / watch-items

- **Owner-scope nesting at add-time (PA-1/AR-43)** is the subtlety: `Group.add` must run the
  child's `createRoot` inside `runWithOwner(this.scope, …)`, and a Group added *before* it is
  itself mounted defers its children's scope creation to its own mount (recursive mount). Covered
  by `view.tree` specs (AC-1, AC-11).
- **Partial recompose vs. stale cells (PA-8)**: a repainting view must fully cover its rect; a
  `Group` fills its `background`. Documented v1 behavior; a leaf that under-paints leaves stale
  cells until the next reflow. Impl-tested.
- **Clip correctness at edges (AR-39)**: out-of-clip writes (all four edges + ancestor clip) must
  drop, not wrap — `view.drawcontext.impl` covers each edge; `box`/`shadow` clip-delegation is the
  fiddly part.
- **`clone()` exactness**: must copy wide-lead (`width:2`) + continuation (`width:0`) cells
  faithfully or the diff emits spurious cells — ST-22 asserts a round-trip with a wide glyph.
- **Coalescing + onMount → first frame**: `onMount` → `bind` → initial `apply` + `invalidate`
  schedules a second (coalesced) frame on mount; acceptable, asserted in `view.scheduler.impl`.
