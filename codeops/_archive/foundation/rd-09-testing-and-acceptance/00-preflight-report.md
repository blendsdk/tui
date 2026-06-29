# Preflight Report: RD-09 Testing Strategy & Acceptance Gate

> **Status**: ✅ PASSED — all 7 findings resolved (0 critical, 4 major, 1 minor, 2 observation; all fixes applied to the plan)
> **Iteration**: 1 (first scan)
> **Artifact**: Implementation plan at `plans/rd-09-testing-and-acceptance/` (11 docs)
> **Codebase Grounded**: 12 source/test files examined, ~14 references verified
> **Last Updated**: 2026-06-28

> ⚠️ **SAME-AUTHOR / SAME-DAY REVIEW**: this plan was authored 2026-06-28 (the current
> day) by the same model now reviewing it (session was `/clear`-ed, so context is fresh but
> training bias is shared). Same-agent blind-spot risk is elevated — findings below were
> derived by reading the *actual* engine source, not the plan's own claims.

## Codebase Context Summary

**Repository:** `@blendsdk/tui` (TypeScript SDK, ESM-only, NodeNext, strict, zero runtime deps)
**Tech Stack:** Node ≥18, `node:test` via `tsx`, no third-party test framework. Proposed new
dev dep: `@xterm/headless` (pure-JS).
**Architecture:** Foundation-first, single public entry `src/engine/index.ts`. Pure-function
engine (`decode`/`flush`, `serialize`, `enterMode`/`leaveMode`) + native tty host behind an
injectable `RuntimeAdapter`.
**Key Files Examined:** `src/engine/input/{events,decoder}.ts`, `src/engine/input/.../responses.ts`,
`src/engine/capability/profile.ts`, `src/engine/host/{host,modes}.ts`, `src/engine/render/buffer.ts`,
`src/engine/render/serialize.ts`, `test/host-signals.e2e.test.ts`, `requirements/RD-09-*.md`, `package.json`.

**Reference Verification:** ~14 references mapped — 9 verified correct (event shapes, decoder
signatures, `colorDepth` field + values, mode sequences `?1049h`/`?25h`/`?1000h`/`?1006h`,
`createHost({caps,input,output})`, the no-node-pty harness, `serialize` signature, override API),
5 contradicted by code (`ScreenBuffer.clone`, `ScreenBuffer.set` signature, `mouse:true` override,
queries-channel assertion, `responses.json` CPR class).

### Summary by Severity

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 CRITICAL | 0 | — |
| 🟠 MAJOR | 4 | all resolved (fixed) |
| 🟡 MINOR | 1 | resolved (fixed) |
| 🔵 OBSERVATION | 2 | resolved (fixed) |

---

## PF-001: Gate criterion numbering is internally contradictory 🟠 MAJOR

**Dimension:** 3 (Logical Contradictions) / 12 (Consistency)
**Location:** `03-05-acceptance-gate.md` — the `docs/acceptance-gate.md` table (lines 76–86) vs.
the `scripts/gate.mjs` STEPS/DEFERRED (lines 50–60) and the "What gate runs" table (lines 29–35);
root cause traces to `01-requirements.md` Acceptance Criteria (lines 77–88).
**Codebase Evidence:** `requirements/RD-09-testing-and-acceptance.md:101-111` defines the canonical
11 criteria (6 = **Resize**, 7 = Paste, 8 = Clean teardown, 9 = **Cross-platform**, 10 = Security,
11 = Boundary).
**The Problem:** Two halves of the gate plan use **two different numbering schemes**:
- `docs/acceptance-gate.md` (03-05) uses the canonical RD-09 numbering: 6 = Resize (DEFERRED DEF-3),
  7 = Paste, 8 = Teardown, 9 = Cross-platform (DEFERRED), 10 = Security, 11 = Boundary. ✅ correct.
