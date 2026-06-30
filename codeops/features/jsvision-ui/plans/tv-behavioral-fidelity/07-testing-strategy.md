# Testing Strategy — TV Behavioral Fidelity

> **Parent**: [Index](00-index.md) · Implements jsvision-ui/RD-10 · **CodeOps Skills Version**: 3.1.0

Specification-first. The ST-* cases below are the immutable oracles (from RD-10 AC-1…AC-11 + the TV
source), authored RED before implementation. Two existing oracles are **rewritten** to the TV-faithful
behavior under the user-approved supersession (AR-88…AR-90, PA-9): `app-shell.desktop.spec` **ST-11**
(cascade/tile) and `app-shell.status.{spec,impl}` (emit timing). All tests use the real composed app
(no mocks); buffers are read pre-`serialize` for color assertions.

## Specification test cases

| ST | Behavior | Input → Expected | Source |
|----|----------|------------------|--------|
| **ST-01** | Status held-highlight | compose status `[~F~ile(file), ~E~dit(edit)]`; mouse-**down** on "File" ⇒ no command emitted; the "File" span cells paint `statusSelected` (bg = `green`, fg = `black`; hotkey 'F' fg = `red`) | AC-1 · `tstatusl.cpp` |
| **ST-02** | Status drag re-target/cancel | down on "File", captured **drag** onto "Edit" ⇒ highlight moves to "Edit" (Edit span bg green, File span back to base); drag off the bar ⇒ no item highlighted; still no emit | AC-2 |
| **ST-03** | Status emit-on-release | down on "File" + **up** over "File" ⇒ `file` emitted exactly once. down on "File" + up over "Edit" ⇒ **no** emit. down + up with `edit` disabled (over "Edit") ⇒ no emit. A bare down with no up ⇒ no emit | AC-3 · `tstatusl.cpp` |
| **ST-04** | `statusSelected` role | `defaultTheme.statusSelected` deep-equals `{ fg:#000000, bg:#00aa00, hotkey:#aa0000 }`; `encode(fg/bg/hotkey)` does not throw | AC-4 |
| **ST-05** | TV cascade | desktop `W×H`, n windows in z-order; after `cascade`: window `i` (back→front) has `layout.rect == { x:i, y:i, width:W−i, height:H−i }`; a zoomed window un-zooms first; **n=0** leaves rects untouched; **n=1** ⇒ `{0,0,W,H}`; a desktop too small (`MIN_WIDTH > W−(n−1)`) leaves all rects untouched | AC-5 · `tdesktop.cpp:67-78` |
| **ST-06** | TV tile | after `tile`: the cells **exactly partition** the desktop (union = `0..W × 0..H`, no gaps/overlap); **n=2** ⇒ two stacked cells `{0,0,W,⌈H/2⌉-ish}` / `{0,H/2,W,…}` (1 col × 2 rows); n=1 ⇒ fill; n=0 ⇒ untouched; a desktop with `⌊W/cols⌋==0` leaves rects untouched | AC-6 · `tdesktop.cpp:162-214` |
| **ST-07** | Left-grow resize | window `{x:10,y:2,width:14,height:8}`; `beginResizeLeft` then captured drag to local `(6, 12)` ⇒ right edge fixed at `x+width-1=23`: new `{ x:6, width:18, height:11, y:2 }`. Drag the left edge right past the min ⇒ width floored at `MIN_WIDTH=10` (x clamped to `anchorRight-9`) | AC-7 · `tframe.cpp:117-122` |
| **ST-08** | Left-resize hit-zone | on a resizable window `frameZoneAt` returns `'resize-left'` for bottom-row cells `(0,h-1)`/`(1,h-1)`, `'resize'` for `(w-1,h-1)`; on a **non-resizable** window those SW cells return `'border'` | AC-8 |
| **ST-09** | Packaging + no regression | `defaultTheme.statusSelected` is the only new core symbol; `yarn check:deps` passes; the drawing-fidelity assertions from `1caa188` (blue window, green icon, red hotkeys, ░ desktop) still hold | AC-4/9/11 |

## Test files

- `ui/test/app-shell.status.spec.test.ts` / `.impl.test.ts` — **rewrite** to ST-01…ST-03 (emit-on-release).
- `core/test/color-palette-theme.spec.test.ts` (or a focused `theme-statusselected.spec`) — ST-04.
- `ui/test/app-shell.desktop.spec.test.ts` — **rewrite ST-11** to ST-05/ST-06 (TV cascade/tile).
- `ui/test/app-shell.window.spec.test.ts` / a `gestures` impl test — ST-07/ST-08 (left-grow + zone).
- Existing `1caa188` drawing assertions — unchanged; rerun proves no regression (ST-09).

## Verification

- Per-phase: `yarn workspace @jsvision/ui test` (+ `@jsvision/core test` for the theme role) — confirm
  RED before impl, GREEN after.
- Final gate: `yarn verify` (typecheck + build + all tests), `yarn check:deps`, `yarn lint`, and a
  headless `demo:shell` render showing the TV cascade + tile geometry.
