# Ambiguity Register — Layout Engine (RD-02)

> **Plan**: `plans/layout-engine/`
> **Status**: ✅ GATE PASSED — all items resolved, user-confirmed 2026-06-29
> **CodeOps Skills Version**: 2.0.0

This plan implements **RD-02** (`requirements/RD-02-layout-engine.md`), whose
*behavioral* decisions are locked upstream as **AR-19…AR-29** in
`requirements/00-ambiguity-register.md` (AR-19 inherits **ADR-008**) and are
inherited verbatim — not re-litigated here. This register captures only the
**plan-level** decisions the RD left open (geometry types, API defaults, file
structure, `auto`/`solveTrack` integration), numbered `PA-NN`, plus a traceability
map of the inherited decisions.

## Plan-level decisions (PA-NN)

| PA # | Category | Question | Options Considered | Decision | Status |
|------|----------|----------|--------------------|----------|--------|
| PA-1 | Architecture / Files | Source + test file layout for the RD-02 additions under `packages/ui/src/layout/` | (a) **granular split** mirroring the reactive-core precedent — `apportion.ts` kept, add `types.ts`, `measure.ts`, `layout.ts`, barrel re-exports; tests split by concern (~200–500 lines/file); (b) single `layout.ts` (risks > 500 lines as auto/justify/align land) | **(a) granular split** (see 02-current-state.md §Target layout) | ✅ Resolved (user) |
| PA-2 | Types | Reuse a core geometry type for `Rect`/`Size2D` or define locally? | (a) define `Size2D`/`Rect` locally in `src/layout/types.ts` — **`@jsvision/core` exports no `Rect`/`Size`/geometry type** (verified: `grep` of `engine/index.ts` + `engine/**` finds none); (b) reuse a core type (not viable — none exists) | **(a) define locally** — only viable option | ✅ Resolved |
| PA-3 | API / Defaults | What do omitted `LayoutProps` default to? | (a) **CSS-flex-parity**: `direction:'row'`, `size:{kind:'auto'}`, `justify:'start'`, `align:'stretch'`, `gap:0`, `padding:0`; (b) `direction:'col'` default (app-shell-oriented; diverges from CSS); (c) make `direction`/`size` required (verbose, zero implicit behavior) | **(a) CSS-flex-parity defaults** — every box may override | ✅ Resolved (user) |
| PA-4 | Naming | Plan/feature dir name | `layout-engine` plan dir; `packages/ui/src/layout/` source dir (already exists from the spike; matches RD-02 + AR-19/ADR-008) | **As stated** — only viable per project conventions | ✅ Resolved |
| PA-5 | Algorithm | How does `auto` sizing integrate with the existing `solveTrack`? | (a) **pre-resolve `auto` to a fixed cell count** (via `measure()` for a leaf, or derived-from-children for a container) *before* the track solve, then map each child to a `TrackItem` (`fixed`/resolved-`auto` → `fixed`; `fr` → `flex`) and call `solveTrack` — reuses the golden-tested core unchanged; (b) extend `solveTrack` to know about `auto` (rejected: complicates the de-risked core, mixes intrinsic sizing into distribution) | **(a) pre-resolve `auto` → fixed, then `solveTrack`** | ✅ Resolved (dominant) |

## Inherited requirements decisions (RD-02 AR-NN) — traceability

Already resolved in `requirements/00-ambiguity-register.md`; listed so plan docs can
back-reference them. Not re-opened.

| AR # | Decision (summary) |
|------|--------------------|
| AR-19 | Build cell-native pure-TS flex engine in `src/layout/` on the apportionment spike (per ADR-008); grid Tier 2 |
| AR-20 | Sizing model: `fixed` cells · `fr` grow-weight · `auto` (content) tokens |
| AR-21 | `auto`/intrinsic sizing via a `measure(available) → natural size` seam (else derived-from-children) |
| AR-22 | v1 primitives: `row` + `col` only (2-D via nesting); grid Tier 2; stack/overlay deferred |
| AR-23 | Layout input: a standalone `LayoutBox = { props, children, measure? }` tree (view-independent) |
| AR-24 | Justify (main axis): `start` / `center` / `end` / `space-between` |
| AR-25 | Align (cross axis): `start` / `center` / `end` / `stretch`, default **stretch** |
| AR-26 | min/max constraints: **deferred** (documented limitation) |
| AR-27 | Output: **parent-relative** integer rects |
| AR-28 | Overflow: fixed/auto exceeding the container **extend past the edge** (renderer clips); `fr` clamps to 0; no shrink |
| AR-29 | Both `gap` (between children) and `padding` (container content inset) in v1 |

> **Gate enforcement:** every design/scope/algorithm decision in the plan documents
> back-references a `PA-NN` (plan) or `AR-NN` (requirements) entry above. Zero items
> deferred; the user confirmed PA-1 and PA-3 on 2026-06-29; PA-2/PA-4/PA-5 are
> single-viable-option decisions recorded for traceability.
