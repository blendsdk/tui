# Testing Strategy: RD-07 Host & Lifecycle

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Approach (AR-13)
Design for injection, not mocking. All OS effects sit behind the `RuntimeAdapter`; in-process spec
and impl tests inject a **fake adapter** (records `exit(code)`, drives signals/timers/immediates
synchronously) and a **capturing output stream** (collects exact ANSI). The irreducible real
wiring — a real `SIGINT` producing a real process exit code — is proven by a thin **subprocess
e2e** (`host-signals.e2e.test.ts`), run explicitly like `install.e2e.test.ts`. No `node-pty`.

### Coverage Goals
- Spec tests: every acceptance criterion (AC-1…AC-8) has at least one ST case.
- Impl tests: idempotency, ESC-timer edges, /dev/tty fallback, listener cleanup, query routing.
- E2e: real signal→exit-code+restore (the only honest proof of AC-2/AC-8 real exit).
- Non-regression: RD-02/RD-04/RD-06 suites stay green.

### Test caps helper
`const caps = (override = {}) => resolveCapabilities({ env: {}, platform: 'linux', override }).profile;`
(same helper style as the RD-04 suite).

## 🚨 Specification Test Cases (MANDATORY — derived from spec, not implementation)

> Immutable oracle. Expectations come from `01-requirements.md`, the `03-*` specs, and the AR.
> If a spec test fails after implementation, the implementation is wrong.

### Modes — enter/leave sequences (`host-modes.spec.test.ts`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-1 | `enterMode(caps({mouse:{sgr:true,drag:true,wheel:true},altScreen:true,bracketedPaste:true}))` | String contains, in order: `?1049h`, `?25l`, `?7l`, `?1006h`, `?1000h`, `?1002h`, `?2004h`, `?1004h` | 03-02 table / AC-1 |
| ST-2 | `leaveMode(sameCaps)` | Strict inverse: contains `?1004l`, `?2004l`, mouse-off, `?7h`, `?25h`, `?1049l` in reverse order; and `enter`/`leave` toggles pair up | 03-02 / AC-1 |
| ST-1b | `enterMode(caps({altScreen:true, mouse:{sgr:false,drag:false,wheel:false}, bracketedPaste:false}))` | No `?1006`/`?1000`/`?2004` present; `?1049h`+`?25l`+`?7l`+`?1004h` present | 03-02 (gating) / AC-1 |

