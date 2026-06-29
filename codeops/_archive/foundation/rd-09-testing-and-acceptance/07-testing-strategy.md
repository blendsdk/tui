# Testing Strategy: RD-09 Testing Strategy & Acceptance Gate

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

RD-09 *is* the testing RD, so the "feature" under test is the test infrastructure itself.
Expectations for every spec case below derive from RD-09's gate criteria, the RD-06 event
contract, and the RD-04/RD-05/RD-07 render/host contracts — **never** from running the new
harnesses first. Most engine code already exists, so spec tests target existing behavior
(red phase may be trivially green; where a spec exposes a real bug, the **engine** is fixed,
never the spec — AR-8).

### Coverage Goals
- Corpus: every RD-09 must-cover input class (keyboard, SGR mouse incl. >col 223, wheel, paste, DA responses).
- Golden: 4 depths × {full repaint, single-cell, CJK row}.
- Tier-3: alt-screen + mouse enter/leave + restore on normal/throw/SIGTERM/SIGHUP.
- Fuzz: no throw + bounded state across the seed set.
- Perf: bytes ∝ damage (deterministic relations).
- Gate: doc↔script consistency; `npm run gate` reports per criterion.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> Derived from `01-requirements.md`, `03-XX-*.md`, RD-09 gate criteria, and the RD-06/RD-04/RD-07 contracts.
> **IMMUTABLE ORACLE RULE:** do not modify these to match the implementation.

### Input Corpus (FR-1)

| #     | Input / Scenario                                              | Expected Output / Behavior                                                       | Source                |
|-------|--------------------------------------------------------------|---------------------------------------------------------------------------------|-----------------------|
| ST-1  | `keyboard.json` "arrow up" bytes `1b5b41`                     | `[{type:'key',key:'up',ctrl:false,alt:false,shift:false}]`                       | RD-09 item 3 / FR-1   |
| ST-2  | `keyboard.json` F1–F12, Home/End, PgUp/PgDn, Ctrl/Alt/Shift  | each decodes to the contract key event with correct modifiers                    | RD-09 item 3 / FR-1   |
| ST-3  | `mouse.json` SGR press at a column **> 223**                  | `{type:'mouse',kind:'down',button,x,y}` with the correct 1-based coords          | RD-09 item 4 / FR-1   |
| ST-4  | `wheel.json` wheel up / wheel down                            | `{type:'wheel',dir:'up'/'down',x,y}`                                             | RD-09 item 5 / FR-1   |
| ST-5  | `paste.json` bracketed paste split across two `decode` chunks | one `{type:'paste',text,truncated:false}` (state threaded across chunks)         | RD-09 item 7 / FR-1, RD-06 RT-1 |
| ST-6  | `responses.json` DA / DECRPM ?2026 response bytes            | appears on the `queries` channel with the correct `kind` (asserted via `expectedQueries`); `events` stays empty (no key leak) | RD-02/RD-06 / FR-1    |
| ST-7  | Corpus record with malformed `bytesHex` (odd length / non-hex)| runner throws a clear error (no silent mis-decode)                               | AR-6 / FR-1           |

### Golden Screen (FR-2)

| #     | Input / Scenario                                                       | Expected Output / Behavior                                                  | Source              |
|-------|----------------------------------------------------------------------|----------------------------------------------------------------------------|---------------------|
| ST-8  | Styled buffer serialized at **truecolor**, fed to `@xterm/headless`     | emulator grid cells match the written chars + truecolor fg/bg               | RD-09 item 1 / FR-2 |
| ST-9  | Same buffer at **256 / 16 / mono**                                      | grid colours match the **downsampled** depth (not truecolor everywhere)     | RD-09 item 1 / FR-2, RD-05 |
| ST-10 | Full repaint then a single-cell `serialize(next, prev, opts)`           | exactly the one target cell changes in the grid; others unchanged           | RD-09 item 2 / FR-2 |
| ST-11 | Row containing a wide CJK glyph + combining sequence                    | the wide glyph occupies 2 columns; combining mark does not add a column     | RD-09 item 2 / FR-2, RD-04 width |

### Tier-3 Integration (FR-3)

| #     | Input / Scenario                                              | Expected Output / Behavior                                                       | Source              |
|-------|--------------------------------------------------------------|---------------------------------------------------------------------------------|---------------------|
| ST-12 | Child runs `createHost` (alt-screen + mouse), prints READY     | captured stdout contains alt-screen enter `?1049h` and mouse-enable             | RD-09 item 8 / FR-3, RD-07 |
| ST-13 | Child exits normally via `host.stop()`                         | captured stdout contains `?1049l` + `?25h` + mouse-disable; exit 0              | RD-09 item 8 / FR-3 |
| ST-14 | Child throws after `start()`                                   | restore sequences present; non-zero exit                                         | RD-09 item 8 / FR-3 |
| ST-15 | Parent sends SIGTERM                                           | restore sequences present; terminated by SIGTERM                                | RD-09 item 8 / FR-3 |
| ST-16 | Parent sends SIGHUP                                            | restore sequences present; terminated by SIGHUP                                 | RD-09 item 8 / FR-3 |

