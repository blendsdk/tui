# Requirements & Scope — View/Group Spine

> **Source**: [RD-03](../../requirements/RD-03-view-group-spine.md)
> **Preflight**: [requirements/00-preflight-report.md](../../requirements/00-preflight-report.md) (RD-03 section — PASSED, AR-43…AR-46)
> **CodeOps Skills Version**: 2.0.0

This document restates the RD-03 scope as the implementation contract. The RD is the
authoritative source; nothing here may contradict it. Acceptance criteria below map 1:1 to
RD-03 AC-1…AC-20 and are realized as specification tests in
[07-testing-strategy.md](07-testing-strategy.md).

## Feature

The retained `View`/`Group` widget tree for `@jsvision/ui`: persistent nodes that keep
identity across frames, each drawing itself onto core's shared `ScreenBuffer` through a
stateless, view-local, auto-clipped `DrawContext`. RD-03 binds RD-01 reactivity (per-view
owner scope + `bind`) and owns both the **coalescing repaint pump** and the **layout reflow
pass**. It is independently renderable (the Phase-0 demo target) without the RD-04 event loop.
Lives at `packages/ui/src/view/`, re-exported through `@jsvision/ui`.

## IN scope

**Public API (RD-03 §Public API surface):**

- `View` (abstract): `bounds: Rect`, `state: ViewState`, `layout: LayoutProps`, optional `measure`, abstract `draw(ctx)`, `onEvent(ev)` **stub**, `invalidate()`, `invalidateLayout()`, `bind(reader, apply?, { relayout? })`, `onMount(fn)`, `onCleanup(fn)`. (AR-30, AR-31, AR-46)
- `ViewState = { visible; disabled; focused }` — drawn-against flags; focus/disabled driven by RD-04. (AR-30)
- `Group extends View`: `children: View[]`, `background?: ThemeRoleName`, `add(child)`, `remove(child)`, `draw(ctx)` (fills bg; the spine composites children). (AR-40, AR-38)
- `DrawContext`: `text`/`fillRect`/`fill`/`box`/`shadow`, `color(role): Style`, `readonly size: Size2D` — view-local coords, auto-clipped, out-of-clip writes dropped. (AR-39)
- `Point` + pure helpers `intersect`/`translate`/`contains` over reused `Rect`/`Size2D`. (AR-37)
- `RenderRoot` + `createRenderRoot(size, { caps, theme?, schedule?, logger? })`: `mount(root)`, `resize(size)`, `flush()`, `serialize(): string`. (AR-32, AR-38, AR-44)
- `ThemeRoleName = keyof Theme` (RD-03-owned). (AR-45)
- **Enabling primitives** (additive): RD-01 `runWithOwner(owner, fn)` + `getOwner()` + opaque `Owner` (AR-43, PA-1); core `ScreenBuffer.clone()` (AR-44, PA-8).

**Behavioral guarantees:**

- Retained identity: children are the same instances across frames. (AC-1, AR-40)
- Reflow writes parent-relative integer `bounds` from RD-02 `layout()`; nested rects relative to parent. (AC-2, AR-33)
- `visible:false` ⇒ omitted from the box tree (siblings reflow to fill) **and** not drawn. (AC-3, AR-41)
- View-local, clipped paint: local `(0,0)` lands at the view's absolute origin; out-of-rect/ancestor writes dropped. (AC-4, AR-39)
- Back-to-front overlap: later sibling overpaints earlier; no cover-detection. (AC-5, AR-34, AR-38)
- `Group` fills its `background` role before compositing children. (AC-6, AR-38)
- `bind` ⇒ repaint of **only** that view's subtree, coalesced into one frame; layout-affecting binds opt into reflow. (AC-7, AC-9, AR-31, AR-46)
- Coalescing: N `invalidate()` in a tick ⇒ exactly one flush. (AC-8, AR-32)
- Injectable scheduler routes all flush scheduling through the injected fn. (AC-10, AR-32)
- Owner-scope disposal: `remove`/`Show`/`For` flip disposes descendants' scopes + runs `onCleanup`; removed views trigger no further work. (AC-11, AR-36)
- `Show`/`For` with `N=View` mount/unmount subtrees with no parallel reconciler. (AC-12, AR-36)
- `ctx.color(role)` resolves `defaultTheme` roles to a `Style`. (AC-13, AR-35)
- Draw-error isolation: a throwing `draw()` is logged, its subtree skipped, the frame still composes. (AC-14, AR-42)
- `onEvent` exists/overridable but performs no dispatch/focus logic. (AC-15, AR-30)
- All glyph output flows through `ScreenBuffer` + `serialize()`; no raw escapes. (AC-16, Security §)
- Degenerate geometry (zero/over-large) ⇒ clipped no-ops + zero-size bounds, no throw. (AC-17, Security §)
- Standalone render: mount → reflow → serialized frame without RD-04. (AC-19, AR-32, AR-40)

