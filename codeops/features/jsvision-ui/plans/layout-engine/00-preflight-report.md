# Preflight Report — Layout Engine (RD-02)

> **Artifact**: `plans/layout-engine/` (8 docs: index, ambiguity register, requirements,
> current-state, 03-01, 03-02, testing-strategy, execution-plan)
> **Date**: 2026-06-29 · **CodeOps Skills Version**: 2.0.0
> **Outcome (iteration 1)**: ✅ **PASSED** — all 6 findings (1 🟠, 4 🟡, 1 🔵) resolved by
> applying the recommended fixes (user-approved 2026-06-29).
> ⚠️ **Same-author model**: the plan was authored by make_plan (likely the same model family).
> Findings below cite specific code per the same-author safeguard; consider a second pair of
> eyes on PF-001.

---

## Codebase Context Summary

- **Target**: greenfield additions under `packages/ui/src/layout/` (`types.ts`, `measure.ts`,
  `layout.ts`), extending the landed ADR-008 spike (`apportion.ts` + `index.ts`).
- **Spike verified** (`packages/ui/src/layout/apportion.ts`): `apportion` @ `:31`,
  `solveTrack` @ `:74`, `TrackItem` @ `:17` — line refs in 02-current-state are **accurate**.
  `solveTrack` overflow behavior (fixed kept at full size when `free` clamps to 0) matches the
  plan's overflow claim. Hand-traced ST-01/02/03 against `apportion`/`solveTrack` → exact
  matches (`[3,7]`, `[27,27,26]`, `[5,8,7]`).
- **PA-2 verified**: `@jsvision/core` exports **no** `Rect`/`Size2D`/`Padding` geometry type
  (grep over `packages/core/src/` finds only unrelated `fillRect`). Defining locally is correct
  and the only viable option.
- **Barrel reality** (`packages/ui/src/index.ts`): layout is re-exported by **explicit named
  exports** (`:19` `export { apportion, solveTrack }`, `:20` `export type { TrackItem }`) — NOT
  `export *`. Reactive uses `export *` (`:23`). This drives PF-001.
- **RD-02 / ADR-008 / roadmap**: all present; AC-1…AC-18 ↔ ST-01…ST-18 map 1:1 and faithfully;
  roadmap RD-02 row = `Plan Created` 📋, recommends preflight next.

---

## Findings

### 🟠 PF-001 (MAJOR) — "already flows to src/index.ts" is false for new symbols
- **Where**: `02-current-state.md:30`; `99-execution-plan.md` T1.6, T4.2.
- **Claim**: "Extend `layout/index.ts`; **it already flows to `src/index.ts`** via the layout
  export line (`src/index.ts:19`)" and T4.2 "re-exported through `reactive`-style barrel".
- **Reality**: `src/index.ts:19-20` re-exports layout by **explicit named exports**
  (`export { apportion, solveTrack }` / `export type { TrackItem }`), unlike reactive's
  `export *` (`:23`). New symbols (`layout`, `LayoutBox`, `LayoutProps`, `Size`, `Rect`, …)
  added to `layout/index.ts` will **not** surface through `@jsvision/ui` until `src/index.ts:19-20`
  are edited too. AC-17 / ST-17 (import from `@jsvision/ui`) depends on this.
- **Backstop**: ST-17 (a spec test) would catch it red in Phase 4 — so it's self-correcting, not
  silent. But the plan's mechanism statement is wrong and the remediation step is absent from the
  task list.
- **Options**: (a) add a task / amend T1.6+T4.2 to **also edit `src/index.ts:19-20`** (add the new
  named exports + `export type`) — matches current layout style; (b) convert both
  `layout/index.ts` and `src/index.ts` layout lines to `export *` — matches reactive, then symbols
  truly flow. **Recommend (a)** — smaller, keeps the explicit type/value split already at
  `src/index.ts:19-20`; fix the "already flows" wording in 02.

### 🟡 PF-002 (MINOR) — cyclic / shared `LayoutBox`: decision RD-02 explicitly deferred to planning
- **Where**: RD-02 §Security/Availability: "*planning should decide whether to guard against
  accidental cycles or document the precondition*"; plan is silent (07 + ST-18 only assert
  "bounded traversal of a **finite** tree").
- **Two sub-issues**: (1) a cyclic graph → unbounded recursion / stack overflow (no guard, not
  documented as a precondition); (2) a **shared** node (same `LayoutBox` instance at two
  positions — a DAG, not even a cycle) collapses in `LayoutResult = Map<LayoutBox, Rect>` to one
  rect (last-write-wins), silently contradicting "one entry per box".
