# Requirements: RD-09 Testing Strategy & Acceptance Gate

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-09](../../requirements/RD-09-testing-and-acceptance.md)

## Feature Overview

Realize RD-09's four test tiers and the project go/no-go gate for the foundation, scoped
to what is buildable on a Linux dev box with no git remote. Tier 1 (pure unit) already
exists as 407 tests and is **kept as-is** (AR-8); this plan adds the input corpus that
drives a data-driven Tier-1 regression, Tier 2 (golden-screen), an extended Tier 3
(PTY-style integration without node-pty), a seeded decoder fuzz harness, the deterministic
byte-proportionality benchmark, and the acceptance gate (`docs/acceptance-gate.md` +
`npm run gate`). Cross-platform, manual-matrix, real-PTY-resize, and wall-clock-timing
concerns are deferred (DEF-1…DEF-4).

## Functional Requirements

### Must Have
- [ ] **FR-1 — Recorded input corpus** (Tier-1 regression): checked-in hex-in-JSON fixtures of `bytes → expected events`, covering chunk-split sequences, SGR mouse, wheel, paste, and DA responses, iterated by a data-driven spec runner. *(AR-6; RD-09 Must-Have "Recorded input corpus")*
- [ ] **FR-2 — Golden-screen tests** (Tier 2): render a buffer → `serialize` → feed bytes to `@xterm/headless` → assert the grid (cell char + colours + width) across **all four** colour depths (truecolor/256/16/mono), each with a full repaint, a single-cell update, and a CJK/wide-char row. *(AR-7, AR-12; RD-09 Must-Have "Golden-screen tests")*
- [ ] **FR-3 — Tier-3 PTY-style integration** (no node-pty): extend the existing child-process + piped-TTY harness to assert alt-screen enter/leave, mouse enable/disable, and **full restore** on normal exit, `throw`, `SIGTERM`, and `SIGHUP` (SIGINT→130→restore already proven by RD-07 ST-12, mapped not re-implemented). *(AR-2; RD-09 Must-Have "PTY integration", adapted)*
- [ ] **FR-4 — Byte-proportionality benchmark**: assert that `serialize(current, previous, options)` emits output bytes proportional to the number of changed cells (a full repaint emits ≫ bytes than a single-cell update; no-change emits none). *(AR-3; RD-09 Must-Have "Performance benchmarks", structural half)*
- [ ] **FR-5 — Security tests aggregation**: the mandatory security tests (sanitizer ESC/BEL/ST/C0/C1, paste-cap DoS, essentials gate, no-secret-logging, malformed/oversized query-response) are mapped to gate criterion 10; the **new** fuzz harness (FR-6) and corpus malformed cases extend them. *(RD-09 Must-Have "Security tests"; AR-8 — existing suites mapped, not rewritten)*
- [ ] **FR-6 — Fuzz harness**: feed random/adversarial byte streams to `decode`/`flush` driven by an iterated **fixed seed set** via a small seeded PRNG; assert no throw and bounded decoder-state growth. *(AR-5, AR-11; RD-09 Should-Have promoted to Must by user)*
- [ ] **FR-7 — Acceptance gate artifact**: `docs/acceptance-gate.md` maps each of the 11 gate criteria → the test/probe evidence (incl. DEFERRED items); `scripts/gate.mjs` (run via `npm run gate`) runs the automatable tiers (verify + e2e files + `probe --auto`) and prints PASS/FAIL/DEFERRED per criterion. *(AR-4, AR-9, AR-13)*
- [ ] **FR-8 — Test wiring**: corpus, golden, fuzz, and byte-proportionality join the `npm test` unit glob (so they run under every `verify`); the expanded Tier-3 lives in `test/host-tier3.e2e.test.ts` (explicit, outside the glob); `npm run gate` is a separate umbrella command. *(AR-10)*

### Should Have
- [ ] **FR-9 — Accumulating `terminal-matrix.json`** — already realized by RD-03; mapped in the gate doc as existing evidence, no new code. *(AR-15)*

### Won't Have (Out of Scope)
- UI/widget tests (out of phase, per RD-09).
- `node-pty` and any native dev dependency (AR-2, AR-12).
- Wall-clock frame-time budgets and the broader NFR perf suite — owned by RD-10 (DEF-4).
- Cross-platform CI cells going green, macOS/Windows acceptance, and the Tier-4 manual matrix — deferred (DEF-1, DEF-2).
- Real-PTY SIGWINCH resize-delivery test — deferred (DEF-3).
- Rewriting or restructuring the existing 407 Tier-1 tests (AR-8).

## Technical Requirements

### Performance
- The byte-proportionality assertion (FR-4) must be deterministic and machine-independent (count emitted bytes, not time). *(AR-3)*

### Compatibility
- ESM-only, NodeNext, `strict`; Node ≥ 18. New dev dep `@xterm/headless` must be pure-JS (no `binding.gyp`/native build). *(AR-12)*
- `scripts/gate.mjs` is pure-Node ESM with no shell-isms, mirroring `scripts/check-no-native-deps.mjs`, so it behaves identically on every OS. *(AR-13)*

