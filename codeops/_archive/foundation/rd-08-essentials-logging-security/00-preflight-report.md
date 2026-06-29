# Preflight Report: RD-08 Essentials Gate, Logging, Errors & Security

> **Status**: ✅ PASSED — all 8 findings resolved; fixes applied to the plan docs (Iteration 1). A fresh-session re-scan is recommended before execution.
> **Iteration**: 1 (first scan + fixes applied)
> **Artifact**: Implementation plan at `plans/rd-08-essentials-logging-security/`
> **Codebase Grounded**: 11 source files + 2 test files examined; ~30 references verified
> **Last Updated**: 2026-06-27
> **Review independence**: Fresh session (the plan was authored earlier; this is **not** a same-session review). Same-agent bias risk is reduced but not zero.

### Codebase Context Summary

**Tech Stack:** TypeScript (ESM-only, NodeNext, strict), zero runtime deps, `node:test` via `tsx`.
**Architecture:** Foundation-first; per-subsystem dirs under `src/engine/**` re-exported from the single public entry `src/engine/index.ts`. RD-01/02/04/06/07 Implemented.
**Key Files Examined:** `capability/profile.ts`, `input/events.ts`, `input/decoder.ts`, `host/host.ts`, `host/types.ts`, `host/streams.ts`, `render/sanitize.ts`, `render/buffer.ts`, `render/osc.ts`, `render/index.ts`, `index.ts`, `test/host-doubles.ts`, `test/render-security.spec.test.ts`.

### Summary by Dimension

| # | Dimension | Findings | Highest Severity |
|---|-----------|----------|-----------------|
| 1 | Ambiguities | 1 (PF-006) | 🟡 |
| 2 | Implicit Assumptions | 1 (PF-001) | 🔴 |
| 3 | Logical Contradictions | 1 (PF-002) | 🟠 |
| 4 | Completeness Gaps | 1 (PF-003) | 🟠 |
| 7 | Testability | 1 (PF-005) | 🟡 |
| 8 | Security Blind Spots | 1 (PF-003) | 🟠 |
| 13 | Codebase Alignment | PF-001/002/007/008 | 🔴 |

### Summary by Severity

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 1 | ✅ resolved |
| MAJOR | 2 | ✅ resolved |
| MINOR | 3 | ✅ resolved |
| OBSERVATION | 2 | ✅ resolved |

---

### PF-001: `host.isTTY` is `false` until `start()` — the documented gate-before-start usage always refuses on a real TTY 🔴 CRITICAL

**Dimension:** Implicit Assumptions / Codebase Alignment (Stale Assumption)
**Location:** `00-index.md` Quick Reference (lines 62-69); `03-01-essentials-gate-and-errors.md` Example 1 (lines 152-159); `01-requirements.md` AC-1.
**Codebase Evidence:** `src/engine/host/host.ts:71` (`let isTTY = false;`), set only inside `start()` at `host.ts:138` (`isTTY = streams.isTTY;`); the public getter (`host.ts:222-224`) returns the closure variable. `bindStreams()` — the only thing that computes a real value — runs inside `start()` (`host.ts:137`).
**The Problem:** The plan's core usage calls `assertEssentials(caps, host)` **before** `await host.start()`. At that point `host.isTTY` is the construction-time default `false`, so `evaluateEssentials` reports `met:false` and `assertEssentials` throws `EssentialsNotMetError(['interactive TTY ...'])` **on every terminal, including a perfectly good interactive TTY**. The gate's pure functions and the ST-1..ST-8 spec tests are correct (they pass plain `{isTTY:true/false}` facts), so the bug is invisible to the test suite but breaks the feature for real users following the documented integration — and Phase 5 (5.1.1) would codify the broken example in the README. Calling the gate *after* `start()` is not a fix: `start()` already does `setRawMode` + writes the enter-mode/alt-screen sequence (`host.ts:157-160`), i.e. it has already taken over the screen, contradicting AC-1 "the SDK does not draw / refuses to start".

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A (recommended) | Feed the gate TTY facts derived from the bound streams the app will hand the host — `assertEssentials(caps, { isTTY: Boolean((input ?? process.stdin).isTTY && (output ?? process.stdout).isTTY) })` — not from the un-started `host`. Update both usage examples + the `HostFacts` doc to state `host.isTTY` is only valid **after** `start()`. | No RD-02/RD-07 changes (honors AR-2 scope); preserves refuse-before-start; matches `bindStreams`' own `input.isTTY && output.isTTY` rule (`streams.ts:97`). | Diverges from the host's `/dev/tty` fallback (piped stdout but a controlling TTY exists → host would be a TTY post-bind, pre-check says false). Must be documented as a known edge. |
| B | Expose `isTTY` eagerly from `createHost` (run/peek `bindStreams` at construction, or add a pre-start probe). | `host.isTTY` becomes meaningful pre-start; examples work verbatim. | Behavior change to the Implemented RD-07 host; risks opening `/dev/tty` at construction; against the plan's "RD-07 not modified" stance. |
| C | Add a small `host.evaluateTty()`/`probeTty()` to RD-07 that resolves TTY facts without entering modes. | Clean, explicit, no double-bind. | New RD-07 public surface — contradicts the "no RD-07 edits" scope (AR-2, 01-requirements "Won't Have"). |

