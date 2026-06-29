# Preflight Report: RD-07 Host & Lifecycle

> **Artifact**: `plans/rd-07-host-and-lifecycle/` (full plan set)
> **Type**: Implementation plan
> **Reviewed**: 2026-06-27
> **Reviewer**: preflight (CodeOps 2.0.0)
> **Iteration**: 1
> **Independence**: ✅ Cross-session review — plan authored in a prior session (commit `12988fd`), not this one.

## Outcome

**✅ PREFLIGHT PASSED — all 11 findings resolved** (iteration 2, 2026-06-27).

Iteration 1 raised **4 MAJOR + 4 MINOR + 2 OBSERVATION** (PF-010 surfaced mid-walkthrough). The user
accepted every recommendation; all fixes were **applied** to the plan docs (`00-index`, `01`, `02`,
`03-01`, `03-02`, `03-03`, `07`, `99`) and re-scanned clean — no stale `?1003h`, no `realRuntime()`
no-arg call, no `uncaughtException` in the `HostSignal` union, no `throw` inside the `'error'` listener,
mode-builder call sites all thread `opts`. Plan is cleared for execution.

> **Iteration 1 outcome (historical):** ❌ BLOCKED — 4 MAJOR. Superseded by the applied fixes above.

The plan is unusually well-grounded: every `file:line` cite (`profile.ts:63`, `decoder.ts:67`,
`serialize.ts:142`, `buffer.ts:49`), the `resolveCapabilities() → { profile, reasons }` shape, the
`SyncResolveOptions` `env`/`platform`/`override` seam, and the `CSI`/`cursor` RD-04 vocabulary were
all verified against the real code and are accurate. The findings below are about the
**RuntimeAdapter interface contract** and the **mouse-mode sequence table**, not about phantom
references or stale assumptions.

## Codebase Context Summary

- **Consumes (verified, unmodified):** `capability/profile.ts` (`CapabilityProfile` @ line 63 — shape
  matches plan exactly: `altScreen`, `bracketedPaste`, `mouse.{sgr,drag,wheel}`,
  `keyboard.{kittyFlags,modifyOtherKeys}`, `platform`), `capability/index.ts`
  (`resolveCapabilities` returns `{ profile, reasons }`; `SyncResolveOptions` accepts
  `env`/`platform`/`override`), `input/decoder.ts` (`decode` @ 67, `flush` @ 82 — `flush` on a
  leading lone-ESC carry emits `KeyEvent{key:'escape'}`, so ST-16 is sound), `input/events.ts`
  (`DecodeResult{events,queries,rest,state}`, `DecoderState.carry: Uint8Array`, `ESC_TIMEOUT_MS=50`),
  `render/serialize.ts` (`serialize(current, previous, {caps}) ` @ 142; `previous===null` forces full
  repaint), `render/buffer.ts` (`ScreenBuffer(w,h,fill)` @ 49), `render/ansi.ts` (`CSI='\x1b['`),
  `render/cursor.ts` (`cursor.hide()→?25l`, `cursor.show()→?25h`).
- **Modifies:** `src/engine/index.ts` (add host re-exports), `README.md`.
- **Greenfield:** `src/engine/host/` (8 files) — no host code exists yet (confirmed).

---

## Findings

### 🟠 PF-001 (MAJOR) — RuntimeAdapter has no primitive to re-raise SIGSTOP for suspend
**Dimensions:** 4 Completeness, 12 Consistency, 13 Codebase Alignment.
`03-02` signals.ts (`suspend`) and `AR-10` require the host to "re-raise default-disposition stop so
the process actually suspends (adapter maps to `process.kill(process.pid,'SIGSTOP')`)". But the
`RuntimeAdapter` interface (`03-01` lines 67–83) declares only `setRawMode`/`on`/`scheduleImmediate`/
`setTimer`/`clearTimer`/`onProcessExit`/`exit`/`warn` — **no `raise`/`kill`/`suspendSelf`**. `exit(code)`
terminates; it cannot stop-and-continue. So the suspend path has no testable home, and ST-5 cannot
assert the re-raise through the fake adapter.
**Recommendation:** Add `suspendSelf(): void` to `RuntimeAdapter` (real: `process.kill(process.pid,
'SIGSTOP')`; fake: records the call). signals.ts calls it after `restore()`. Cleanest fit with the
existing abstract-signal design.