- `scripts/gate.mjs` STEPS map `verify → [1,2,3,4,5,6,8,9]`, `tier3/signals → [7]`, `probe → [9]`.
  Those numbers only make sense under the *01-requirements* renumbering (6 = paste, 7 = teardown,
  8 = security, 9 = boundary). Under the doc's numbering, `verify` would claim to cover criterion 6
  (Resize, deferred), 8 (Teardown — that's tier3, not verify) and 9 (Cross-platform, deferred).
- The `gate.mjs` `DEFERRED` example (`6: 'DEF-1 cross-platform…'`) is wrong in *both* schemes:
  criterion 6 is Resize (DEF-3), and Cross-platform is criterion 9 (DEF-1/DEF-2).

`gate.spec.test.ts` ST-24 must assert "the script's criteria↔step map matches the doc's table (no
drift)" — but with the two artifacts on different numbering, that test cannot be coherently
implemented; a number like "6" denotes Resize in the doc and paste in the script. This is the
plan's centerpiece (the go/no-go gate), so the contradiction is high-impact.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Standardize everything on the **canonical RD-09 1–11 numbering** (used by the doc table): rewrite `gate.mjs` STEPS/DEFERRED to that scheme, and re-key `01-requirements.md` AC to reference criteria by the same numbers. | One source of truth (the RD); doc already correct; ST-24 becomes implementable | Touches three docs |
| B | Standardize on the script's renumbered scheme and renumber the doc table to match. | Fewer script edits | Diverges from the canonical RD-09 gate the whole project references; loses Resize/Cross-platform as distinct numbered criteria |

**Recommendation:** **Option A** — the RD-09 source defines 11 numbered criteria and the
`docs/acceptance-gate.md` table already matches it; align `gate.mjs` and the `01-requirements.md`
AC to that single numbering so ST-24's drift assertion is meaningful. (Considered and dropped:
leaving it to the implementer to reconcile — the gate.spec is an *immutable oracle*, so the
ambiguity must be resolved in the plan, not improvised at coding time.)

**User Decision:** Resolved — User accepted the recommendation; fix applied to the plan 2026-06-28.

---

## PF-002: Golden & perf examples call `ScreenBuffer.clone()` / `set(x,y,{cell})` — neither exists 🟠 MAJOR

**Dimension:** 13 (Codebase Alignment — Phantom References / Stale Assumptions)
**Location:** `03-02-golden-screen.md` lines 67–73 (`prev.clone()`, `next.set(3, 1, { char: 'X', … })`);
`03-04-fuzz-and-perf.md` lines 70–72 (`base.clone()`, `one.set(10, 5, { char: 'Z', … })`).
**Codebase Evidence:** `src/engine/render/buffer.ts:36-230` — the public `ScreenBuffer` API is
`width`, `height`, `set(x,y,char,style,widthMode?)`, `get`, `fillRect`, `text`, `box`, `shadow`,
`rows()`. There is **no `clone()`** anywhere in `src/engine/render/` (grep confirms), and `set`'s
signature is `set(x, y, char: string, style: Style)` — char and style are **separate positional
args**, not a `{char,…}` cell object. Existing tests build buffers this way:
`test/render-serialize.spec.test.ts:52` → `current.set(5, 2, 'X', DEFAULT_STYLE)`.
**The Problem:** The single-cell-update examples (the core of ST-10 and ST-20/ST-21) are written
against an API that doesn't exist. As written they won't compile (golden joins the typechecked unit
glob) and won't run. The existing serialize tests never clone — they construct two independent
`ScreenBuffer`s and diff them.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Rewrite the examples to the real API: build `prev` and `next` as two separate `new ScreenBuffer(...)`, apply `set(x, y, 'X', style)` to `next`, then `serialize(next, prev, opts)` — mirroring `render-serialize.spec.test.ts`. | Uses the proven existing pattern; no engine change; stays in RD-09 test scope | Slightly more verbose than clone-then-mutate |
| B | Add a `clone()` method to `ScreenBuffer` and keep the examples. | Examples read cleanly | Engine change inside a *testing* RD — scope creep (AR-8 keeps engine untouched); needs its own spec/impl tests |

**Recommendation:** **Option A** — match `test/render-serialize.spec.test.ts`'s build-two-buffers
pattern and fix the `set(x,y,char,style)` calls. RD-09 explicitly adds tests without touching the
engine (AR-8); adding `clone()` would be unjustified scope creep. (Dropped B accordingly.)

**User Decision:** Resolved — User accepted the recommendation; fix applied to the plan 2026-06-28.

---

## PF-003: Tier-3 child override `mouse: true` is the wrong shape — mouse-enable would never be emitted 🟠 MAJOR

