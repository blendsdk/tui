# Preflight Report: RD-10 Non-Functional Requirements

> **Status**: ✅ PASSED — all 9 findings resolved (0 critical, 1 major, 6 minor, 2 observation); fixes applied to the plan docs
> **Iteration**: 1 (first scan + applied resolutions)
> **Artifact**: Implementation plan at `plans/rd-10-non-functional/` (11 docs)
> **Codebase Grounded**: ~20 source/test/config files examined; ~30 references verified
> **Last Updated**: 2026-06-28
> **Session note**: Reviewed in a fresh session (plan authored earlier). Same-agent bias mitigated by verifying every code claim against source (esbuild nature, `collectBytes` race, mono SGR path).

## Codebase Context Summary

**Tech Stack:** TypeScript ESM-only, zero runtime deps; `node:test` via `tsx`; ESLint+Prettier; Node ≥18. Dev deps: `@xterm/headless`, `tsx`, `typescript`, etc.
**Architecture:** Foundation-first `src/engine/**` subsystems (capability, input, render, color, host, safety) behind a single entry point `src/engine/index.ts`. All tests in `test/`. Cross-OS test discovery via `scripts/run-tests.mjs` (scans `test/` only). `verify` = typecheck + typecheck:examples + **build** + test (build precedes test).
**Key Files Examined:** `src/engine/index.ts`, `render/{types,buffer,serialize,glyphs}.ts`, `color/encode.ts`, `capability/{profile,query,index}.ts`, `test/golden-screen-helpers.ts`, `test/render-bytes-damage.spec.test.ts`, `scripts/{run-tests,check-no-native-deps}.mjs`, `.github/workflows/ci.yml`, `package.json`, `tsconfig.json`, `README.md`, `plans/00-roadmap.md`.

**Reference verification — verified accurate:**
- `serialize(current, prev, opts)`, `ScreenBuffer(w,h,fill)`, `.set(x,y,char,style)`, `.box(x,y,w,h,style,'single')` — all signatures match plan code samples.
- `Attr.reverse` (bit 1<<5), `Style.attrs?` — exist (`render/types.ts:49,57`).
- `resolveCapabilities`/`resolveCapabilitiesAsync`, `override: DeepPartial<CapabilityProfile>`, `colorDepth: 'mono'` valid, `glyphs.boxDrawing` nested correctly (`capability/profile.ts:17,54-72,107-128`).
- `timeoutMs` default 200 (`DEFAULT_QUERY_TIMEOUT_MS`, `query.ts:22`).
- **ST-5 oracle sound:** `encodeStyle` at `mono` returns no color params but still emits attribute SGR incl. reverse code 7 (`color/encode.ts:50,106-108`) → focus conveyed.
- **ST-6 oracle sound:** glyph fallback maps box runes → `+ - |` (`render/glyphs.ts:18-39`); `serialize` applies `fallbackGlyph` per `caps` (`serialize.ts:92`).
- Golden helpers `makeTerm/feed/readCell` exist; `@xterm/headless` cell exposes `isInverse()` (`xterm-headless.d.ts:1157`).
- `RESPONSE_BUFFER_CAP = 1024` (`query.ts:25`); CI audit step present (`ci.yml:54`); `examples/resize-demo` exists; no `CHANGELOG.md`/`bench/`; `docs/` holds only `acceptance-gate.md`.
- `check:deps` inspects **runtime** deps only (`check-no-native-deps.mjs:65`) → a dev-only esbuild stays green.

### Summary by Dimension

| # | Dimension | Findings | Highest |
|---|-----------|----------|---------|
| 1 | Ambiguities | PF-003 | 🟡 |
| 4 | Completeness Gaps | PF-007, PF-009 | 🟡 |
| 6 | Feasibility | PF-005, PF-006 | 🟡 |
| 7 | Testability | PF-001, PF-003, PF-005 | 🟠 |
| 9 | Edge Cases | PF-001, PF-006 | 🟠 |
| 12 | Consistency | PF-002, PF-004 | 🟡 |
| 13 | Codebase Alignment | PF-002 | 🟡 |
| — | Scope/CI cost | PF-008 | 🔵 |