**Recommendation:** Option A — it is the only resolution that keeps the no-RD-07-edits scope *and* the refuse-before-start semantics. The `/dev/tty` divergence is a narrow, documentable edge (piped-stdout apps are exactly the non-interactive case the gate targets). Fix the two examples and add an explicit "`host.isTTY` is only valid after `start()`; gate from the stream facts" note to `03-01` and the README task.

**User Decision:** Resolved — see Resolution Log.

---

### PF-002: AC-1 claims "the host's guaranteed-restore returns the terminal to a sane state" on gate refusal — but pre-start there is nothing to restore 🟠 MAJOR

**Dimension:** Logical Contradiction / Codebase Alignment
**Location:** `00-index.md` lines 18-20; `01-requirements.md` AC-1 (lines 144-146); `03-01` Example 1 comment (line 158).
**Codebase Evidence:** `restore` is created and the panic backstop registered **inside** `start()` (`host.ts:146-155`); modes are only entered at `host.ts:157-160`. Before `start()`, `restore` is `null` and no mode/raw-state has changed.
**The Problem:** When the gate refuses *before* `start()` (the documented order, and the order PF-001 keeps), the host has entered no modes and installed no restore — so the host's guaranteed-restore path is **not** involved. The terminal is clean simply because nothing happened, not because restore ran. AC-1's wording leads an implementer/tester to assert a host-restore step that does not (and need not) occur on the gate-refusal path. (AC-6 / ST-26 — restore-before-exit for an error thrown *after* `start()` — is the genuine guaranteed-restore criterion and is correct.) **Related:** AR-1 correctly scopes restore to the post-start crash path; AC-1's phrasing overreaches it.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A (recommended) | Reword AC-1 + the index narrative: on gate refusal the SDK throws before `start()`, so **no modes are entered and the terminal is left untouched** (no restore needed); the host's guaranteed-restore covers errors thrown *after* `start()` (AC-6). | Accurate to the code; removes the false expectation; no functional change. | Doc-only edit across 3 spots. |
| B | Keep the wording and make `assertEssentials` actually drive a host restore on failure. | Matches current text literally. | Requires a started host (modes entered) before the gate — reintroduces PF-001's contradiction; strictly worse. |

**Recommendation:** Option A — align the acceptance criterion with the real lifecycle. The guaranteed-restore guarantee belongs to AC-6, not AC-1.

**User Decision:** Resolved — see Resolution Log.

---

### PF-003: Logger UI-stream screen-safety guard (AC-7) — detection mechanism underspecified and cross-platform fragile 🟠 MAJOR