**Dimension:** 13 (Codebase Alignment — Stale Assumption)
**Location:** `03-03-pty-integration.md` lines 66–76 (child scaffold:
`override: { altScreen: true, mouse: true }`), driving ST-12.
**Codebase Evidence:** `src/engine/capability/profile.ts:23-27` — `mouse` is a `MouseCaps` **object**
(`{ sgr, drag, wheel }`), and `override` is `DeepPartial<CapabilityProfile>` (profile.ts:117).
`src/engine/host/modes.ts:49-51` — the mouse private modes are gated on `caps.mouse.sgr`
(`{ code: 1006, on: caps.mouse.sgr }`, `1000`, `1002`). The existing harness only ever overrides
`altScreen` (`test/host-signals.e2e.test.ts:34`).
**The Problem:** Setting `mouse: true` (a boolean) where a `MouseCaps` object is required means
`caps.mouse.sgr` is not `true` (it becomes `(true).sgr → undefined`, or the merge mishandles it),
so `enterMode` emits **no** `?1006h`/`?1000h`. ST-12 ("captured stdout contains … mouse-enable")
and the mouse-disable half of ST-13 would then fail — not because the host is broken, but because
the test never enabled mouse. Because the child is a template-literal *string*, the type error is
invisible to `tsc` and surfaces only as a confusing runtime test failure.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Use the object form: `override: { altScreen: true, mouse: { sgr: true, drag: true, wheel: true } }`. | Correct per the profile contract; mouse modes emit; ST-12/13 assert real behavior | None |

**Recommendation:** **Option A** (only viable fix) — set `mouse` to a `MouseCaps` object so
`caps.mouse.sgr` is true and the host emits the mouse-enable sequences the tier-3 cases assert.

**User Decision:** Resolved — User accepted the recommendation; fix applied to the plan 2026-06-28.

---

## PF-004: The corpus cannot verify query-response *classification* — only `expectedEvents` exists 🟠 MAJOR

**Dimension:** 7 (Testability) / 4 (Completeness Gaps)
**Location:** `03-01-input-corpus.md` — fixture schema (lines 30–52: only `expectedEvents`) and the
runner pseudocode (lines 68–84: collects `r.events` only); `07-testing-strategy.md` ST-6 (line 37);
FR-1 (`01-requirements.md:21`, "… DA responses").
**Codebase Evidence:** `src/engine/input/events.ts:57-90` — query replies are **deliberately not**
in the `InputEvent` union; `DecodeResult` carries them in a separate `queries: QueryResponse[]`
channel. `src/engine/input/decoder.ts:155-161` pushes recognized responses to `queries`, never
`events`.
**The Problem:** For `responses.json`, `decode()` returns the DA/DECRPM matches in `result.queries`,
so `result.events` is empty. The fixture schema has no `expectedQueries` field and the runner only
asserts `deepEqual(events, expectedEvents)`. ST-6's stated expectation is "**classified** as a query
response (NOT emitted as key events)" — but the design can only ever verify the *second* half
(no key event leaked); it cannot assert the response was classified as `da1`/`da2`/`decrpm`. FR-1
explicitly lists "DA responses" as a must-cover input class, so this is a real coverage gap, and a
`responses.json` file whose every record has `expectedEvents: []` is a near-vacuous test.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Add an optional `expectedQueries` field (array of `{kind}` or `{kind, rawHex}`) to the fixture schema; runner collects `r.queries` across chunks and asserts both channels. | Actually verifies DA/DECRPM classification; fulfills FR-1; keeps the no-leak assertion too | Small schema + runner addition |
| B | Drop `responses.json` from the corpus and rely on the existing `input-responses.impl.test.ts` + `capability-query.spec` for classification; the corpus covers only event-producing inputs. | Less new code; classification already tested elsewhere | FR-1 names DA responses for the corpus; leaves a stated must-cover class out of the shareable evidence base |

**Recommendation:** **Option A** — the corpus is meant to be the shareable `bytes → expected`
evidence base and FR-1 names DA responses explicitly; an `expectedQueries` field makes ST-6
genuinely testable for both halves. (B is viable but narrows FR-1's intent; pick it only if you
want the corpus to be events-only by definition.)

**User Decision:** Resolved — User accepted the recommendation; fix applied to the plan 2026-06-28.

---

## PF-005: `responses.json` lists "cursor-position", but the decoder doesn't classify CPR 🟡 MINOR