### 🟠 PF-002 (MAJOR) — uncaughtException/unhandledRejection error payload cannot reach the handler
**Dimensions:** 4 Completeness, 12 Consistency, 8 Security-adjacent.
`AR-6`/`AR-12` and `03-03` (line 63) require the uncaughtException path to "print the error to stderr"
before `exit(1)`. But `RuntimeAdapter.on(event: HostSignal, handler: () => void)` (`03-01` line 70)
delivers **no payload** — the handler takes zero args, so the error object (and the rejection reason)
is unreachable. There is also no stderr channel on the adapter except `warn` (documented as a
"best-effort warning channel", semantically distinct from an uncaught-error dump).
**Recommendation:** Widen the error/rejection subscription to carry a payload — e.g. a dedicated
`onUncaught(handler: (err: unknown) => void)` and `onUnhandledRejection(handler: (reason: unknown) =>
void)` — and add an explicit `writeError(message: string)` (real: `process.stderr.write`) so the host
prints through the adapter (testable, never logs raw input). Keep `warn` for the conhost/VT case.

### 🟠 PF-003 (MAJOR) — Mouse caps↔sequence mapping is misaligned (`?1003h` ungated; `wheel` cap unused)
**Dimensions:** 1 Ambiguity, 9 Edge Cases, 13 Codebase Alignment.
`MouseCaps = { sgr, drag, wheel }` (`profile.ts:23`). The `03-02` enter table step 5 emits
`?1000h + ?1002h (drag) + ?1003h (any-motion)` — but **`?1003h` (any-motion) has no gating cap**, and
ST-1 (`07` line 34) lists `?1000h, ?1002h` and *not* `?1003h`, leaving it unpinned. Enabling `?1003h`
makes the terminal report **every** pointer motion with no button held — an input flood, and
redundant with `?1002h`. Conversely `caps.mouse.wheel` is claimed read (`02` line 45) but **no
sequence is gated on it** (wheel rides the SGR 1006 encoding). The cap set and the sequence set don't
line up.
**Recommendation:** Drop `?1003h` from the default enter (or hide it behind an explicit
`HostOptions` opt-in); gate `?1000h`/`?1006h` on `mouse.sgr`, `?1002h` on `mouse.drag`; state that
`wheel` needs no separate enable (or remove the "reads mouse.wheel" claim). Pin ST-1/ST-2 to the
final set.

### 🟡 PF-004 (MINOR) — Synchronous `'exit'`-path restore write has no adapter primitive
**Dimensions:** 4 Completeness, 6 Feasibility.
`03-03` (lines 58–60) and the `02` risk table (line 114) state the `process.on('exit')` backstop
"performs a **synchronous** write of the leave bytes to the output fd". But `RuntimeAdapter` exposes
no `writeSync`/fd, and `BoundStreams` exposes streams, not fds. On `'exit'` only synchronous work
completes; `stream.write()` is synchronous only for TTY streams (not pipes / some `/dev/tty` binds),
so the backstop may silently fail to flush exactly on the crash-during-setup path it exists for.
**Recommendation:** Add `writeSync(bytes: Uint8Array): void` to the adapter (real:
`fs.writeSync(output.fd ?? 1, bytes)`; fake: appends to the capture) and have `restore.run()` use it
on the `'exit'` path. Alternatively, document the reliance on TTY-synchronous `stdout.write` and the
piped/`/dev/tty` limitation. The adapter route is more deterministic and testable (ST-11).