- **Options**: (a) **document the precondition** ("input must be an acyclic tree of distinct box
  instances") in 03-01/03-02 + add an ST/impl note — zero runtime cost, consistent with the
  pure-function design; (b) add a `visited`/depth guard that throws `TuiError` on cycle/reuse —
  small overhead, defensive. **Recommend (a)** — the RD frames cycles as a caller-contract
  violation; documenting satisfies its explicit "decide" ask without taxing the hot path.

### 🟡 PF-003 (MINOR) — `measure(available)`: the value of `available` is unspecified
- **Where**: 03-01 §Intrinsic sizing step 1 returns `box.measure(available)`; main-axis sizing
  step 1 calls `naturalSize(child, available)` — but no doc says **what** `available` is
  (viewport? parent content box? remaining main? `Infinity`?). `layout.ts` entry (03-02) never
  shows it being threaded.
- **Why it matters**: ST-04 uses a constant `measure()→{5,1}` that ignores `available`, so it's
  untested — yet the canonical real use (a label/text wrapping to width) **depends** on
  `available`. Leaving it undefined invites inconsistent widget `measure` implementations in RD-03.
- **Recommend**: specify `available` = the container's **content-box `Size2D`** at the point of
  measuring (post-padding), and thread it explicitly in 03-01/03-02. One sentence + a parameter in
  the algorithm description.

### 🟡 PF-004 (MINOR) — `justify` center/end + overflow (no `fr`) can produce negative offsets
- **Where**: 03-02 step 3: "else distribute `free` by `justify`: … `end` → run at `free`;
  `center` → run at `floor(free/2)`" with **no clamp of `free` to ≥ 0**.
- **Edge**: a `row` width 6, `[fixed 4, fixed 4]`, `justify:'end'` → `free = -2` → first child at
  `x = -2`, i.e. extends past the **near** edge. AR-28 specifies overflow "extend past the
  **[far]** edge". The overflow note in 03-02 only covers the `fr`-present and `start` paths;
  center/end + overflow is unspecified and untested (ST-12 includes an `fr` child, so it hits the
  `free=0` branch).
- **Recommend**: clamp `free = max(0, …)` before applying justify offsets, so overflow always
  extends past the far edge regardless of `justify` (then document it). Add an impl-test row.

### 🟡 PF-005 (MINOR) — `packaging.impl` referenced but never created
- **Where**: 07 §impl lists a "**packaging.impl**: re-export shape; apportion/solveTrack still
  exported unchanged" bullet, but 02 §Test file layout lists only `layout.packaging.spec.test.ts`
  (no `.impl`), and 99 T4.1 creates only the spec file.
- **Recommend**: either add `layout.packaging.impl.test.ts` to the 02 tree + a T4.x task, or fold
  the "spike still exported" check into `packaging.spec` and drop the orphan bullet from 07.

### 🔵 PF-006 (OBSERVATION) — `gap` + `space-between` composition unspecified
- **Where**: 03-02 step 3 `space-between` distributes leftover into inter-child gaps via
  `apportion(free, ones)`, but doesn't say whether that is **in addition to** the base `gap` prop
  or replaces it. No AC/ST exercises `gap` together with `space-between`, so it's a latent corner.
- **Recommend**: one clarifying sentence (CSS treats `gap` as a floor and `justify-content`
  distributes the remainder on top). Optional; not blocking.

---

## Decisions log

All findings resolved via recommended fix (user: "Apply the recommended fixes", 2026-06-29):

- **PF-001** ✅ Fixed — `02-current-state.md:30` reworded (explicit named exports, not `export *`);
  `99` T1.6 + T4.2 now require editing `src/index.ts:19-20` too.
- **PF-002** ✅ Fixed (opt a) — acyclic + distinct-instance precondition documented in `03-01`
  (LayoutBox JSDoc + §note); no runtime guard.
- **PF-003** ✅ Fixed — `03-01` adds an "`available` semantics" definition (= measuring container's
  content box; root = viewport); `03-02` step 2 threads it.
- **PF-004** ✅ Fixed — `03-02` step 3 clamps `free = max(0, …)` (overflow always extends past the
  far edge for any `justify`); `07` align.impl adds the overflow + non-`start`-justify row.
- **PF-005** ✅ Fixed (fold) — orphan `packaging.impl` bullet removed from `07`; re-export check
  folded into ST-17 with an explicit note.
- **PF-006** ✅ Fixed — `03-02` clarifies `space-between` distributes leftover **on top of** the
  base `gap`; `07` align.impl covers it.

**Status: ✅ PASSED.** No 🔴/🟠 outstanding. Ready for `exec_plan layout-engine`.
