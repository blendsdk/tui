# Ambiguity Register — TV Behavioral Fidelity (RD-10)

> **Plan**: `plans/tv-behavioral-fidelity/`
> **Status**: ✅ GATE PASSED — all items resolved, user-confirmed 2026-06-30
> **CodeOps Skills Version**: 3.1.0

This plan implements **RD-10** (`requirements/RD-10-tv-behavioral-fidelity.md`), whose
*behavioral* decisions are locked upstream as **AR-88…AR-92** in
`requirements/00-ambiguity-register.md` and are inherited verbatim — **not** re-litigated here.
This register captures only the **plan-level** decisions the RD left to planning (seam shapes,
the gesture model, the ported-algorithm details, file layout, and the too-small-desktop edge),
numbered `PA-NN`, plus the inherited-decision map below.

## Plan-level decisions (PA-NN)

| PA # | Category | Question | Options Considered | Decision | Status |
|------|----------|----------|--------------------|----------|--------|
| PA-1 | Status · capture seam | How does `StatusLine` receive mouse move/up after a press leaves the bar? | (a) **add `setCapture(view)`/`releaseCapture()` to `StatusLoopSeam`**; `createApplication` wires the loop's existing capture seam (the same one `Desktop` uses, AR-82); (b) give `StatusLine` the whole `EventLoop` (rejected: leaks the full surface, breaks the narrow-seam pattern) | **(a) add capture to `StatusLoopSeam`** | ✅ Resolved (dominant) |
| PA-2 | Status · pressed-state model | How is the held item tracked + repainted? | (a) **`StatusLine` holds a `pressed` item ref**; mouse-down over an enabled item captures + sets `pressed` + `invalidate()`; captured move re-targets `pressed` (or clears it off-bar); mouse-up releases + emits iff still over the same enabled item; the draw paints `pressed` in `statusSelected` (and `cSelDisabled` for a disabled pressed item); (b) a desktop-style gesture object (rejected: over-engineered for one bar-local press) | **(a) `pressed` ref on `StatusLine`** | ✅ Resolved (dominant) |
| PA-3 | Status · `statusSelected` role | What shape + values for the re-added theme role? | (a) **`statusSelected: ThemeRole = { fg: black, bg: green, hotkey: red }`** (TV `cSelect` 0x20 / hotkey 0x24) added to core `Theme` + `defaultTheme` — additive, mirrors `windowInactive`/`menuSelected`; `cSelDisabled` (darkGray on green) derived in the draw from `shadow.fg` + `statusSelected.bg` (no extra role); (b) a full `statusSelected` + `statusSelectedDisabled` pair (rejected: the disabled tint is derivable, avoid an unused-ish role) | **(a) one `statusSelected` role; disabled tint derived** | ✅ Resolved (AR-88) |
| PA-4 | Cascade · geometry + z-mapping | Exact per-window rect, and which z-index fills vs is most-offset? | (a) **TV `doCascade`** — for `windows[i]` (back→front, `i=0` = back), rect `{ x:i, y:i, width: deskW−i, height: deskH−i }` (top-left staggers +1/+1, bottom-right pinned to the desktop corner); the front/top-z window gets the largest offset, the back fills; un-zoom first; (b) front fills / back most-offset (rejected: inverts TV's stair direction — `tdesktop.cpp:67-78`) | **(a) TV `doCascade` mapping** | ✅ Resolved (AR-89) |
| PA-5 | Tile · ported algorithm | Which TV functions, and what config? | (a) **port `iSqr`/`mostEqualDivisors`/`dividerLoc`/`calcTileRect`/`doTile` verbatim** (`tdesktop.cpp:162-214`) with `tileColumnsFirst = false` (TV default ⇒ `favorY = true`); `windows[i]` → `calcTileRect(i)`; cells computed by proportional dividers (no remainder), `leftOver = n % numCols` trailing columns get one extra row; un-zoom first; (b) a from-scratch grid (rejected: the fidelity directive mandates the source algorithm) | **(a) port the TV tile math** | ✅ Resolved (AR-90) |
| PA-6 | Cascade/tile · too-small desktop | What happens when the min (10×3) won't fit `n` windows? | (a) **`tileError` ⇒ no-op (no beep)** — cascade if `min.x > deskW−(n−1)` or `min.y > deskH−(n−1)`; tile if `deskW/numCols == 0` or `deskH/numRows == 0` — leave all windows untouched (we have no bell); consistent with the TV-exact choice; (b) keep the AR-87 clamp-to-min overflow (rejected by the user) | **(a) tileError ⇒ no-op** | ✅ Resolved (user, supersedes AR-87 clamp) |
| PA-7 | Left-grow · gesture model | How is the bottom-left-grip resize represented + applied? | (a) **extend the `Gesture` union with `{ kind:'resize-left'; target; anchorRight; originY }`** + `applyResizeLeft`: `x = clamp(pointerX, anchorRight−maxW+1 … anchorRight−MIN_WIDTH+1)`, `width = anchorRight − x + 1`, `height = max(MIN_HEIGHT, pointerY − originY + 1)`, anchoring the right edge (TV `dmDragGrowLeft`+`dmDragGrow`); a new `FrameZone 'resize-left'`; `frameZoneAt` returns it for the bottom-left grip cells (`x ≤ 1`, `y = h−1`) on a resizable window; `Window.onEvent` maps it to `manager.beginResizeLeft`; `Desktop.beginResizeLeft` captures the pointer; (b) reuse the SE `resize` gesture (rejected: anchors the wrong corner — jumps) | **(a) new `resize-left` gesture + zone** | ✅ Resolved (AR-91) |
| PA-8 | File layout | New files or edit in place? | (a) **edit in place** — `core/.../theme.ts` (role), `ui/status/statusline.ts` (press/release), `ui/status/index.ts`+`app/application.ts` (seam wiring), `ui/desktop/arrange.ts` (cascade/tile), `ui/desktop/gestures.ts`+`desktop.ts`+`window/frame.ts`+`window/window.ts` (left-grow); no new files (tile math stays in `arrange.ts`, ≤ 500 lines); (b) a new `arrange-tv.ts` (rejected: arrange.ts stays well under the size budget) | **(a) edit in place, no new files** | ✅ Resolved (dominant) |
| PA-9 | Spec-oracle updates | Which existing oracles change, and how is that authorized? | (a) **rewrite the ST-11 desktop oracle (cascade/tile) + the status press/emit spec/impl tests** to the TV-faithful expectations, citing AR-88…AR-90 as the user-approved supersession of AR-87 + emit-on-press; (b) add new tests beside the old (rejected: leaves contradictory oracles) | **(a) rewrite ST-11 + status specs (user-approved)** | ✅ Resolved (AR-88/89/90) |

## Inherited decisions (from `requirements/00-ambiguity-register.md`)

| AR # | Decision | Used by |
|------|----------|---------|
| AR-88 | Status press feedback + **emit-on-release** (green held item, command on mouse-up if still over the enabled item; drag-off cancels); re-add `statusSelected` role | Phase 1 |
| AR-89 | **TV-exact cascade** (+1/+1 stagger, extend to desktop corner) — supersedes AR-87 | Phase 2 |
| AR-90 | **TV-exact tile** (`mostEqualDivisors`/`dividerLoc`/`leftOver`, n=2 stacks) — supersedes AR-87 | Phase 2 |
| AR-91 | **Functional left-grow resize** (TV `dmDragGrowLeft`) on the already-drawn bottom-left grip | Phase 3 |
| AR-92 | Placement as a dedicated **RD-10** (RD-06…09 reserved for the widget tiers) | — |
| AR-82 | The loop's `setCapture`/`releaseCapture` pointer-capture seam (RD-05) | Phases 1, 3 |
| AR-54 | One coalesced frame per dispatch tick | Phases 1–3 |

**🚨 GATE PASSED** — every PA row Resolved; inherited AR-88…AR-92 not re-litigated; zero deferred.
