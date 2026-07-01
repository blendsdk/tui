# Deferred-Items Register — jsvision UI

> **Scope**: The `@jsvision/ui` feature-set. A **single consolidated index** of every capability that
> was intentionally deferred (cut from a v1 RD scope but meant to be revisited), so nothing is lost
> between RDs. Created 2026-06-30 at the user's request (amends AR-99 — the per-RD "Won't Have / Deferred"
> tables remain the **authoritative** source; this doc aggregates them and adds stable `DEF-NN` ids).
> **Last Updated**: 2026-07-01 (DEF-19 corrected — audit found no `Input` caret is rendered at all)
> **CodeOps Skills Version**: 3.1.0

**How to use:** when a future RD is drafted, scan this register for items whose **Intended owner** is
that RD (or "unassigned"), pull them into its scope, and flip the row's **Status** to `→ <RD>` /
`Shipped`. The owning RD's own Won't-Have/Deferred table is the source of truth for the exact wording.

---

## A. Actionable deferred items (intended to revisit)

| ID | Deferred item | From (RD · AR) | Intended owner | Status |
|----|---------------|----------------|----------------|--------|
| **DEF-01** | `Input` text **selection** + cut/copy/paste **clipboard** | RD-06 · AR-94 | **RD-07** (control completions) | Deferred (tracked) |
| **DEF-02** | `picture(mask)` validator (`TPXPictureValidator` mask mini-DSL) | RD-06 · AR-95 | **RD-07** | Deferred (tracked) |
| **DEF-03** | `MultiCheckGroup` (`TMultiCheckBoxes`, multi-bit checkboxes) | RD-06 · AR-96 | **RD-07** | Deferred (tracked) |
| **DEF-04** | **Context-sensitive status line** — TV help-context ranges (items swap by the focused view's help context) | RD-05 · AR-72 (re-noted RD-10) | unassigned (status enhancement; likely RD-07) | Deferred |
| **DEF-05** | **Keyboard-driven move/resize mode** + `Commands.move`/`resize` | RD-05 · AR-85/PF-004 (re-noted RD-10) | unassigned (a WM keyboard-mode RD) | Deferred |
| **DEF-06** | **2-D `grid` layout** (fixed/`fr`/`auto` tracks in two axes) — added later behind the same `layout()` interface | RD-02 · AR-22 | unassigned (ADR-008 Tier 2; on real need) | Deferred |
| **DEF-07** | `stack` / z-overlap layout container | RD-02 · AR-22 | unassigned | Deferred — **partially mitigated** by RD-05's `position:'absolute'`+`rect` (windows/modals place absolutely) |
| **DEF-08** | `min`/`max` size **constraints** (constrained apportionment) | RD-02 · AR-26 | unassigned (real effort; on need) | Deferred (documented limitation) |
| **DEF-09** | **Per-subtree live theme override** (the inheritance mechanism; only the seam shipped) | RD-03 · AR-35 | unassigned (when a widget needs it) | Deferred (seam present) |
| **DEF-10** | `visibility:hidden` (space-reserving hide; only `display:none`/`visible:false` ships) | RD-03 · AR-41 | unassigned (separate prop later) | Deferred |
| **DEF-11** | **Sibling occlusion / `exposed()` cover-detection** (overdraw optimization) | RD-03 · AR-34 | unassigned (perf; damage-diff suffices now) | Deferred |
| **DEF-12** | **Typed broadcast / message bus** (cross-view messaging) | RD-04 → RD-05 Won't-Have | unassigned (RD-01 signals serve for now) | Deferred (unbuilt) |
| **DEF-13** | **Timer-queue wrapper** (managed timers) | RD-04 → RD-05 Won't-Have | unassigned (Node native timers serve for now) | Deferred (unbuilt) |
| **DEF-14** | **Async / resource primitives** (Suspense-style `createResource`, transitions) | RD-01 Won't-Have | unassigned (on real need) | Deferred |
| **DEF-15** | **Store / nested-proxy reactivity** (deep object reactivity) | RD-01 Won't-Have | unassigned (signals only for now) | Deferred |
| **DEF-16** | **Input modal focus-trap on invalid** (TV `valid()`-gate vetoes leaving an invalid blocking field) | RD-06 plan · PA-2 | **RD-11** (Dialog's modal `valid()` sweep) | Deferred (RD-06 exposes `valid()`+`invalid`, no trap) |
| **DEF-17** | **Multi-column cluster layout** (TV `TCluster` flows `size.y` rows per column + `←`/`→` nav) | RD-06 plan · PA-6 | unassigned (on real need) | Deferred (RD-06 is single-column) |
| **DEF-18** | **`Text` center/right alignment** (TV `TStaticText` leading-`0x03` center marker) | RD-06 plan · PA-14 | unassigned (optional) | Deferred (RD-06 is word-wrap left-aligned) |
| **DEF-19** | **Visible text cursor for the focused `Input`** — *no caret is shown today.* Two parts: **(a)** an in-buffer **logical** caret cell at `curPos − firstPos + 1` when focused (the RD-06 plan `03-05-input.md` specified this, but `Input.draw` renders none — implementable now, **no new infra**); **(b)** the real terminal **hardware/blinking** caret (`CSI row;col H` via `cursor.show()/to()`), which needs a `View`→host caret seam (`RenderRoot`/`EventLoop`/`host.render(buffer)` carry no caret). | RD-06 plan · PF-002 · audit 2026-07-01 | **RD-07** (host design pass); part (a) pullable sooner | Deferred — **correction**: the prior "logical caret rendered in the buffer" note was inaccurate; **neither** caret is rendered yet |

> `unassigned` = no gated RD owns it yet; pull it into the first RD that needs it (this register is the
> safety net). The `RD-07`-targeted rows (DEF-01…DEF-03) are also mirrored in RD-06's Deferred table +
> the RD-07 roadmap row.

## B. Whole-RD scope already owned by a roadmap row (lower risk — listed for completeness)

| Reserved scope | Owner | Status |
|----------------|-------|--------|
| `ScrollBar` · `Scroller` · `ListView` (+`ListBox`) · rich `Dialog` | **RD-11** (sibling of RD-06, AR-93) | 🟡 Stub — authored after RD-06 |
| High-value controls: `History` · `Tree` · `ComboBox` · `Tabs` · `Table`/`DataGrid` · `ProgressBar`/`Spinner` · `Surface` (+ DEF-01…DEF-03) | **RD-07** | ⬜ Backlog |
| Editor family (`Editor`/`Memo`/`EditWindow`/`Indicator`/`Terminal`) | **RD-08** | ⬜ Backlog |
| Files package (`FileDialog`/`FileList`/`DirList`/`ChDir`) | **RD-09** (`@jsvision/files`) | ⬜ Backlog |
| Help system · `ColorDialog` family | (optional, component map Tier 3) | ⬜ Backlog |

## C. Explicit non-goals (recorded so they're not mistaken for "lost" — NOT planned)

- **JSX / declarative authoring sugar** (RD-01) — the public surface stays plain function calls; any JSX
  layer is a separate optional concern, not on the roadmap.
- **CSS-fidelity flex extras** — `flex-shrink`/`basis` triple, `wrap`, `aspect-ratio`, baseline align,
  `space-around`/`space-evenly` (RD-02 · AR-20/AR-24).
- **Other TV resize handles** — top/left-edge drag, 8-handle resize; TV's `TFrame` only exposes title
  (move), SE grip (grow-BR), SW grip (grow-BL), all of which now ship (RD-05/RD-10).

## D. Foundation feature (archived) — cross-reference only

The completed **foundation** feature-set (`@jsvision/core`, archived at `codeops/_archive/foundation/`)
carries its own deferrals, tracked in its archived roadmap + `docs/acceptance-gate.md` — **not** managed
here:
- **DEF-1** npm publish provenance · **DEF-2** dependency-license guard · **DEF-3** typed-array buffer
  backing (foundation RD-10 non-functional baseline).
- Acceptance-gate **DEFERRED** criteria: real-PTY SIGWINCH resize, cross-platform manual matrix,
  wall-clock perf on real hardware (gate criteria 6 & 9).

---

> **Maintenance:** every new RD's `add_requirement` pass appends its deferrals here (Section A) and flips
> any item it absorbs to `→ <that RD>`. Keep this in sync with the per-RD Won't-Have tables (authoritative).
