# Testing Strategy: RD-02 Capability Model & Auto-Config

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

RD-02 is pure, deterministic detection logic, so tests are fast unit tests using
`node:test` + `node:assert/strict`, run via `tsx --test`. Detection is driven through
**injectable inputs** (`options.env`, `options.platform`, `options.query`) so no real
TTY or process-env mutation is needed — every case is hermetic and cross-platform.
All tests live under `test/` (project convention) and import via `../src/engine/...`.

### Coverage Goals
- Every acceptance criterion AC-1…AC-8 has at least one specification test.
- Layer-2 ACs (AC-3/4/7) use a **stub `TerminalQuery`** (async generator over canned
  bytes), per PL-1 — verified now, not deferred to RD-06.

## 🚨 Specification Test Cases (MANDATORY)

> Derived exclusively from [01-requirements.md](01-requirements.md), the component
> specs (03-XX), RD-02 acceptance criteria, and the Ambiguity Register. **Immutable
> oracle**: if a spec test fails after implementation, the implementation is wrong.

### Detection & precedence (file: `test/capability-detect.spec.test.ts`)

| #     | Input / Scenario | Expected | Source |
| ----- | ---------------- | -------- | ------ |
| ST-1  | `env={COLORTERM:'truecolor'}` | `profile.colorDepth==='truecolor'`, `reasons.colorDepth==='env'` | AC-1 |
| ST-2  | `env={TERM:'xterm-256color'}` (no COLORTERM) | `colorDepth==='256'` | AC-1 |
| ST-3  | `env={TERM:'xterm'}` | `colorDepth==='16'` | AC-1 |
| ST-4  | `env={COLORTERM:'truecolor', NO_COLOR:'1'}` | `colorDepth==='mono'` | AC-1, PL-5 |
| ST-5  | `env={COLORTERM:'truecolor', NO_COLOR:''}` (empty) | `colorDepth==='mono'` | PL-12, AC-1 |
| ST-6  | `env={TERM:'xterm', FORCE_COLOR:'0'\|'1'\|'2'\|'3'}` | `mono\|16\|256\|truecolor` respectively | AC-2 |
| ST-7  | `env={NO_COLOR:'1', FORCE_COLOR:'3'}` | `colorDepth==='mono'` (NO_COLOR wins) | PL-5 |
| ST-8  | `override:{colorDepth:'16'}`, `env={COLORTERM:'truecolor'}` | `colorDepth==='16'`, `reasons.colorDepth==='override'` | AC-5 |
| ST-9  | `override:{mouse:{sgr:false}}` over a terminal with mouse drag/wheel on | `mouse.sgr===false` AND `mouse.drag`/`wheel` retain detected values | PL-7 |
| ST-10 | `env={}` (empty), `platform:'linux'` | defaults: `colorDepth:'16'`, `mouse.sgr:false`, `unicode.utf8:false`, `reasons.*==='default'` | AC-6 |
| ST-11 | mixed env (`COLORTERM` set, `TERM_PROGRAM` known) | `reasons` records `env` for colorDepth and `table`/`default` for untouched fields | PL-3 |
| ST-12 | any resolution | `Object.isFrozen(profile)` and `Object.isFrozen(reasons)` are true; nested objects frozen | PL-9 |
| ST-17 | call twice with no options; then `{refresh:true}` | 2nd call returns cached (same ref); refresh returns a fresh object | PL-14 |
| ST-18 | `env={TERM_PROGRAM:'iTerm.app'}` | known caps applied (e.g. `colorDepth` rich, `mouse.sgr:true`, `osc.hyperlink8:true`), `reasons` for those `==='table'` | PL-10 |
| ST-19 | `env={TERM:'screen', TMUX:'/tmp/x'}` | `profile.multiplexer===true` + conservative caps | RD-02 must-have |

### Runtime query, parser & security (file: `test/capability-query.spec.test.ts`)

| #     | Input / Scenario | Expected | Source |
| ----- | ---------------- | -------- | ------ |
| ST-13 | stub `query` whose `read()` never yields, `timeoutMs:100` | resolve completes in ≤ 150 ms, falls back, never rejects | AC-3 |
| ST-14 | stub stream = `ESC[?64;1;2c` (DA) + `"a"` | `parsed` reflects DA; `passthrough` bytes === `"a"`; no response bytes in passthrough | AC-4 |
| ST-15 | stub stream = 64 KB of `0x1b` with no terminator | rejected within 1 KB cap; no crash/throw; falls back | AC-7, PL-8 |
| ST-16 | stub stream = random non-grammar bytes | ignored (treated as passthrough); profile falls back; no field set to `runtime` | AC-7 |
| ST-20 | resolve with a populated env while capturing `console.*` | zero env values appear in any captured output | AC-8 |

> **AUTHORING RULE:** All expectations come from the ACs / specs / register, never
> from imagined implementation output. Layer-2 cases use a canned stub stream.

## Test Categories

### Specification Tests
| Test File | ST Cases | Component |
| --------- | -------- | --------- |
| `test/capability-detect.spec.test.ts` | ST-1…ST-12, ST-17…ST-19 | env/table/defaults/override/cache |
| `test/capability-query.spec.test.ts` | ST-13…ST-16, ST-20 | query seam, parser, security |

### Implementation Tests (after implementation)
| Test File | Description | Priority |
| --------- | ----------- | -------- |
| `test/capability-env.impl.test.ts` | `readEnv` edges: `FORCE_COLOR=9` invalid, `LC_ALL` vs `LANG` precedence, `COLORTERM=24bit` | Med |
| `test/capability-table.impl.test.ts` | key precedence `TERM_PROGRAM` > `WT_SESSION` > `TERM`; unknown terminal contributes nothing | Med |
| `test/capability-parser.impl.test.ts` | each grammar (DA/secondary DA/XTVERSION/`?2026`); cap boundary at exactly 1024 bytes; partial-then-complete sequence | High |
| `test/capability-merge.impl.test.ts` | `deepMerge` leaf semantics; override of nested + scalar; frozen output not mutated | Med |

### Integration / E2E
| Scenario | Steps | Expected |
| -------- | ----- | -------- |
| Ambient resolve | `resolveCapabilities()` in this process (no options) | returns a frozen profile + reasons; never throws |

## Test Data / Fixtures
- Canned env objects (plain `NodeJS.ProcessEnv` literals) per ST row.
- A `stubQuery(bytes: Uint8Array[] , {neverEnd?}): TerminalQuery` helper (async
  generator) shared by the query tests.
- No real TTY, no `process.env` mutation, no mocks beyond the injected stub stream
  (testing standard: prefer real objects).

## Verification Checklist
- [ ] All ST-* defined with concrete input/output pairs ✅
- [ ] Every ST traces to an AC / spec / AR ✅
- [ ] Spec tests written BEFORE implementation; verified red
- [ ] All spec tests pass after implementation (green)
- [ ] Impl tests for edges; `npm run verify`/`lint`/`check:deps` clean
- [ ] No new runtime dependencies; no env value logged (AC-8)
