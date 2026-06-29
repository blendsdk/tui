# Testing Strategy: RD-08 Essentials Gate, Logging, Errors & Security

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals
- Unit tests: every public function in `safety/` (gate, errors, logger, redact, sanitize) — all
  branches (met/unmet, each degradation, each sink, each event variant, the full sanitizer rule
  table).
- Integration tests: gate→logger one-time degradation notice; sanitizer still routed through every
  RD-04 text path (RD-04 oracle stays green).
- E2E test: error thrown through the host crash path restores the terminal before exit (AC-6),
  driven by the RD-07 fake `RuntimeAdapter`.
- Security tests are mandatory: sanitizer rule table, no-secret-logging, essentials-per-missing,
  paste-cap DoS/boundary.

Run via the project verify command: `npm run verify` (typecheck + `tsx --test
"test/**/*.{spec,impl}.test.ts"` + build). The error-restore e2e runs explicitly with
`npx tsx --test test/safety-error-restore.e2e.test.ts`.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> Derived EXCLUSIVELY from `01-requirements.md`, the component specs (`03-XX-*.md`), RD-08, and
> the Ambiguity Register. They define expected behavior BEFORE implementation and are immutable
> oracles: if one fails after implementation, the **implementation** is wrong.

### Essentials gate & errors (`safety-essentials.spec.test.ts`)

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-1  | `assertEssentials(caps, { isTTY:false })` (caps with any colorDepth) | Throws `EssentialsNotMetError`; `err.missing` includes a string containing `"interactive TTY"`; `err instanceof TuiError` | AC-1 / AR-1, AR-2, AR-7 |
| ST-2  | `evaluateEssentials(caps, { isTTY:true })` with `caps.mouse.sgr === false` | `{ met:true, missing:[], degradations:[{cap:'mouse', mode:'keyboard-only', ...}] }`; does **not** throw | AC-2 / AR-8 |
| ST-3  | `evaluateEssentials(caps, { isTTY:true })` with `caps.colorDepth === 'mono'` | `met === true`; degradations include `{cap:'color', mode:'monochrome'}` | AC-2 / AR-8 |
| ST-4  | `evaluateEssentials(caps, { isTTY:true })` with `caps.altScreen === false` | `met === true`; degradations include `{cap:'altScreen', mode:'inline'}` | AC-2 / AR-8 |
| ST-5  | `evaluateEssentials(fullCaps, { isTTY:true })` (mouse+color+altScreen all present) | `{ met:true, missing:[], degradations:[] }` | AC-2 / AR-8 |
| ST-6  | `essentialsMet(caps, { isTTY:true })` vs `{ isTTY:false }` | `true` then `false` (mirrors `evaluateEssentials(...).met`) | AR-8 |
| ST-7  | `assertEssentials(caps, {isTTY:true}, { logger: ring })` with one degradation | Returns the report; the ring logger has exactly **one** entry for that degradation (`component:'gate'`) | AC-2 / AR-8 |
| ST-8  | `new EssentialsNotMetError(['interactive TTY']).message` | Contains `"interactive TTY"`; `.name === 'EssentialsNotMetError'` | AC-1 / AR-7 |

### TTY detection helper (`host-detect-tty.spec.test.ts`)

> RD-07 additive helper (PF-001) feeding the gate's `HostFacts` before `start()`.

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-27 | `detectTty({ input: nonTtyStream, output: nonTtyStream })` (injected, `isTTY:false`) | Returns `false`; mirrors `bindStreams(...).isTTY`; leaves no lingering fd open | PF-001 / AR-2 |
| ST-28 | `detectTty({ input: ttyStream, output: ttyStream })` (injected, `isTTY:true`) | Returns `true`; ephemeral — disposes anything it opened (`/dev/tty` path is integration-only) | PF-001 / AR-2 |