### Fuzz & Performance (FR-6, FR-4)

| #     | Input / Scenario                                                        | Expected Output / Behavior                                              | Source               |
|-------|-----------------------------------------------------------------------|-----------------------------------------------------------------------|----------------------|
| ST-17 | Each seed in `SEEDS` drives N random/adversarial chunks → `decode`/`flush` | no throw across all seeds/iterations                                   | RD-09 item 11 / FR-6 |
| ST-18 | Same fuzz run                                                           | decoder pending-buffer stays ≤ the documented cap (bounded growth)     | RD-09 Security / FR-6, AR-11 |
| ST-19 | Same PRNG seed run twice                                                | identical byte streams (determinism)                                   | AR-11 / FR-6         |
| ST-20 | `serialize(base, base, opts)` (no change)                              | empty / cursor-only payload (no cell bytes)                            | RD-09 item 2 / FR-4  |
| ST-21 | single-cell diff vs full repaint byte lengths                          | `single < full/10` and `single > 0` (bytes ∝ damage)                  | RD-09 item 2 / FR-4, AR-3 |

### Acceptance Gate (FR-7)

| #     | Input / Scenario                                              | Expected Output / Behavior                                                       | Source              |
|-------|--------------------------------------------------------------|---------------------------------------------------------------------------------|---------------------|
| ST-22 | Parse `docs/acceptance-gate.md` criteria table                | all 11 RD-09 criteria present                                                    | FR-7 / AR-4         |
| ST-23 | Each non-DEFERRED criterion in the doc                        | names ≥1 **existing** test file                                                  | FR-7 / AR-4         |
| ST-24 | `scripts/gate.mjs` criteria↔step map vs the doc               | the script covers the same non-deferred criteria as the doc (no drift)          | FR-7 / AR-4         |
| ST-25 | `npm run gate` locally                                        | exits 0; prints PASS for required criteria and DEFERRED (with DEF-n) for deferred | FR-7 / AR-14        |

> **⚠️ AUTHORING RULE:** expectations come from the spec/contracts above. If an expected
> value cannot be derived from a contract, it is an ambiguity → register it before coding.

## Test Categories

### Specification Tests (from ST-cases above)
> Written BEFORE the harness/fixtures. Filed as `*.spec.test.ts`.

| Test File                              | ST Cases Covered      | Component            |
| -------------------------------------- | --------------------- | -------------------- |
| `input-corpus.spec.test.ts`            | ST-1…ST-7             | Input corpus         |
| `golden-screen.spec.test.ts`           | ST-8…ST-11            | Golden screen        |
| `host-tier3.e2e.test.ts`               | ST-12…ST-16           | Tier-3 integration   |
| `input-fuzz.spec.test.ts`              | ST-17, ST-18          | Fuzz                 |
| `render-bytes-damage.spec.test.ts`     | ST-20, ST-21          | Performance (struct) |
| `gate.spec.test.ts`                    | ST-22…ST-24           | Acceptance gate      |

### Implementation Tests (edge cases, internals)
> Written AFTER implementation. Filed as `*.impl.test.ts`.

| Test File                          | Description                                                                 | Priority |
| ---------------------------------- | -------------------------------------------------------------------------- | -------- |
| `input-corpus.impl.test.ts`        | `hexToBytes` malformed-input rejection; empty file; chunk-split equivalence | High     |
| `golden-screen.impl.test.ts`       | adapter `readCell` normalization (empty/wide-trailing/default colours)      | Med      |
| `input-fuzz.impl.test.ts`          | PRNG determinism (ST-19); a pinned adversarial case                         | High     |

### Integration / E2E Tests

| Test                          | Components           | Description                                            |
| ----------------------------- | ------------------- | ----------------------------------------------------- |
| `host-tier3.e2e.test.ts`      | host + signals      | real child process; restore on every POSIX exit path  |
| `npm run gate` (manual smoke) | all                 | umbrella aggregator exits 0, reports per criterion     |

## Test Data

### Fixtures Needed
- `test/fixtures/input-corpus/{keyboard,mouse,wheel,paste,responses}.json` (hex-in-JSON, AR-6).
- `SEEDS` array (in-test constant) for the fuzz harness (AR-11).

### Mock Requirements
- No mocks of engine internals — real `decode`/`serialize`/`createHost` throughout (project rule: prefer real objects).
- `@xterm/headless` is a real emulator (not a mock); the only test-time external.
- Tier-3 uses real child processes + piped streams advertised as TTYs (AR-2) — no PTY mock.

## Verification Checklist
- [ ] All ST-1…ST-25 defined with concrete input/output pairs
- [ ] Every ST traces to a requirement / spec doc / AR entry
- [ ] Spec tests written BEFORE the harness/fixtures
- [ ] Spec tests verified to FAIL before implementation (red phase) — or documented as expected-green (testing existing engine) with justification
- [ ] All spec tests pass after implementation (green phase)
- [ ] Impl tests written for edge cases and internals
- [ ] `npm run verify` green; `npm run gate` exits 0; lint/check:deps clean; `npm audit` 0 high
- [ ] No regressions in the existing 407 tests