### Summary by Severity

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | — |
| MAJOR | 1 | ✅ resolved (PF-001) |
| MINOR | 6 | ✅ resolved |
| OBSERVATION | 2 | ✅ resolved |

### Resolution log (iteration 1, applied 2026-06-28)

| Finding | Resolution | Files edited |
|---|---|---|
| PF-001 | Detection stub now blocks forever; off-CI asserts both lower (`>= timeoutMs·0.5`) and upper (`<= timeoutMs+60`) bounds | `03-01`, `07` |
| PF-002 | esbuild restated as dev-only prebuilt platform binary (no compile); `check:deps` runtime-only | `01`, `00-ambiguity-register`, `03-02` |
| PF-003 | Size-independence is now **exact byte equality** at a shared coordinate — no magic constant | `03-01`, `07` |
| PF-004 | New case labelled `RD10-ST-2` to avoid colliding with RD-09 ST-20/ST-21 | `03-01`, `07`, `99` |
| PF-005 | Bench exports pure helpers; CLI behind an `import.meta.url` main-guard | `03-01`, `99` |
| PF-006 | Added `TUI_SKIP_PERF` opt-out alongside `CI`; documented in README perf note | `03-01`, `99` |
| PF-007 | Task 6.1.4 now also closes RD-09 DEF-4 in the roadmap | `99` |
| PF-008 | Informational CI bench scoped to one matrix cell | `99` |
| PF-009 | Added `docs-presence.spec` (ST-9) guarding generated docs, like `gate.spec` | `03-05`, `07`, `99`, `00-index` |

---

### PF-001: Detection-budget stub completes instantly — never exercises the timeout it claims to verify 🟠 MAJOR

**Dimension:** Testability (7) / Edge Cases (9)
**Location:** `03-01-performance-budgets.md` "Detection budget" (stub `read: async function* () { /* yields nothing */ }`); `07-testing-strategy.md` ST-3.
**Codebase Evidence:** `src/engine/capability/query.ts:84-110` (`collectBytes`): the read loop `for await (const chunk of query.read())` over an async generator that yields nothing **returns immediately** with `'end'`, so `Promise.race([readLoop, timeout])` settles via `readLoop` in ~0 ms — the `setTimeout(timeoutMs)` branch is never reached.
**The Problem:** ST-3's intent is "a *non-responding* query completes via fallback **within `timeoutMs`+slack** (not hang)". The proposed stub does the opposite of non-responding: it ends the stream instantly. The test would pass (~0 ms ≤ 120+slack, valid fallback profile), but it exercises the *empty-stream* path, **not** the timeout race. A regression that broke or removed the timeout would not be caught — the assertion gives false confidence in the budget. The doc's own two phrasings conflict ("never yields" vs "yields nothing").

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Stub `read()` returns an async iterable that **blocks forever** (yields nothing and never returns, e.g. `read: () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) })`). The `timeout` branch wins the race; off-CI assert elapsed ∈ [timeoutMs, timeoutMs+slack]. | Genuinely tests the budget; catches a removed/broken timeout | Slightly more stub boilerplate; must keep `timeoutMs` small (e.g. 50–120 ms) to stay fast |
| B | Keep the instant-end stub but rename the case to "empty-stream fallback" and drop the budget/timing claim. | Trivial | Abandons ST-3's actual requirement (the ≤200 ms budget, RD-10 AC-3) — leaves the budget untested |

**Recommendation:** Option **A** — a blocking async iterator is the only stub that proves the ≤`timeoutMs` bound RD-10 AC-3 requires. The current sample (B-shaped) silently fails to test its own oracle. Off-CI assert `elapsed >= timeoutMs && elapsed <= timeoutMs + slack`; under CI assert completion + valid fallback only (per AR-12).

**User Decision:** Resolved — user accepted the recommendation; applied to the plan docs (iteration 1, 2026-06-28).

---

### PF-002: esbuild described as "pure-JS" — it ships a prebuilt platform-native binary 🟡 MINOR