### 🟡 PF-005 (MINOR) — `platform.ts` HostSignal→source mapping has a stated test requirement but no test case
**Dimensions:** 7 Testability, 13 Test Impact.
`03-02` (line 112) names a testing requirement — "platform.ts: HostSignal→source mapping per platform
(fake `process.platform`); VT warn path" — and AR-4 makes the per-OS map the cross-platform heart. But
no ST case covers it and `host.impl.test.ts`'s list (`07` line 93) omits it, so the POSIX *and* the
Windows mapping (the AR-4 deliverable implemented now) ship untested.
**Recommendation:** Add an impl test for `platform.ts` asserting the POSIX map
(SIGWINCH/SIGINT/SIGTERM/SIGHUP/SIGTSTP/SIGCONT) and the win32 map (`'resize'`/SIGINT/SIGBREAK/`'close'`)
by injecting `process.platform`, plus the legacy-conhost VT-`warn` path. Add it to the `07` impl-test
table and to a Phase 1 or Phase 4 task.

### 🟡 PF-006 (MINOR) — Focus `?1004h` "always" contradicts "all driven by caps"
**Dimensions:** 3 Contradiction, 12 Consistency.
`01` (line 22) says focus `?1004h` is among the modes "all driven by caps", but `03-02` table step 7
gates it "always (host-gated)" and `CapabilityProfile` has **no `focus` field** — so focus is
unconditionally enabled, not caps-gated. The wording and the behavior disagree.
**Recommendation:** Reconcile the text — state focus is host-policy-enabled (no capability models it)
— and optionally add a `HostOptions.focus?: boolean` opt-out for apps that don't want focus traffic.
Low stakes; a doc fix suffices.

### 🟡 PF-007 (MINOR) — Coalescing spec test (ST-4) needs `scheduleImmediate` to be deferred, but the test-double text allows synchronous
**Dimensions:** 7 Testability, 12 Consistency.
`07` test doubles (lines 96–98) say `scheduleImmediate` "run synchronously or via a manual clock".
ST-4 emits `resize` 3× and then "run the scheduled immediate", expecting **exactly one** `onResize`. If
the fake runs immediates synchronously, the first emit fires the callback before the 2nd/3rd, so the
single-coalesce can't be observed.
**Recommendation:** Specify the fake's `scheduleImmediate` is **deferred** (queued; flushed manually);
reserve the manual clock for `setTimer`. One-line doc fix.

### 🔵 PF-008 (OBSERVATION) — Non-EPIPE error re-thrown inside the stream `'error'` listener
`03-03` re-`throw`s non-EPIPE errors from inside `output.on('error', …)` to reach the
uncaughtException path. It generally surfaces as `uncaughtException`, but throwing from within an
`'error'` listener is fragile/non-obvious. Consider invoking the uncaught path directly (via the
adapter) instead of `throw`.

### 🔵 PF-009 (OBSERVATION) — `00-index` "Modified" list vs `99` hook ownership
`00-index` (line 106) lists `CLAUDE.md` + `plans/00-roadmap.md` as "Modified", while `99` (line 177)
assigns roadmap/CLAUDE.md sync to exec_plan's post-completion hooks, not to plan tasks. Harmless, but
the two lists read inconsistently.

### 🟠 PF-010 (MAJOR) — the real adapter can't reach the bound output to wire Windows `resize`/`hangup`
**Dimensions:** 4 Completeness, 13 Codebase Alignment. _(surfaced while resolving PF-005)_
The `03-02` platform.ts matrix wires Windows `resize` to `output.on('resize')` and `hangup` to
`output.on('close')`. But `realRuntime(): RuntimeAdapter` (`03-02:73`) is constructed with **no
streams**, and `RuntimeAdapter.on(event, handler)` takes no stream — so when `installSignals` calls
`adapter.on('resize', …)` on win32, the adapter has no reference to the bound output to attach the
listener. POSIX is unaffected (it uses `process.on('SIGWINCH')`), so this break ships silently:
Windows is deferred-to-Windows-runner and won't be test-caught here. A genuine AR-4 wiring gap, not a
test gap.
**Recommendation:** Pass the bound output into the real adapter — `realRuntime(output:
NodeJS.WriteStream)` — and resolve the real adapter **inside `start()` after `bindStreams()`** (the
injected fake is used verbatim and needs no output). The adapter's `on()` then attaches `output`-sourced
signals to that stream and `process`-sourced ones to `process`, per `hostSignalSource` (PF-005).