**Dimension:** Completeness Gap / Security Blind Spot
**Location:** `03-02-logging-and-redaction.md` lines 88-92, 149-150; `07-testing-strategy.md` ST-22.
**Codebase Evidence:** The plan states the file sink uses `fs.openSync`/`writeSync`/`closeSync` directly (no fs seam) and that `fs.fstatSync` "resolves the fd for the UI-stream guard" — comparing a resolved sink to "the UI stream's fd (`options.uiFd`, default 1)". No concrete comparison is defined.
**The Problem:** This is the AC-7 security control (a misconfigured sink must never corrupt the screen), but "maps to the UI stream fd" is hand-wavy for the file-path case: a file *path* doesn't equal an fd *number*. A correct check must compare device+inode of `openSync(path)` against `fstatSync(uiFd)` — and that is unreliable on Windows (no stable inodes; `fstatSync` on a console/pipe yields `ino: 0`), where the guard could silently fail to detect a collision. The same fragility makes **ST-22 itself hard to author portably**: there is no fs/stat injection seam, and making a real file path resolve to the test runner's fd 1 is platform-specific. The CI matrix includes `win32`.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A (recommended) | Specify the mechanism: stderr sink → compare `2 === uiFd`; file sink → `openSync(path)`+`fstatSync` and compare `{dev,ino}` against `fstatSync(uiFd)`, treating `ino===0`/unsupported as "cannot prove distinct" (best-effort; documented Windows limitation). Add a small injectable stat seam (or accept a pre-opened fd) so ST-22 is deterministic without touching real `/dev/stdout`. | Makes the security control concrete and testable on all 3 OSes; closes the seam gap. | Slightly more surface in `logger.ts` (a stat seam / fd option). |
| B | Scope the guard to the cheap reliable cases only (fd-number equality for stderr and for a caller-supplied fd), and document the file-path collision as out of scope for v1. | Simple, fully portable. | Weaker AC-7 guarantee for the file sink — the most likely misconfiguration (`BLENDTUI_LOG=/dev/stdout`). |
| C | Keep as-is and resolve during execution. | No plan change now. | Leaves a security control and an immutable spec test (ST-22) without a portable design — exactly what preflight exists to catch. |

**Recommendation:** Option A — define the device+inode comparison, the Windows best-effort caveat, and a stat/fd seam so ST-22 is deterministic. The guard backs a security AC; it should not be left to implementer improvisation.

**User Decision:** Resolved — see Resolution Log.

---

### PF-004: Test-file naming inconsistency — `safety-security.spec.test.ts` (index) vs `safety-paste-cap.spec.test.ts` (testing strategy + execution plan) 🟡 MINOR

**Dimension:** Consistency
**Location:** `00-index.md` line 99 (lists `safety-security.spec.test.ts`, omits paste-cap) vs `07-testing-strategy.md` lines 72/100 and `99-execution-plan.md` task 4.1.1 (both use `safety-paste-cap.spec.test.ts`).
**The Problem:** `00-index.md`'s "New tests" enumerates `safety-security.spec.test.ts`, a file no other document defines or assigns ST-cases to, and omits `safety-paste-cap.spec.test.ts`, which 07 and 99 do define (ST-24/25). An executor reading the index gets a phantom filename and a missing one.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A (recommended) | Fix `00-index.md` line 99: replace `safety-security.spec.test.ts` with `safety-paste-cap.spec.test.ts` to match 07/99. | Single source of truth; trivial. | None. |
| B | Rename the file to `safety-security.spec.test.ts` everywhere. | Keeps the index name. | Touches 07 + 99; `paste-cap` is the clearer concern name. |

**Recommendation:** Option A — 07 and 99 (the testing oracle and the execution plan) are the authoritative lists; correct the index to them.

**User Decision:** Resolved — see Resolution Log.

---

### PF-005: ST-24 conflates the byte cap with JS string length 🟡 MINOR

