# Ambiguity Register: RD-09 Testing Strategy & Acceptance Gate

> **Status**: ✅ GATE PASSED — all 15 items resolved
> **Last Updated**: 2026-06-28

Every item below carries the user's explicit decision, captured across three
clarifying-question rounds and a final register confirmation on 2026-06-28.
Plan documents back-reference these `AR-#` entries.

| #  | Category        | Ambiguity / Gap | Options Presented | User Decision | Status |
|----|-----------------|-----------------|-------------------|---------------|--------|
| 1  | Scope           | Which RD to plan next | RD-09 / RD-10 | **RD-09** (next per roadmap order; RD-10 after) | ✅ Resolved |
| 2  | Technical       | Tier-3 PTY tooling vs. the project's no-node-pty stance (RD-07 AR-13) | Expand no-node-pty / Adopt node-pty / Hybrid | **Expand the no-node-pty child-process + piped-TTY pattern; no native deps; real-PTY SIGWINCH resize deferred** | ✅ Resolved |
| 3  | Non-functional  | Perf benchmarks "assert RD-10 budget" but RD-10 not built | Structural invariant now / Provisional budgets / Defer all | **Assert bytes ∝ damage (deterministic) now; defer wall-clock timing to RD-10** | ✅ Resolved |
| 4  | UX / artifact   | Form of the go/no-go gate | Doc + runnable aggregator / Doc only / Script only | **`docs/acceptance-gate.md` (criteria→evidence map) + `npm run gate` aggregator** | ✅ Resolved |
| 5  | Scope           | Fuzz harness (Should-Have) — now or defer | Include now / Defer | **Include now (security tier)** | ✅ Resolved |
| 6  | Data            | Input-corpus format & location | Hex-in-JSON / Typed TS modules / Binary + sidecar | **Hex-in-JSON under `test/fixtures/input-corpus/`, runner `input-corpus.spec.test.ts`** | ✅ Resolved |
| 7  | Behavioral      | Which capability profiles golden tests assert | All four depths / Truecolor + mono | **All four depths (truecolor/256/16/mono); each: full repaint + single-cell update + CJK/wide row** | ✅ Resolved |
| 8  | Scope           | Local-no-remote boundary + treatment of the 407 existing Tier-1 tests | Confirm boundary / Adjust | **Boundary confirmed; existing 407 Tier-1 tests kept as-is (mapped, not rewritten); deferrals tracked as DEF-n** | ✅ Resolved |
| 9  | Naming          | Home of the checked-in gate doc | New `docs/` dir / Repo root / Inside plan folder | **New top-level `docs/` dir (`docs/acceptance-gate.md`)** | ✅ Resolved |
| 10 | Technical       | Which new suites run in the unit glob vs. explicit e2e | Corpus+golden+fuzz in glob, PTY as e2e / Only corpus in glob | **Corpus+golden+fuzz in the unit glob (`npm test`/`verify`); expanded Tier-3 as `*.e2e`; `npm run gate` runs all + probe `--auto`** | ✅ Resolved |
| 11 | Edge case       | Fuzz determinism mechanism | Iterate a fixed seed set / Single fixed seed | **Iterate a checked-in fixed seed set via a small seeded PRNG** | ✅ Resolved |
| 12 | Dependency      | New test dev dependency | — | **`@xterm/headless` (pure-JS, latest stable) approved; node-pty rejected (AR-2)** | ✅ Resolved |
| 13 | Naming          | Gate runner script location | — | **`scripts/gate.mjs` (pure-Node ESM, mirrors `scripts/check-no-native-deps.mjs`); wired as `npm run gate`** | ✅ Resolved |
| 14 | Scope           | What is deferred under the local-no-remote boundary | — | **DEF-1 3-OS CI cells green (no remote) · DEF-2 macOS/Windows acceptance + Tier-4 manual matrix (no platforms) · DEF-3 real-PTY SIGWINCH resize · DEF-4 wall-clock perf budgets (→RD-10)** | ✅ Resolved |
| 15 | Integration     | `terminal-matrix.json` accumulation (Should-Have) ownership | — | **Already satisfied by RD-03; no new work in RD-09 — mapped in the gate doc as existing evidence** | ✅ Resolved |

### Resolution Notes

**AR-2:** The decisive prior art is `test/host-signals.e2e.test.ts` (and `test/probe.e2e.test.ts`): a child process advertises its piped streams as TTYs (`isTTY = true`, no-op `setRawMode`), so the real `createHost`, real signal handlers, and real `process.exit` are exercised without a pseudo-terminal. RD-09 Tier-3 extends this same harness to alt-screen enter/leave, mouse enable/disable, and restore on `throw`/`SIGTERM`/`SIGHUP`. SIGINT→exit 130→restore is already proven (RD-07 ST-12) and is mapped, not re-implemented. Genuine SIGWINCH resize delivery requires a real PTY and is **DEF-3**.

**AR-3:** `serialize(current, previous, options)` is a pure damage diff, so "output bytes proportional to changed cells" is a deterministic, machine-independent assertion — it belongs in RD-09 (gate item 2). Wall-clock frame-budget numbers are environment-sensitive and have no ratified source until RD-10, so they are **DEF-4**.

**AR-8 / AR-14:** Mirrors the project's existing deferral conventions — RD-01 CI cells are "deferred-to-remote", RD-07 Windows is "deferred-to-Windows-runner". RD-09 reaches **✅ Implemented** when the platform-independent work is green locally, and **🔒 Verified** only once a remote + macOS/Windows runners pass.

**AR-10:** Corpus (pure), golden (`@xterm/headless` runs in-process), and fuzz (seeded + bounded) are fast and deterministic, so they join `npm test` and run under every `verify`. The expanded Tier-3 child-process tests are heavier and follow the existing `*.e2e.test.ts` convention (outside the unit glob). `npm run gate` is the umbrella that runs verify + the e2e files + `probe --auto` and reports each gate criterion.

**AR-12:** `@xterm/headless` is pure-JS/TS (no `binding.gyp`, no native build), so it does not violate the clean-install ethos; `check:deps` only guards runtime `dependencies` regardless. node-pty is rejected precisely because it is native (per AR-2).