---

## Dimension coverage

| # | Dimension | Result |
|---|-----------|--------|
| 1 | Ambiguities | PF-003 |
| 2 | Implicit Assumptions | clean (grounding verified) |
| 3 | Logical Contradictions | PF-006 |
| 4 | Completeness Gaps | PF-001, PF-002, PF-004, PF-010 |
| 5 | Dependency Issues | clean (RD-02/04/06 surfaces verified) |
| 6 | Feasibility | PF-004 |
| 7 | Testability | PF-005, PF-007 |
| 8 | Security Blind Spots | clean (no-raw-log/non-TTY/panic covered by ST-9/10/11); PF-002 adjacent |
| 9 | Edge Cases | PF-003 |
| 10 | Scope Creep | clean (Won't-Have explicit; keymap/policy deferred) |
| 11 | Ordering & Sequencing | clean (Phase-1-before-spec justified; AC-bearing phases 2–4 spec-first) |
| 12 | Consistency | PF-001, PF-002, PF-006, PF-007, PF-009 |
| 13 | Codebase Alignment | PF-001, PF-002, PF-003, PF-005, PF-010 |

## Decisions log

- **PF-001 — ✅ ACCEPTED (2026-06-27):** Add `suspendSelf(): void` to `RuntimeAdapter` (real:
  `process.kill(process.pid, 'SIGSTOP')`; fake records the call). signals.ts `suspend` calls
  `adapter.suspendSelf()` after `restore()`; platform.ts maps it (POSIX) / no-op win32; ST-5 asserts
  the fake recorded `suspendSelf()` after restore and before the `continue` re-assert. SIGSTOP choice
  affirmed (uncatchable → no handler re-entry). Edits land in `03-01`, `03-02`, `07` at fix-apply time.
- **PF-002 — ✅ ACCEPTED (2026-06-27):** Trim `HostSignal` to the payload-free signals
  (`resize|interrupt|terminate|hangup|suspend|continue`); add dedicated typed subscriptions
  `onUncaughtException(handler: (err: unknown) => void)` + `onUnhandledRejection(handler: (reason:
  unknown) => void)` to `RuntimeAdapter`, plus `writeError(message: string)` (real:
  `process.stderr.write`; distinct from advisory `warn`). Crash wiring: `restore.run()` →
  `writeError(formatError(err))` → `onBeforeExit?.(1)` → `exit(1)`. Fake records `writeError` +
  exposes `emitUncaught`/`emitUnhandledRejection`; ST-9 asserts no raw input in `writeError`/`warn`.
  `err: unknown` (JS can throw anything). Edits land in `03-01`, `03-02`, `03-03`, `07`.
- **PF-003 — ✅ ACCEPTED (2026-06-27):** Correct the `03-02` mouse table to match ST-1 (the existing
  oracle) and xterm reality: drop `?1003h` (any-motion flood, no cap, redundant with `?1002h`); gate
  `?1006h`+`?1000h` on `caps.mouse.sgr` and `?1002h` on `caps.mouse.sgr && caps.mouse.drag`; leave =
  strict inverse `?1002l,?1000l,?1006l`. Document that wheel rides the SGR channel (no enable; RD-06
  decodes it) and fix the `02:45` "reads mouse.wheel" claim. ST-1 unchanged; ST-2 lists the mouse-off
  set without `?1003l`; add a drag-off gate impl test. Doc/spec correction — no interface/file change.
  A later `HostOptions` opt-in may re-add any-motion. Edits land in `03-02`, `02`, `07`.
- **PF-004 — ✅ ACCEPTED (2026-06-27):** Add `writeSync(fd: number, data: string): void` to
  `RuntimeAdapter` (real: `fs.writeSync`; fake records). `restore.run(sync = false)` shares one `done`
  guard: normal/signal/EPIPE path uses async `output.write(leaveStr)`; the `process.on('exit')`
  backstop arms `run(true)` → `adapter.writeSync(output.fd ?? 1, leaveStr)` (uniformly synchronous on
  every platform) + sync `setRawMode(false)`. `leaveStr` precomputed at `createRestore()`. ST-11
  asserts the leave sequence written via the sync path exactly once after a setup-throw, guard
  prevents a double. Backs the `02:114` risk row. Edits land in `03-01`, `03-03`, `02`, `07`.
- **PF-005 — ✅ ACCEPTED (2026-06-27):** Extract a pure `hostSignalSource(platform, signal): {emitter:
  'process'|'output'; name} | null` from platform.ts (`realRuntime().on()` consumes it). Add dedicated
  `host-platform.impl.test.ts` asserting the POSIX map (SIGWINCH/SIGINT/SIGTERM/SIGHUP/SIGTSTP/SIGCONT),
  the win32 map (output 'resize'/SIGINT/SIGBREAK/output 'close'/suspend·continue→null), and the
  VT-warn-once path via an **injectable VT-availability predicate** (actual VT enablement stays
  deferred-to-Windows-runner, AR-4). Add the row to the `07` impl-test table + a Session 4.2 task.
  Edits land in `03-02`, `07`, `99`.
- **PF-010 — ✅ ACCEPTED (2026-06-27):** `realRuntime(output: NodeJS.WriteStream)` captures the bound
  output; resolve the real adapter **inside `start()` after `bindStreams()`** (`adapter =
  options.runtime ?? realRuntime(streams.output)`) so win32 `resize`/`hangup` attach to the output
  stream; injected fake used verbatim (no output needed). Panic backstop still registered early within
  `start()` (bind → adapter → createRestore → onProcessExit) — no AC-8 regression. `host-platform.impl.
  test.ts` asserts win32 listeners attach to the provided output. Edits land in `03-02`, `03-01`, `07`.
- **PF-006 — ✅ ACCEPTED (2026-06-27):** Make focus a first-class host policy. Add `HostOptions.focus?:
  boolean` (default true); thread it into the pure builders `enterMode(caps, opts?: {focus?})` /
  `leaveMode(caps, opts?: {focus?})` — `?1004h`/`?1004l` emitted iff `focus !== false`; all other modes
  stay caps-gated. Fix `01:22` wording (focus is host policy, not caps-driven; no capability models it).
  ST-1/ST-2 unchanged (default on); add impl gate `focus:false` → no `?1004h`/`?1004l`. Edits land in
  `03-01`, `03-02`, `01`, `07`.
- **PF-007 — ✅ ACCEPTED (2026-06-27):** Pin the fake's `scheduleImmediate` as **deferred** onto a
  pending queue drained by the test via `flushImmediates()` (so a resize burst collapses before the
  immediate runs — ST-4); reserve the manual clock for `setTimer` (ST-16). Neither runs synchronously;
  both mirror real `setImmediate`/`setTimeout`. Update the `07` Test Doubles sentence + ST-4 wording
  ("drain immediates"). Test-strategy clarification only — no code/interface change. Edits land in `07`.
- **PF-008 — ✅ ACCEPTED (2026-06-27):** Replace the `throw err` inside the output `'error'` listener
  with a shared `handleFatal(err)` (= `restore.run()` → `writeError(formatError(err))` →
  `onBeforeExit?.(1)` → `exit(1)`), reused by `onUncaughtException`. Removes the fragile throw-in-listener;
  makes the non-EPIPE path directly testable. Composes with PF-002. Edits land in `03-03`, `03-01`, `07`.
- **PF-009 — ✅ ACCEPTED (2026-06-27):** Annotate `00-index:106` `CLAUDE.md`/roadmap entries as "(updated
  by exec_plan post-completion hooks, not plan tasks)" so the Related-Files list agrees with `99:177`.
  Doc hygiene. Edits land in `00-index`.