## OUT of scope (RD-03 §Won't Have)

- Event dispatch, focus traversal, modality, commands, `execView` — the `onEvent` **logic** is RD-04 (RD-03 ships only the stub + `focused` flag). (AR-30)
- Leaf widgets (`Text`/`Label`/`Button`/`Input`/…) — first controls land in RD-06; acceptance uses test `View` subclasses + the demo. (AR-40)
- Windows, frames, scrollbars, desktop, menu/status bar — RD-05. (component map)
- Sibling occlusion / cover-detection (`exposed()`) — deferred (damage-diff neutralizes overdraw). (AR-34)
- Live per-subtree theme override — only the seam (`DrawContext` carries the theme) ships. (AR-35)
- `visibility:hidden` (space-reserving hide) — only `display:none`. (AR-41)
- Mouse hit-testing — depends on the event model; RD-04. (component map)

## Dependencies / constraints

- **Runtime**: Node built-ins + the declared workspace dep `@jsvision/core` only; no third-party/native deps — `yarn check:deps` must pass. (AR-37)
- **Toolchain**: TypeScript ESM-only, NodeNext (`.js` specifiers on `.ts` sources), `strict`, `noUnusedLocals`/`noUnusedParameters`. Build `tsc`; test vitest `unit` (`*.{spec,impl}.test.ts`) + `e2e` (`*.e2e.test.ts`, the demo).
- **Builds on (verified done)**: RD-01 reactive core (`packages/ui/src/reactive/` — `createRoot`/`effect`/`onCleanup`/`Show`/`For`), RD-02 layout (`packages/ui/src/layout/` — `layout`/`LayoutBox`/`Rect`/`Size2D`/`Padding`), and `@jsvision/core` render/color/safety (`ScreenBuffer`/`serialize`/`defaultTheme`/`Theme`/`Style`/`createLogger`/`TuiError`/`CapabilityProfile`).
- **Additive touches to done subsystems** (user-approved): `runWithOwner` on `reactive`, `ScreenBuffer.clone()` on core `render` — each fully back-compatible and spec-tested.

## Success criteria (Definition of Done)

1. All 20 specification tests (ST-01…ST-20, mapping RD-03 AC-1…AC-20) pass, plus ST-21/ST-22 for the two enabling primitives.
2. Implementation (edge/error) tests pass; happy-path + boundary + degenerate + error coverage per concern.
3. `yarn verify` green (typecheck + build + unit tests across packages); demo e2e green (`yarn test:e2e`).
4. `yarn workspace @jsvision/ui check:deps` passes (no third-party/native deps).
5. `View`, `Group`, `DrawContext`, `RenderRoot`, `createRenderRoot`, `Point`, `ViewState`, `ThemeRoleName` (+ reused `Rect`/`Size2D`) importable from `@jsvision/ui`; `runWithOwner`/`getOwner`/`Owner` from `@jsvision/ui`; `ScreenBuffer.clone()` on the core export.
6. `runWithOwner` and `ScreenBuffer.clone()` do not regress RD-01 / RD-04 existing tests.
7. Every `src/view/` file ≤ 500 lines; public symbols carry JSDoc.
8. No dead code; ESLint + Prettier clean (`yarn lint`); `demo:view` runs and prints a themed ASCII frame.
