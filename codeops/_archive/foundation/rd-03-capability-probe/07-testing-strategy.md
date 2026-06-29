# Testing Strategy: RD-03 Capability Probe & Survey Harness

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals
- **Unit/spec**: every pure module (args, env-meta, taxonomy, auto-probe classification, event formatter, report builder, recommendation, matrix merge, terminal-query adapter).
- **Integration**: `createTerminalQuery` → `runQueries` → `resolveCapabilitiesAsync` against a scripted fake terminal; manual loop with a scripted key source.
- **E2E**: real-process `--auto` over a pipe (exit 0 + schema JSON); PTY-captured restore on Ctrl-C.

The interactive shell is exercised through injected fakes (fake `TerminalQuery`,
scripted key/event sources, fake `MatrixFs`, injected clock) — real objects, no
framework mocks, per the testing standards.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> Derived EXCLUSIVELY from `01-requirements.md`, the `03-*` specs, RD-03 acceptance
> criteria, and `00-ambiguity-register.md`. Immutable oracles — if the implementation
> disagrees, the implementation is wrong.

### CLI args (`args.ts`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-1 | `parseArgs([])` | `{ok:true, args:{auto:false,out:null,matrix:true,help:false}}` | AR-7 / 01 §CLI |
| ST-2 | `parseArgs(['--auto'])` | `args.auto === true` | RD AC-5 / AR-7 |
| ST-3 | `parseArgs(['--out','r.json'])` | `args.out === 'r.json'` | AR-7 |
| ST-4 | `parseArgs(['--no-matrix'])` | `args.matrix === false` | AR-6 |
| ST-5 | `parseArgs(['--help'])` | `args.help === true` | AR-7 |
| ST-6 | `parseArgs(['--bogus'])` | `{ok:false, error:<non-empty>}` | AR-7 |
| ST-7 | `parseArgs(['--out'])` (no value) | `{ok:false, error:<non-empty>}` | AR-7 |

### Env-meta (`env-meta.ts`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-28 | `gatherEnvMeta` with env `{TERM:'xterm',COLORTERM:'truecolor',SECRET:'x',AWS_KEY:'y'}` | result has `term:'xterm'`, `colorterm:'truecolor'`; no property anywhere equals `'x'`/`'y'`; only allowlisted keys read | RD AC-8 / AR-17 |

### TerminalQuery (`terminal-query.ts`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-19 | `createTerminalQuery({output}).write('\x1b[c')` | `output` receives the exact bytes `\x1b[c` | 03-01 / AR-3 |
| ST-20 | push bytes to `input`, iterate `read()` once | yields a `Uint8Array` equal to the pushed bytes | 03-01 / AR-3 |
| ST-21 | scripted fake terminal answering DA + `?2026` via `resolveCapabilitiesAsync({query})` | resolved profile reflects the scripted `sync2026` capability | 03-01 / RD §Integration RD-02 |

### Auto-probes (`auto-probes.ts`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-16 | live query (over real streams) replies to `?2026` DECRPM "supported" | `results['output.sync2026']` = `{supported:true, method:'auto'}` | RD §Auto / AR-9 / RT-3 |
| ST-17 | env `COLORTERM='truecolor'` (auto color), query silent | `results['color.truecolor']` = `{supported:true, method:'auto'}` | RD §Auto / AR-10 / RT-3 |
| ST-18 | silent terminal (no bytes, timeout), env `{}` | `runAutoProbes` settles (no throw, no hang); `results['output.sync2026'].supported === false`, `method:'auto'` | RD AC-3 / AR-15 / RT-3 |

### Manual probes (`manual-probes.ts`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-12 | manual loop where one probe gets `n` and the rest `y` | EVERY manual probe id is present in results; the `n` one is `supported:false`; loop did not stop early | RD AC-3 / AR-15 |
| ST-12b | `classifyConfirmation('y'\|'n'\|'s')` | `true` / `false` / `null` respectively, `method:'manual'` | AR-8 |

### Live readout (`live-readout.ts`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-25 | `formatEventLine` of a `KeyEvent` `{key:'up'}`, and `{key:'a',ctrl:true}` | first line contains `up`; second contains `ctrl+a` | RD AC-2 / RT-4 |
| ST-26 | `formatEventLine` of a `MouseEvent` `{kind:'down',button:0,x:6,y:4}` (RD-06 coords are already 1-based) | line shows `down` and the coordinates `6,4` (displayed as-is, no conversion) | RD AC-2 / RT-4 |
| ST-27 | `formatEventLine` of a `PasteEvent` `{text:'hello'}` | line shows `5 bytes`; the substring `hello` does NOT appear | RD AC-8 / AR-17 / RT-4 |

### Report & recommendation (`report.ts`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-8 | `buildReport` from sample meta+results+recommendation | object has all schema keys: terminal, version, os, term, colorterm, termProgram, multiplexer, timestamp, results, recommendation | RD AC-4 |
| ST-9 | `--auto` report assembly | every `method:'manual'` probe id is `{supported:null, method:'manual'}` | RD AC-5 / AR-11 |
| ST-10 | `deriveRecommendation` from a truecolor profile | recommendation has `colorDepth`, `mouse`, `unicodeWidth`, `altScreen`, `bracketedPaste` populated from the profile | AR-10 |
| ST-11 | env `COLORTERM:'truecolor'` through the auto path | report records a truecolor color depth in recommendation / color results | RD AC-1 |