**Dimension:** Testability / Edge Cases
**Location:** `07-testing-strategy.md` ST-24 (line 76): "`text` length `=== PASTE_CAP_BYTES`".
**Codebase Evidence:** `input/decoder.ts:146-150` caps on **bytes** pushed (`pasteBytes.length < cap`), then `decodePasteText(pasteBytes)` (`decoder.ts:138`) decodes those bytes to a string. `PASTE_CAP_BYTES = 1_048_576` is a byte count (`events.ts:131`); a JS string's `.length` is UTF-16 units.
**The Problem:** `text.length === PASTE_CAP_BYTES` holds **only** when the paste content is single-byte (ASCII). With any multi-byte UTF-8 filler the decoded string length ≠ byte count, and a cap that lands mid-sequence yields replacement chars. As an immutable spec oracle, ST-24 must pin a representation that is actually true.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A (recommended) | State ST-24 uses single-byte ASCII filler (e.g. `'a'`) so `text.length === PASTE_CAP_BYTES` is exact; or assert on encoded byte length (`Buffer.byteLength(text) === PASTE_CAP_BYTES`). | Removes ambiguity; keeps the oracle true. | None. |
| B | Assert only `truncated === true` and `text.length <= PASTE_CAP_BYTES`. | Robust to any content. | Loses the exact-cap assertion. |

**Recommendation:** Option A with ASCII filler — keeps the precise boundary assertion while being unambiguously correct.

**User Decision:** Resolved — see Resolution Log.

---

### PF-006: `dumpCaps` output format undefined for non-scalar profile fields 🟡 MINOR

**Dimension:** Ambiguities / Completeness Gap
**Location:** `03-02-logging-and-redaction.md` lines 132-141 (example `colorDepth=256 (env) altScreen=true (table)`); ST-18.
**Codebase Evidence:** `CapabilityProfile` (`profile.ts:63-76`) mixes scalars (`colorDepth`, `altScreen`, `sync2026`, `bracketedPaste`, `platform`, `multiplexer`) with nested objects (`mouse`, `unicode`, `osc`, `keyboard`, `glyphs`); `CapabilityReasons` carries one layer per **top-level group** (`profile.ts:82-94`).
**The Problem:** `dumpCaps` emits `field=value (layer)` pairs, but the spec only illustrates scalar fields. For the object-valued groups, a naïve `field=value` renders `mouse=[object Object]`. The format for nested groups (omit? summarize as `mouse.sgr=…`? flatten?) is unspecified, and ST-18 ("`colorDepth=<v> (<layer>)`-style pairs") doesn't pin it. The impl test "dumpCaps field coverage across all reason layers" will hit this immediately.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A (recommended) | Specify dumpCaps emits one pair per **reasons** key, rendering object groups with a compact summary (e.g. `mouse=sgr (table)` / `mouse={sgr,wheel} (table)`) or `JSON.stringify` of the group; pin the exact shape in ST-18. | Deterministic, secret-free, matches the per-group reasons trace. | Slightly more spec text. |
| B | Restrict dumpCaps to scalar fields only. | Simplest. | Drops mouse/unicode/osc/keyboard/glyphs from the diagnostic dump — less useful. |

**Recommendation:** Option A — one pair per `CapabilityReasons` key with a compact group summary; lock the format into ST-18 so the oracle is concrete.

**User Decision:** Resolved — see Resolution Log.

---

### PF-007: `colorDepth != null` essential is a structurally-unreachable failure branch 🔵 OBSERVATION

**Dimension:** Codebase Alignment (Redundancy)
**Location:** `01-requirements.md` "Essentials evaluation" (lines 73-75); `03-01` evaluate doc (lines 92-95).
**Codebase Evidence:** `ColorDepth = 'mono' | '16' | '256' | 'truecolor'` (`profile.ts:17`) is a non-null union; `caps.colorDepth` can never be nullish.
**The Problem:** The second essential can never fail, so it never contributes to `missing`. AR-2 deliberately encodes it "for spec fidelity", so this is intentional — but the global no-dead-code standard means a reviewer/junior will question a guard that can't fire. Worth a one-line `// always true (mono counts) — encoded for spec fidelity, see AR-2` comment at the implementation site so it isn't later "cleaned up" or mistaken for a bug.

**Recommendation:** Keep the branch (AR-2 decided this); add the clarifying comment when implementing `evaluateEssentials`. No plan change required.

**User Decision:** Resolved — see Resolution Log.

---

### PF-008: `02-current-state.md` handleFatal snippet misstates the real signature 🔵 OBSERVATION