**Dimension:** 13 (Codebase Alignment — Phantom Reference)
**Location:** `03-01-input-corpus.md` line 62 (`responses.json` … "cursor-position, other query
responses (classified, not emitted as keys)").
**Codebase Evidence:** `src/engine/input/.../responses.ts:47-112` (`matchResponse`/`matchCsi`) only
recognizes DA1 (`…c` with `?`), DA2 (`…c` with `>`), DECRPM `?2026…$y`, and XTVERSION (DCS). A
cursor-position report (CPR, `ESC[<row>;<col>R`, final `R`=0x52) matches no branch → returns `null`,
so it is **not** routed to `queries`; it falls through to the keyboard decoder.
**The Problem:** A `responses.json` case expecting a CPR to be classified as a query response rests
on behavior the engine doesn't have. Depending on how `decodeKey` treats `ESC[…R`, it would either
be dropped (event-empty, but *not* classified) or mis-decoded — neither matches the stated intent.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Remove "cursor-position" from the `responses.json` scope; cover only the classes the decoder actually classifies (DA1/DA2/DECRPM/XTVERSION). | Fixtures match real behavior | CPR not exercised (it isn't a decoder responsibility today) |
| B | Keep a CPR case but assert its *actual* current behavior (e.g. produces no key event) rather than "classified as a query". | Documents the fall-through | Easy to misread as endorsing CPR classification; low value |

**Recommendation:** **Option A** — drop CPR from the corpus scope; the decoder's query channel is
DA/DECRPM/XTVERSION only. Revisit if/when CPR classification becomes a decoder requirement.

**User Decision:** Resolved — User accepted the recommendation; fix applied to the plan 2026-06-28.

---

## PF-006: Printable-key fixtures must include `codepoint` or `deepEqual` will fail 🔵 OBSERVATION

**Dimension:** 1 (Ambiguities) / 9 (Edge Cases)
**Location:** `03-01-input-corpus.md` fixture examples (lines 32–47, all named keys) and ST-2
(`07-testing-strategy.md:33`, "printable … decodes to the contract key event").
**Codebase Evidence:** `src/engine/input/events.ts:16-25` — `KeyEvent` carries `codepoint?: number`
for **printable** keys (omitted for named keys). The runner uses `assert.deepEqual` (03-01 line 81).
**The Problem:** A printable like `a` decodes to `{type:'key',key:'a',ctrl:false,alt:false,shift:false,
codepoint:97}`; a fixture that omits `codepoint` will fail `deepEqual`. The plan's examples only
show named keys (no codepoint), so the gate-item-3 "printable" cases need the field. This is an
authoring nuance, not a defect — flagged so the fixture author includes `codepoint` for printables.

**Recommendation:** Note in 03-01 that printable-key records must include `codepoint`; named-key
records omit it. No structural change.

**User Decision:** Resolved — User accepted the recommendation; fix applied to the plan 2026-06-28.

---

## PF-007: `npm run gate` runs `probe --auto`, which mutates the tracked `terminal-matrix.json` 🔵 OBSERVATION

**Dimension:** 13 (Codebase Alignment — Test Impact / Impact Blindness)
**Location:** `03-05-acceptance-gate.md` lines 34, 54, 103 (probe step; "writes to matrix … Allowed").
**Codebase Evidence:** RD-03 probe `--auto` appends to the checked-in `terminal-matrix.json`
(CLAUDE.md project structure; `probe.e2e.test.ts`).
**The Problem:** Every `npm run gate` invocation has a side effect on a version-controlled file. The
plan acknowledges the write is "allowed", but running the gate locally or in CI will leave a dirty
working tree, which can trip CI "git diff --exit-code" / clean-tree checks and create noisy diffs.

**Recommendation:** Either (a) note explicitly in `docs/acceptance-gate.md` that `gate` mutates
`terminal-matrix.json` and CI should not assert a clean tree after it, or (b) run the gate's probe
step with an output redirected to a throwaway path (`--out`/`--no-matrix` per CLAUDE.md probe flags)
so the gate is side-effect-free. Low stakes; surfaced for awareness.

**User Decision:** Resolved — User accepted the recommendation; fix applied to the plan 2026-06-28.

---

### Adversarial checklist (same-agent bias)

- Verified every engine signature the plan consumes against source rather than memory (events,
  decoder, profile, modes, host, buffer, serialize, responses).
- Confirmed the no-node-pty harness shape from the real `host-signals.e2e.test.ts`.
- Confirmed `docs/` does not yet exist and `@xterm/headless` is not yet a dep (both expected; the
  plan creates them — not findings).
- `@xterm/headless` grid/async-write API is an *acknowledged* risk in 02-current-state (mitigated by
  the adapter) — not re-raised as a finding.