### Sanitizer (`safety-sanitize.spec.test.ts`)

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-9  | `sanitize("a\x1b]0;x\x07b")` | Result contains neither `\x1b` nor `\x07` (→ `"a]0;xb"`) | AC-3 / AR-13 |
| ST-10 | `sanitize("café\tline\n😀")` | Returned unchanged (UTF-8 + astral + tab + newline preserved) | AC-3 / AR-13 |
| ST-11 | `sanitize("x\x1b\\y")` (ESC + `\` = ST) | Both ESC and the trailing `\` removed → `"xy"` | RD-08 §Sanitizer / AR-13 |
| ST-12 | `sanitize` over each of BEL(0x07), ST(0x9c), a C0 (0x01), a C1 (0x85) | Each control byte removed from the output | AC-8 / AR-13 |
| ST-13 | `sanitize("")` and `sanitize("\x1b\x1b\x1b")` | `""` and `""` (empty / all-control collapse) | AC-8 / AR-13 |

### Redaction & no-secret logging (`safety-redact.spec.test.ts`)

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-14 | `redactEvent({type:'key', key:'a', codepoint:0x61, ctrl:false,alt:false,shift:false})` | `{type:'key', printable:true, ctrl:false, alt:false, shift:false}`; result has **no** `key` and **no** `codepoint` (no `'a'`, no `97`) | AC-4 / AR-9 |
| ST-15 | `redactEvent({type:'key', key:'enter', ctrl:false,alt:false,shift:false})` | `{type:'key', key:'enter', ctrl:false, alt:false, shift:false}` | AC-4 / AR-9 |
| ST-16 | `redactEvent({type:'paste', text:'secret-token', truncated:false})` | `{type:'paste', length:12, truncated:false}`; result contains no substring of the text | AC-4 / AR-9 |
| ST-17 | `redactEvent({type:'mouse', kind:'down', button:0, x:3, y:5})` | `{type:'mouse', kind:'down', button:0, x:3, y:5}` (coordinates are non-secret) | AC-4 / AR-9 |
| ST-18 | `dumpCaps(resolution)` for a known profile+reasons | A single space-separated string with one pair per `CapabilityReasons` key: scalars as `colorDepth=256 (env)`/`altScreen=true (table)`; object groups as enabled-member lists `mouse=sgr,wheel (table)` (all-false → `mouse=-`); non-boolean nested as `name:value`. Contains **no** key char, paste text, clipboard, or title text | AC-8 (Should-Have) / AR-6 |

### Logger config & sinks (`safety-logger.spec.test.ts`)

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-19 | `createLogger({ env:{} })` then `.debug(...)` | `logger.enabled === false`; zero records; `entries()` is `[]` (no bytes written) | AC-5 / AR-10, AR-14 |
| ST-20 | `createLogger({ env:{ BLENDTUI_DEBUG:'1' }, sink:'ring' })`; emit 3 records | `enabled === true`; `entries().length === 3`; records carry `{level, component, msg}` | AC-4 (Should-Have format) / AR-6, AR-10 |
| ST-21 | `createLogger({ sink:'ring', size:2 })`; emit 3 records | `entries().length === 2` (oldest dropped — bounded ring) | AR-10 |
| ST-22 | `createLogger({ enabled:true, sink:'file', path:<p>, uiFd:1 })` with an injected stat seam making `p`'s `{dev,ino}` equal fd 1's (`ino !== 0`) | Throws `LoggerConfigError` (`instanceof TuiError`). Companion: a file whose `{dev,ino}` differ, or `ino === 0`, does **not** throw | AC-7 / AR-7, AR-10 |
| ST-23 | `createLogger({ enabled:true, level:'warn', sink:'ring' })`; emit a `debug` then a `warn` | Only the `warn` record is stored (level filtering) | AR-10 |

### Paste-cap boundary & DoS (`safety-paste-cap.spec.test.ts` — exercises the RD-06 decoder)

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-24 | Decode a bracketed paste of `PASTE_CAP_BYTES + 1` **single-byte (ASCII)** content bytes | The emitted `PasteEvent` has `truncated === true` and `Buffer.byteLength(text,'utf8') === PASTE_CAP_BYTES` (byte cap; ASCII filler so byte count == char count). Mid-codepoint truncation of multibyte input is out of ST-24's scope | AC-7 / AR-11 |
| ST-25 | Decode a paste well over the cap (e.g. 4× cap) in chunks | Decoder stays bounded (no unbounded buffer growth); single truncated paste delivered | AC-8 / AR-11 |

### Error → restore ordering (`safety-error-restore.e2e.test.ts`)

| #     | Input / Scenario | Expected Output / Behavior | Source |
|-------|------------------|----------------------------|--------|
| ST-26 | A host built with the fake `RuntimeAdapter`; fire `onUncaughtException(new EssentialsNotMetError([...]))` (or any error) after `start()` | Captured writes show the leave/restore sequence (raw-off + leave alt-screen) **before** the recorded `exit(1)` | AC-6 / AR-1 |

> **⚠️ AUTHORING RULE:** Expectations above come from RD-08, the component specs, and the AR — not
> from reading the implementation. The redaction shapes (ST-14/15/16) come from AR-9 + the RD-06
> `KeyEvent`/`PasteEvent` contract; the sanitizer outputs (ST-9..13) from RD-08 §Sanitizer rule.

## Test Categories

### Specification Tests (from ST-cases above)
> Written BEFORE implementation. Filed as `safety-*.spec.test.ts`.

| Test File | ST Cases Covered | Component |
| --------- | ---------------- | --------- |
| `test/safety-essentials.spec.test.ts` | ST-1 … ST-8 | Gate + errors |
| `test/host-detect-tty.spec.test.ts` | ST-27, ST-28 | RD-07 `detectTty` helper (PF-001) |
| `test/safety-sanitize.spec.test.ts` | ST-9 … ST-13 | Sanitizer (canonical) |
| `test/safety-redact.spec.test.ts` | ST-14 … ST-18 | Redaction + caps dump |
| `test/safety-logger.spec.test.ts` | ST-19 … ST-23 | Logger config + sinks |
| `test/safety-paste-cap.spec.test.ts` | ST-24, ST-25 | Paste cap (via RD-06 decoder) |
| `test/safety-error-restore.e2e.test.ts` | ST-26 | Host crash-restore ordering (e2e) |

### Implementation Tests (edge cases, internals)
> Written AFTER implementation. Filed as `safety-*.impl.test.ts`.

| Test File | Description | Priority |
| --------- | ----------- | -------- |
| `test/safety-essentials.impl.test.ts` | Multiple simultaneous degradations; `missing` ordering; `HostFacts` structural typing | High |
| `test/safety-sanitize.impl.test.ts` | Relocated from `render-sanitize.impl.test.ts`: empty, all-control, mixed runs, lone trailing ESC | High |
| `test/safety-logger.impl.test.ts` | File append semantics; `close()` idempotence; `auto` sink selection (path vs stderr-safe vs none) | High |
| `test/safety-redact.impl.test.ts` | Wheel/focus pass-through; `dumpCaps` field coverage across all reason layers | Med |
| `test/safety-errors.impl.test.ts` | `instanceof` chain (`LoggerConfigError`/`EssentialsNotMetError` → `TuiError` → `Error`); `name` per subclass | Med |

### Integration Tests

| Test | Components | Description |
| ---- | --------- | ----------- |
| Gate→logger notice | `essentials` + `logger` | One ring entry per degradation, exactly once |
| Sanitizer routing intact | `safety/sanitize` + RD-04 render | The existing `render-security.spec.test.ts` oracle stays green with only its import path updated |

### End-to-End Tests

| Scenario | Steps | Expected Result |
| -------- | ----- | --------------- |
| Crash restores terminal first | Build host (fake adapter) → `start()` → fire uncaught exception | Restore/leave sequences precede `exit(1)` in capture (ST-26) |

## Test Data

### Fixtures Needed
- Capability profiles via `resolveCapabilities({ override })`: full caps, `mouse.sgr:false`,
  `colorDepth:'mono'`, `altScreen:false` (reuses the RD-02 override seam — real objects, no mocks).
- A ring `Logger` (`createLogger({ sink:'ring' })`) for assertion without touching the filesystem.
- The RD-07 fake `RuntimeAdapter` (already in the host test suite) for ST-26.
- A temp file path (`node:os.tmpdir()`) for the file-sink impl test; cleaned up after.

### Mock Requirements
- None beyond the existing injectable seams (RD-02 `env`/`override`, RD-07 fake adapter, injected
  `env`/`uiFd` on `createLogger`). Prefer real objects per project standards.

## Verification Checklist
- [ ] All specification test cases (ST-1…ST-28) defined with concrete input/output pairs
- [ ] Every ST case traces to an AC / RD-08 section / AR entry
- [ ] Specification tests written BEFORE implementation
- [ ] Specification tests verified to FAIL before implementation (red phase)
- [ ] All specification tests pass after implementation (green phase)
- [ ] Implementation tests written for edge cases and internals
- [ ] RD-04 `render-security.spec.test.ts` oracle stays green (import-path-only change)
- [ ] All unit / integration / e2e tests pass; no regressions in RD-02/04/06/07 suites
- [ ] `npm run lint`, `npm run check:deps`, `npm audit` clean