**Dimension:** Codebase Alignment (Stale Assumption)
**Location:** `02-current-state.md` lines 61-68 (code block, and the `host.ts:113` cite).
**Codebase Evidence:** Real code is `function handleFatal(err: unknown): void {` at `src/engine/host/host.ts:114` with `adapter.exit(1);` (no `return`); the doc shows `: never` and `return adapter.exit(1);`. The function is at line 114 (the doc cites 113, which is its leading comment).
**The Problem:** The presented "actual code" block is a paraphrase that differs from the source (`: never` vs `: void`, `return` vs none). Harmless to the design but undermines the doc's "this is the real code" framing.

**Recommendation:** Update the snippet to match `host.ts:114` verbatim (or mark it as illustrative). No functional impact.

**User Decision:** Resolved — see Resolution Log.

---

## Adversarial checklist (same-agent-bias safeguards)

- **Assumption I might be confirming:** that `host.isTTY` is usable pre-start — explicitly disproven against `host.ts:71/138/222` (PF-001).
- **External-standard conformance:** the sanitizer rule table (ESC/BEL/ST/C0/C1) was checked against the relocated impl (`render/sanitize.ts:27-48`), not from memory; behavior is strip-only and preserved on relocation — no defect found there.
- **What a domain expert might flag:** the Windows behavior of the fd/inode UI-stream guard (PF-003) — flagged.

---

## Resolution Log — Iteration 1 (fixes applied 2026-06-27)

User accepted the stricter recommendations and authorized applying them to the plan documents. Two
recommendations were hardened past the original report and are recorded as such.

| PF | Decision | Files edited |
|----|----------|--------------|
| PF-001 🔴 | **Stricter than report.** Rejected Option A (app re-derives `process.stdout.isTTY` — DRY violation + `/dev/tty` regression). Add an **additive** RD-07 `detectTty(options?)` helper (factored from `bindStreams`, ephemeral open+dispose); gate reads its facts before `start()`. Logged as an AR-2 amendment relaxing "host untouched" → "no RD-07 *type* edits". | `00-index.md`, `01-requirements.md`, `02-current-state.md`, `03-01`, `07`, `99`, `00-ambiguity-register.md` |
| PF-002 🟠 | Reword AC-1 + index narrative: pre-start refusal enters no modes → terminal untouched, no restore; guaranteed-restore is AC-6. | `00-index.md`, `01-requirements.md`, `03-01` |
| PF-003 🟠 | Pin the UI-stream guard: stderr → fd compare; file → `{dev,ino}` equality with `ino !== 0` guard (best-effort where inodes unstable); injectable stat seam so ST-22 is deterministic cross-platform. | `03-02`, `07` (ST-22), `00-ambiguity-register.md` |
| PF-004 🟡 | Fix `00-index.md` test list: `safety-security.spec.test.ts` → `safety-paste-cap.spec.test.ts`. | `00-index.md` |
| PF-005 🟡 | ST-24 uses single-byte ASCII filler and asserts `Buffer.byteLength(text,'utf8') === PASTE_CAP_BYTES` (the true byte-cap invariant); multibyte mid-codepoint truncation out of scope. | `07` (ST-24) |
| PF-006 🟡 | Pin `dumpCaps` format: one pair per `CapabilityReasons` key; object groups → enabled-member lists (`mouse=sgr,wheel`); locked into ST-18. | `03-02`, `07` (ST-18) |
| PF-007 🔵 | **Stricter than report.** Removed (not just commented) the unreachable `colorDepth != null` essential — dead code per the project standard; only `isTTY` is gated. | `01-requirements.md`, `03-01`, `00-ambiguity-register.md` |
| PF-008 🔵 | Corrected the `handleFatal` snippet to match `host.ts:114` (`: void`, no `return`). | `02-current-state.md` |

**Scope ripple:** PF-001 adds one Phase-3 implementation task (`detectTty`) and one spec file
(`host-detect-tty.spec.test.ts`, ST-27/28); execution-plan task count 33 → 35.

**Verification performed:** cross-document consistency grep — no stale `host`-as-gate-input calls,
no `safety-security.spec` outside this report, no `0/33`, no `colorDepth != null` runtime essential,
ST range updated to ST-1…ST-28. **Not yet done:** an independent fresh-session re-scan (Iteration 2)
to confirm the edits introduced no new drift — recommended before `exec_plan`.