### Lifecycle & dispatch (`host.spec.test.ts`, fake adapter + capturing stream)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-7 | `createHost({caps, input:fakeTTYin, output:capture})`; `await start()`; `render(buf)`; `await stop()` | Capture shows enter-mode … frame ANSI … leave-mode; completes with no real terminal; `setRawMode` called true then false | AC-6 / AR-3 |
| ST-13 | `start()` then `start()` again; `stop()` then `stop()` again | Second `start`/`stop` are no-ops (enter/leave written once) | AR-8 |
| ST-14 | Feed bytes `1b 5b 41` (ESC [ A) via input `data` | `onInput` receives one `{type:'key',key:'up',…}`; no query leaked | RD-06 / AR-2 |
| ST-15 | Feed a DA query reply (e.g. `1b 5b 3f …`) | Routed to `queries`, NOT delivered to `onInput` | RD-06 / AR-2 |
| ST-16 | Feed a lone `1b` (ESC), advance the fake timer past 50ms with no more bytes | `onInput` receives `{type:'key',key:'escape',…}` (host armed flush) | AR-14 |

### Non-TTY, resize, suspend & streams (`host-lifecycle.spec.test.ts`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-6 | `input.isTTY=false`; `await start()` | `host.isTTY === false`; `setRawMode` **never** called; no enter-mode written | AC-5 / AR-11 |
| ST-6b | Non-TTY host; `render(buf)` | Frame ANSI still written to the output stream | AR-11 |
| ST-4 | Emit adapter `resize` 3× synchronously; output reports `{columns:100,rows:40}`; then drain immediates (`flushImmediates()`) | `onResize` called **exactly once** with `{type:'resize',columns:100,rows:40}` | AC-3 / AR-9 / PF-007 |
| ST-5 | Emit adapter `suspend`, then `continue`; a prior `render(buf)` set lastBuffer | suspend: `onSuspend` then restore (leave-mode written, raw off) then `adapter.suspendSelf()` recorded; continue: enter-mode re-asserted + full repaint (serialize vs null) + `onResume` | AC-4 / AR-10 / PF-001 |
| ST-8 | Output emits `error` with `code:'EPIPE'` | Best-effort restore (leave-mode attempted), `onBeforeExit(0)`, adapter `exit(0)`; no unhandled rejection | AC-7 / AR-16 |

### Restore & security (`host-security.spec.test.ts`)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-3 | Emit adapter `interrupt`/`terminate`/`hangup` (fake) | For each: restore runs (leave-mode written, raw off), `onBeforeExit(code)`, adapter `exit(code)` = 130/143/129 | AC-2 / AR-6 |
| ST-11 | `start()` where enter-mode write throws midway; then trigger the `process.on('exit')` backstop | Restore still runs via `run(true)` → `adapter.writeSync(output.fd, leaveStr)` exactly once — panic restore; the `done` guard prevents a second write if a signal also fires | AC-8 / AR-17 / PF-004 |
| ST-9 | Feed input bytes "secret\r"; inspect the captured `writeError`/`warn` channels | No raw input bytes appear in any host `writeError`/`warn` output at default level | AC-8 / RD-07 Security / PF-002 |
| ST-10 | `input.isTTY=false`; `start()` | Raw mode never attempted (no `setRawMode(true)` recorded) | AC-8 / AR-11 |

### Real wiring (`host-signals.e2e.test.ts`, explicit subprocess)

| #    | Input / Scenario | Expected Output / Behavior | Source |
|------|------------------|----------------------------|--------|
| ST-12 | Spawn a tiny real host program (tsx), send a real `SIGINT` | Child `exitCode === 130`; captured stdout ends with leave-mode sequences (real exit + real restore) | AC-2 / AR-6, AR-13 |

> **AUTHORING RULE:** expectations above derive from the spec/AR. Sequence names (`?1049h`, etc.)
> come from the 03-02 table; exit codes from the AR-6 matrix; coalescing/once from AR-9; routing
> from RD-06. None are read from implementation.

## Test Categories

### Specification Tests (BEFORE implementation)

| Test File | ST Cases | Component |
|-----------|----------|-----------|
| `host-modes.spec.test.ts` | ST-1, ST-1b, ST-2 | modes.ts |
| `host.spec.test.ts` | ST-7, ST-13, ST-14, ST-15, ST-16 | host.ts orchestrator |
| `host-lifecycle.spec.test.ts` | ST-6, ST-6b, ST-4, ST-5, ST-8 | streams + resize/suspend + EPIPE |
| `host-security.spec.test.ts` | ST-3, ST-11, ST-9, ST-10 | restore.ts + security |
| `host-signals.e2e.test.ts` | ST-12 | real subprocess (explicit) |

### Implementation Tests (AFTER implementation)

| Test File | Description | Priority |
|-----------|-------------|----------|
| `host.impl.test.ts` | ESC-timer cancel-on-new-bytes; resize reads size once; listener cleanup on stop (no leaks across start/stop cycles); /dev/tty fallback on open failure; double-restore guard; non-EPIPE error → `handleFatal` (restore + exit 1, no throw in listener, PF-008); `exitOnSignal:false` skips exit; mode gating — drag-off omits `?1002h` and no `?1003h` ever (PF-003), `focus:false` omits `?1004h`/`?1004l` (PF-006) | High |
| `host-platform.impl.test.ts` | Pure `hostSignalSource(platform, signal)` map for POSIX and win32 (incl. `suspend/continue → null` on win32); win32 `resize`/`hangup` attach to the **provided output** stream (PF-010); VT-warn-once via the injectable VT-availability predicate (PF-005) | High |

### Test Doubles (real objects preferred)
- **FakeRuntimeAdapter**: records `exit` codes, `setRawMode` calls, `suspendSelf()` calls (PF-001),
  `writeSync(fd, data)` and `writeError` output (PF-002/PF-004); holds registered handlers so tests
  `emit(signal)`, plus `emitUncaught(err)`/`emitUnhandledRejection(reason)` (PF-002). Timing:
  `scheduleImmediate` **defers** the callback onto a pending queue drained by the test via
  `flushImmediates()` — so a `resize` burst collapses before the immediate runs (ST-4); `setTimer`/
  `clearTimer` use a **manual clock** the test advances past `ESC_TIMEOUT_MS` (ST-16). Neither runs
  synchronously; both mirror real `setImmediate`/`setTimeout` (PF-007). This is the RD-mandated
  injectable boundary (AC-6), not a mock of internal logic.
- **CaptureStream**: a `Writable` collecting chunks into a string; `columns`/`rows`/`isTTY`/`fd`
  settable. **FakeInput**: a `Readable`-like with `isTTY`, `setRawMode`, and `emit('data', …)`.
- `decode`/`serialize`/`enterMode`/`leaveMode`/`hostSignalSource` run for **real** (no doubles).

## Verification Checklist
- [ ] All ST cases defined with concrete input/output pairs
- [ ] Every ST case traces to an AC / spec / AR entry
- [ ] Spec tests written BEFORE implementation; verified to FAIL (red)
- [ ] All spec tests pass after implementation (green)
- [ ] Impl tests written for edges/internals
- [ ] `host-signals.e2e.test.ts` passes (explicit run)
- [ ] `npm run verify` green; lint + check:deps clean; `npm audit` 0 vulns
- [ ] RD-02/RD-04/RD-06 suites still green