**Dimension:** Codebase Alignment (13, Dependency Reality) / Consistency (12)
**Location:** `01-requirements.md` Compatibility ("dev dep `esbuild` must be pure-JS-installable (no native build)"); `00-ambiguity-register.md` AR-4; `03-02` error table ("esbuild ships prebuilt pure-use binaries").
**Codebase Evidence:** `scripts/check-no-native-deps.mjs:48-53,65` — the guard reads **runtime** `dependencies` only and flags any `os`/`cpu` constraint as native. esbuild distributes platform binaries via `@esbuild/<os>-<cpu>` optional deps (each carrying `os`/`cpu`), but as a *dev* dep its tree is never traversed by the guard.
**The Problem:** The decision is sound (esbuild needs **no compile step** — no node-gyp — and ships prebuilt binaries for linux/darwin/win32, so a clean cross-platform install works and `check:deps` stays green because it's dev-only). But the *description* "pure-JS" is inaccurate and internally contradictory ("pure-JS" vs "prebuilt binaries"). Left uncorrected, a future reader could wrongly conclude esbuild is JS-only, or that its platform deps would trip `check:deps`.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Restate AR-4 / 03-02 as: "esbuild is **dev-only**; ships a **prebuilt platform binary** (no node-gyp/compile step), so a clean install works on all 3 OS and `check:deps` (runtime-only) stays green." | Accurate; preserves the (sound) decision; removes the contradiction | Small doc edit |
| B | Leave as-is. | No work | Inaccurate technical claim survives into an immutable register; same-blindspot risk |

**Recommendation:** Option **A** — keep the decision, fix the characterization. The requirement that actually matters ("clean install never invokes node-gyp", cross-platform) is met; only the "pure-JS" wording is wrong.

**User Decision:** Resolved — user accepted the recommendation; applied to the plan docs (iteration 1, 2026-06-28).

---

### PF-003: ST-2 size-independence oracle has no concrete, derived threshold ("comparable within a small constant factor") 🟡 MINOR

**Dimension:** Ambiguities (1) / Testability (7)
**Location:** `03-01` "Size-independence"; `07-testing-strategy.md` ST-2 ("bounded and **comparable** across sizes").
**Codebase Evidence:** `test/render-bytes-damage.spec.test.ts:33-43` — the existing oracle uses a concrete relation (`single < full / 10`). A single-cell diff's bytes are *not* constant across sizes: `serialize` emits a cursor address (`CSI row;col H`) whose digit count grows with coordinates (`\x1b[8;8H` vs `\x1b[50;200H`), plus the cell + SGR. So bytes grow ~logarithmically, not flat.
**The Problem:** A `*.spec.test.ts` is an immutable oracle and must encode a falsifiable expectation. "Comparable within a small constant factor" is a weasel value — the implementer must invent a number, which the plan's own authoring rule forbids ("if an expected value cannot be derived from a contract/budget, register it before coding"). Too loose a factor catches no regression; too tight flakes on the digit-count difference.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Register a concrete bound now, derived from the math: e.g. `bytes(200×50) <= bytes(8×8) + C` where C covers the extra address digits (a handful of bytes), or `bytes(200×50) <= bytes(8×8) * 2`. Put the derivation in the test comment. | Falsifiable, regression-catching, satisfies the authoring rule | Requires a 5-minute derivation up front |
| B | Assert each update is `< K` absolute bytes for a small constant K (e.g. both `< 32`). | Simplest; directly bounds "O(1) in area" | K is still a chosen constant; must justify it |

**Recommendation:** Option **A** — an additive/2× relational bound is the most defensible "independent of area" oracle and mirrors the file's existing relational style. Register the chosen value in the ambiguity register before coding ST-2.

**User Decision:** Resolved — user accepted the recommendation; applied to the plan docs (iteration 1, 2026-06-28).

---

### PF-004: New "ST-2" collides with the RD-09 ST-20/ST-21 already living in `render-bytes-damage.spec.test.ts` 🟡 MINOR

**Dimension:** Consistency (12)
**Location:** Plan calls the new case "ST-2" and adds it to `render-bytes-damage.spec.test.ts`.
**Codebase Evidence:** `test/render-bytes-damage.spec.test.ts:28,33` — existing tests are named `ST-20` and `ST-21` (RD-09 numbering). RD-10's own table also defines an `ST-2`.
**The Problem:** Two numbering schemes converge in one file: an RD-10 `ST-2` test sitting beside RD-09 `ST-20`/`ST-21` is ambiguous lineage (is `ST-2` a truncated `ST-2x`? which RD owns it?). Hurts traceability when someone greps `ST-2`.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Name the new test with an RD-namespaced label, e.g. `RD10-ST-2: single-cell update is size-independent`, and add a header comment noting it extends the RD-09 file. | Unambiguous lineage; greppable | Slightly longer name |
| B | Keep `ST-2` but add a clarifying comment. | Minimal | Bare `ST-2` still collides on grep |

**Recommendation:** Option **A** — namespace the label so RD-09 and RD-10 oracles in the shared file stay distinguishable.

**User Decision:** Resolved — user accepted the recommendation; applied to the plan docs (iteration 1, 2026-06-28).

---

### PF-005: Shared perf helper has no defined home and risks running the bench on import; spec couples to an impl helper 🟡 MINOR

**Dimension:** Feasibility (6) / Testability (7)
**Location:** `99-execution-plan.md` task 1.2.2 ("shared measure/median helper … `bench/frame-bench.mjs` (or a tiny helper)"); `03-01` ST-1 sample uses `measureComposeDiff(...)`; `perf-budget.impl.test.ts` tests the median math.
**Codebase Evidence:** `scripts/gate.mjs` / `scripts/run-tests.mjs` run their CLI logic at top level (no main-guard). If `bench/frame-bench.mjs` follows that style and the spec/impl tests `import` the median helper from it, **importing executes the bench** (prints, and per 03-01 "exits 0" → `process.exit` would abort the test run).
**The Problem:** (a) The helper's location is left undecided, blocking the spec (1.1.1) that imports it. (b) Putting the pure helper inside a runnable, side-effecting `.mjs` makes it unsafe to import. (c) A `*.spec.test.ts` importing an impl-side `measureComposeDiff` couples the immutable oracle to implementation internals.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Put the pure measure/median helper in its own no-side-effect module (e.g. `bench/measure.mjs` or `test/perf-helpers.ts`), import it from spec, impl, and the bench; keep the runnable bench CLI behind an `import.meta.url === pathToFileURL(process.argv[1]).href` main-guard. | Safe to import; one source of truth; bench stays runnable | One extra small module |
| B | Inline the measure/median in each test; bench keeps its own copy. | No import coupling | Duplicated logic (violates DRY) |

**Recommendation:** Option **A** — a side-effect-free helper module + main-guarded bench. Decide its path before writing the spec (task 1.1.1) so the red/green ordering is clean.

**User Decision:** Resolved — user accepted the recommendation; applied to the plan docs (iteration 1, 2026-06-28).

---

### PF-006: 16 ms hard assert keyed only on `CI` can spuriously fail contributors on slow/throttled machines 🟡 MINOR

**Dimension:** Feasibility (6) / Edge Cases (9)
**Location:** `03-01` ceiling sample (`if (process.env.CI) … else assert median <= 16`); AR-2.
**Codebase Evidence:** `package.json` — `verify` runs `test`, which runs every `*.spec.test.ts` including this ceiling. `process.env.CI` is the only escape hatch.
**The Problem:** "Off-CI" ≠ "modern dev machine". A contributor on an older laptop, a low-priority container, a battery-throttled CPU, or an emulated VM has no `CI` set, so `npm run verify` hard-fails on a budget that reflects *their hardware*, not a real regression. AR-2 addressed CI jitter but not slow-yet-legitimate local environments — this is new information, not a re-litigation of AR-2's core choice.
**Related:** AR-2 chose the local hard assert deliberately; this finding augments it with an escape hatch, not an overturn.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Add a second opt-out alongside `CI` (e.g. skip the hard assert when `TUI_SKIP_PERF` is set) and document it in the README/CONTRIBUTING perf note. | Cheap; unblocks slow machines without weakening CI/default behavior | One more env var to document |
| B | Keep `CI`-only gating but document clearly that a local ceiling failure on slow hardware is expected and how to bypass (set `CI=1` locally). | No code change | Overloads `CI` semantics; surprising |
| C | Leave exactly as planned. | No work | Real risk of spurious local `verify` failures for some contributors |

**Recommendation:** Option **A** — a dedicated `TUI_SKIP_PERF` opt-out keeps the default strict (catches regressions on capable machines) while giving slow environments a documented, non-`CI` escape.

**User Decision:** Resolved — user accepted the recommendation; applied to the plan docs (iteration 1, 2026-06-28).

---

### PF-007: RD-09 DEF-4 closure not tracked when RD-10 lands the bench 🟡 MINOR

**Dimension:** Completeness Gaps (4)
**Location:** `99-execution-plan.md` Phase 6.1.4 (roadmap → RD-10 Implemented + DEF-1…3); plan repeatedly claims it "resolves RD-09 DEF-4".
**Codebase Evidence:** `plans/00-roadmap.md:60` — RD-09 still lists "**DEF-4** wall-clock perf budgets (→RD-10)" as deferred.
**The Problem:** Phase 6 updates only the RD-10 row + RD-10's own DEF-1…3. Nothing flips RD-09's DEF-4 to resolved. After RD-10 ships the bench/ceiling, the roadmap will still advertise DEF-4 as open, contradicting RD-10's stated outcome.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Add to task 6.1.4: mark RD-09 **DEF-4** resolved (pointing at the RD-10 bench + ceiling spec) in `plans/00-roadmap.md`. | Keeps cross-RD deferral ledger accurate | One extra roadmap edit |
| B | Leave DEF-4 as-is. | No work | Roadmap drift; DEF-4 looks open forever |

**Recommendation:** Option **A** — close the loop you opened; the plan's value claim ("resolves DEF-4") should be reflected in the roadmap ledger.

**User Decision:** Resolved — user accepted the recommendation; applied to the plan docs (iteration 1, 2026-06-28).

---

### PF-008: Informational CI bench step will run on all 9 matrix cells unless scoped 🔵 OBSERVATION

**Dimension:** Scope / CI cost
**Location:** `99-execution-plan.md` task 6.1.1 ("add an informational `bench` step").
**Codebase Evidence:** `.github/workflows/ci.yml` — single job over the 3-OS × Node 18/20/22 matrix; a step added to it runs in every cell (9×).
**The Problem:** A purely informational bench printed 9× is noise and cost, and a `.mjs`/tsx invocation may hit Windows shell-quoting quirks for no gated benefit.
**Recommendation:** Scope the bench step to one representative cell (e.g. `if: matrix.os == 'ubuntu-latest' && matrix.node == '20'`). Low stakes — note and proceed.

**User Decision:** Resolved — user accepted the recommendation; applied to the plan docs (iteration 1, 2026-06-28).

---

### PF-009: techdocs output guarded only by a manual presence check 🔵 OBSERVATION

**Dimension:** Completeness Gaps (4)
**Location:** `03-05-documentation-techdocs.md` ("a light presence check … done during the docs phase verify"); contrast `03-04` which adds `api-stability.spec` to guard CHANGELOG/README.
**Codebase Evidence:** `test/gate.spec.test.ts` exists precisely to keep a doc (the gate doc) from rotting — an established pattern in this repo.
**The Problem:** The CHANGELOG/README governance docs get a spec guard (ST-8); the techdocs architecture/API/ADR set gets only a manual eyeball. Inconsistent durability — generated docs can silently disappear or never get committed without verify noticing.
**Recommendation:** Consider a tiny presence spec (assert `docs/` contains the overview + API reference + an ADR file) mirroring `api-stability.spec`/`gate.spec`. Optional — techdocs has its own health check; note and decide.

**User Decision:** Resolved — user accepted the recommendation; applied to the plan docs (iteration 1, 2026-06-28).

---

## Adversarial checklist (same-agent bias)

- *What assumption might I be confirming?* That every code reference is right — so I verified the two riskiest mechanically (esbuild's binary nature → PF-002; the `collectBytes` race against the stub → PF-001). Both turned up real issues.
- *External standard?* Keep-a-Changelog / SemVer wording in `03-04` is conventional and non-load-bearing; not independently re-derived (low stakes).
- *What would a skeptic flag?* The detection-budget test (PF-001) and the undefined "comparable" oracle (PF-003) — both now findings.