### Security
- Fixtures and fuzz inputs contain **no real secrets**; the no-secret-logging assertion (existing `safety-redact`/`host-security`) is mapped to criterion 10. *(RD-09 Security)*
- The fuzz harness is itself input-validation evidence for RD-06/RD-02 bounded parsing; it must assert bounded decoder-state growth (no unbounded buffer). *(RD-09 Security; AR-11)*
- The corpus hex parser must reject malformed hex (odd length / non-hex) rather than silently mis-decode. *(AR-6)*
- Tier-3 e2e must clean up every spawned child process (no leaks). *(RD-09 Security "Infrastructure")*

## Scope Decisions

| Decision                         | Options Considered                          | Chosen                                   | Rationale                                                                 | AR Ref     |
| -------------------------------- | ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ | ---------- |
| Tier-3 tooling                   | Expand no-node-pty / Adopt node-pty / Hybrid | Expand no-node-pty                        | Reuses proven RD-07 harness; no native dep; clean install preserved      | AR-2, AR-12 |
| Performance scope                | Structural now / Provisional budgets / Defer all | Bytes ∝ damage now; timing → RD-10        | Deterministic gate evidence without guessed/flaky timing numbers          | AR-3, DEF-4 |
| Gate artifact                    | Doc + script / Doc only / Script only        | Doc + runnable aggregator                 | Gate is the centrepiece — human map AND one runnable command both earn it | AR-4       |
| Corpus format                    | Hex-in-JSON / Typed TS / Binary + sidecar    | Hex-in-JSON                               | Human-readable, clean diffs, language-neutral evidence base               | AR-6       |
| Golden profiles                  | All four depths / Truecolor + mono           | All four depths                           | Exercises full RD-05 downsample chain end-to-end (gate item 1)            | AR-7       |
| Fuzz harness                     | Include now / Defer                          | Include now                               | Directly hardens decoder; gate item 11 adversarial clause                 | AR-5       |
| Fuzz determinism                 | Fixed seed set / Single seed                 | Iterate a fixed seed set                  | Reproducible, broader coverage, failing seed pinnable                     | AR-11      |
| Gate doc home                    | New docs/ / Repo root / Plan folder          | New `docs/` dir                           | Permanent living artifact; room for future techdocs                       | AR-9       |
| Existing Tier-1 tests            | Keep as-is / Refactor into tiers             | Keep as-is, map to criteria               | Immutable spec oracles; high churn for no value                           | AR-8       |
| Test wiring                      | Corpus+golden+fuzz in glob / Only corpus in glob | Corpus+golden+fuzz in glob; PTY e2e        | Fast+deterministic suites give regression pressure on every verify        | AR-10      |

> **Traceability:** Every scope decision references the Ambiguity Register entry (AR-#) that resolved it. See `00-ambiguity-register.md`.

## Acceptance Criteria

> Maps to RD-09's 11 gate criteria. Items realized **now** must pass locally; deferred items must be explicitly recorded as DEFERRED in `docs/acceptance-gate.md`.
>
> **Numbering:** the list ordinals below (1–12) are this plan's AC index; the parenthetical
> **(gate item N)** is the canonical RD-09 gate-criterion number (1–11) used everywhere else —
> in `docs/acceptance-gate.md`, the `scripts/gate.mjs` step map, and `gate.spec.test.ts`.

1. [ ] **Correct colours**: golden tests assert the rendered grid matches the detected depth across all four profiles (gate item 1). *(FR-2)*
2. [ ] **Flicker-free + correct partial updates**: golden full-repaint vs single-cell both render correctly, and `serialize` output bytes are proportional to changed cells (gate item 2). *(FR-2, FR-4)*
3. [ ] **Keyboard**: corpus decodes printable, arrows, Home/End, PgUp/PgDn, F1–F12, and Ctrl/Alt/Shift combinations to the correct events (gate item 3, automatable half). *(FR-1)*
4. [ ] **Mouse**: corpus decodes click/drag/release with correct coordinates **including beyond column 223** (gate item 4, automatable half). *(FR-1)*
5. [ ] **Scroll**: corpus decodes wheel up/down events (gate item 5, automatable half). *(FR-1)*
6. [ ] **Paste**: corpus shows a bracketed paste arrives as a single `PasteEvent`; an over-cap paste truncates safely (gate item 7). *(FR-1, maps existing `safety-paste-cap`)*
7. [ ] **Clean teardown**: Tier-3 e2e proves alt-screen/mouse/cursor restore on normal exit, `throw`, `SIGTERM`, `SIGHUP`; SIGINT→130→restore mapped from RD-07 ST-12 (gate item 8, POSIX). *(FR-3)*
8. [ ] **Security**: sanitizer, paste-cap DoS, essentials-gate, no-secret-logging, malformed-query-response, and the new fuzz run all pass (gate item 10). *(FR-5, FR-6)*
9. [ ] **Boundary/negative**: non-TTY degrades (existing `probe-nontty`/`safety-essentials`), never-responding terminal completes via fallback within timeout (existing capability tests), adversarial fuzz causes no crash (gate item 11). *(FR-6, mapped)*
10. [ ] **Gate command**: `npm run gate` runs the automatable tiers and prints PASS/FAIL/DEFERRED per criterion 1–11; `docs/acceptance-gate.md` maps every criterion to evidence. *(FR-7)*
11. [ ] All tests pass; `npm run verify` green; lint/check:deps clean; `npm audit` 0 high. Deferred items (DEF-1…DEF-4) recorded as DEFERRED, not failing.
12. [ ] Documentation updated (README RD-09 section, CLAUDE.md, roadmap → Implemented).