### Matrix (`matrix.ts`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-13 | `appendToMatrix` with fs returning `null` (absent) | result array length 1 containing the report; file written as a JSON array | AR-6 |
| ST-14 | `appendToMatrix` with existing array of N | result length N+1; the N prior entries preserved in order | AR-6 |
| ST-15 | written matrix content | parses as a JSON array of report objects | AR-6 |

### E2E

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-22 | interactive run with input/output that are NOT TTYs (piped) | prints a clear message to stderr; exits without alt-screen/raw-mode sequences in captured output | RD AC-6 |
| ST-23 | PTY run, send Ctrl-C | process exits; captured output ends with restore sequences (main screen, cursor visible, mouse off, cooked) | RD AC-7 |
| ST-24 | `npm run probe -- --auto` with stdout piped | exit code 0; stdout is valid JSON validating the schema; manual items `supported:null` | RD AC-5 |

> **⚠️ AUTHORING RULE:** Expectations above come from the specs/AC, not imagined code.
> Exact RD-06 event field names (e.g. `KeyEvent.name`, `MouseEvent.action`) are read from
> the input subsystem's **public types** when authoring ST-25/26/27 — that is the contract
> the formatter consumes, not its implementation.

## Test Categories

### Specification Tests (written BEFORE implementation)

| Test File | ST Cases | Component |
| --------- | -------- | --------- |
| `test/probe-args.spec.test.ts` | ST-1…ST-7 | args |
| `test/probe-envmeta.spec.test.ts` | ST-28 | env-meta (security) |
| `test/terminal-query.spec.test.ts` | ST-19, ST-20, ST-21 | engine TerminalQuery |
| `test/probe-auto.spec.test.ts` | ST-16, ST-17, ST-18 | auto-probes |
| `test/probe-manual.spec.test.ts` | ST-12, ST-12b | manual probes |
| `test/probe-readout.spec.test.ts` | ST-25, ST-26, ST-27 | live readout |
| `test/probe-report.spec.test.ts` | ST-8, ST-9, ST-10, ST-11 | report/recommendation |
| `test/probe-matrix.spec.test.ts` | ST-13, ST-14, ST-15 | matrix |
| `test/probe-nontty.spec.test.ts` | ST-22 | non-TTY boundary (interactive) |
| `test/probe.e2e.test.ts` | ST-23, ST-24 | restore + --auto (real process / PTY) |

### Implementation Tests (written AFTER implementation)

| Test File | Description | Priority |
| --------- | ----------- | -------- |
| `test/terminal-query.impl.test.ts` | listener detach on return, `close()` idempotency, queued bytes, error-event end | High |
| `test/probe-args.impl.test.ts` | usage text, combined flags, `--out` last-wins/dupe error | Med |
| `test/probe-auto.impl.test.ts` | cursor-position width probe, COLORTERM depth, oversized-response bounding | High |
| `test/probe-manual.impl.test.ts` | each test-pattern renderer output; OSC patterns are constants | Med |
| `test/probe-report.impl.test.ts` | table alignment/markers, JSON pretty shape | Med |
| `test/probe-matrix.impl.test.ts` | absent/malformed recovery + note | High |

### Integration & E2E

| Test | Components | Description |
| ---- | ---------- | ----------- |
| `terminal-query.spec` ST-21 | terminal-query + capability | scripted fake terminal → real async resolution |
| `probe.e2e` ST-24 | full harness | spawn `tsx examples/.../main.ts --auto`, assert exit 0 + JSON |
| `probe.e2e` ST-23 | full harness | PTY spawn, send `\x03`, assert restore sequences (mirrors RD-07/08 e2e approach) |

## Test Data

### Fixtures Needed
- Scripted fake `TerminalQuery` (canned response byte sequences for DA/`?2026`/cursor-pos).
- `PassThrough` stream pair for the terminal-query adapter.
- Fake `MatrixFs` (in-memory map).
- Fixed clock (`() => '2026-06-28T00:00:00.000Z'`) for deterministic timestamps.
- Scripted `InputEvent` arrays for the readout formatter.

### Mock Requirements
- No framework mocks. Only true-external seams are faked (streams via real `PassThrough`, fs via in-memory `MatrixFs`, clock via a function). The e2e spawns a real process.

## Verification Checklist
- [ ] All ST cases defined with concrete input/output pairs
- [ ] Every ST traces to a requirement / spec / AR entry
- [ ] Spec tests written BEFORE implementation
- [ ] Spec tests verified to FAIL (red) before implementation
- [ ] All spec tests pass (green) after implementation
- [ ] Impl tests written for edge cases/internals
- [ ] `npm run verify` green (incl. `typecheck:examples`); lint, `check:deps`, `npm audit` clean
- [ ] No regressions in existing 351 tests
