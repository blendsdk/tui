# Ambiguity Register: RD-07 Host & Lifecycle

> **Status**: ✅ GATE PASSED — all 17 items resolved and confirmed by the user (2026-06-27: "I have reviewed and confirmed all 17 items")
> **Last Updated**: 2026-06-27
> **Source RD**: [RD-07](../../requirements/RD-07-host-and-lifecycle.md)

> **Crash-resilience note**: this file is written incrementally during the planning
> interview so decisions survive a mid-planning crash. Resolved rows carry the user's
> explicit decision; open rows carry the proposed options and the recommendation.

| #  | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|----|----------|-----------------|-------------------|---------------|--------|
| 1 | Naming / Architecture | Public host API shape | (A) `createHost()` factory → `Host` object · (B) `class Host` | **A — `createHost(options): Host` factory** (consistent with `createDecoderState`/`createKeymap`) | ✅ Resolved |
| 2 | Integration | How the app receives input + resize events | (A) callback options (`onInput`/`onResize`/`onSuspend`/`onResume`) · (B) EventEmitter subclass | **A — typed callback options on `createHost`** | ✅ Resolved |
| 3 | Integration | How the app draws frames | (A) `host.render(buffer)` owns prev + serialize + write · (B) `host.write(string)`, app serializes | **A — `host.render(buffer)` owns the previous frame, serialize, and the coalesced write** | ✅ Resolved |
| 4 | Scope | How this plan treats Windows (no Windows runner here) | (A) implement Windows paths now, defer verification · (B) POSIX-only now, Windows later | **A — implement per-platform abstraction + Windows code paths now; Windows acceptance deferred-to-Windows-runner** | ✅ Resolved |
| 5 | Naming / Architecture | `src/engine/host/` file layout + module names | (A) 8-file responsibility split · (B) 3-file minimal | **A — types/host/modes/signals/streams/platform/restore/index** | ✅ Resolved |
| 6 | Behavioral | Does the host own `process.exit()` on signal/error paths? | (A) host owns exit (opt-out + onBeforeExit hook) · (B) app decides | **A — host restores then exits on signal/crash paths; `exitOnSignal` opt-out (default true) + `onBeforeExit(code)` hook** | ✅ Resolved |
| 7 | Behavioral | ResizeEvent type: shape + where it lives (host-owned vs input union) | (A) host/types.ts host-owned · (B) add to RD-06 InputEvent union | **A — `{ type:'resize'; columns; rows }` in host/types.ts; NOT in the InputEvent union** | ✅ Resolved |
| 8 | Integration | `start()`/`stop()` signature (async/sync) + idempotency | (A) async, idempotent, stop() restores only · (B) sync, stop(code) exits | **A — `start()/stop(): Promise<void>`, idempotent; stop() restores but does not exit** | ✅ Resolved |
| 9 | Behavioral | Resize/data burst coalescing mechanism | (A) setImmediate coalesce · (B) debounce timer | **A — pending-flag + single `setImmediate`, reads final size once, emits one ResizeEvent** | ✅ Resolved |
| 10 | Behavioral | Suspend/resume: how a full repaint is triggered on `SIGCONT` | (A) host auto-repaints last buffer + onResume() · (B) onResume() only | **A — re-assert modes, `serialize(last, null)` full repaint, then onResume()** | ✅ Resolved |
| 11 | Behavioral | Non-TTY mode: does `render()` still write (degraded) or no-op? | (A) still writes serialized frames · (B) no-op | **A — render() still serializes + writes; only mode-setup is skipped; degrade policy is RD-08's** | ✅ Resolved |
| 12 | Behavioral | Uncaught-exception default behavior | merged into AR-6 | **Resolved by AR-6 — restore → print error to stderr → exit(1); registration covered by AR-17** | ✅ Resolved |
| 13 | Testing | "PTY capture" ACs with zero deps (no node-pty) | (A) injectable OS-boundary + real objects + thin subprocess e2e · (B) mocks+spies only · (C) node-pty dev dep | **A — injectable runtime adapter (real Node bindings by default; fake in tests records exit codes + captures ANSI) + a thin subprocess e2e for real SIGINT→real exit code** | ✅ Resolved |
| 14 | Behavioral | Host owns the `ESC_TIMEOUT_MS` flush timer (RD-06 wiring)? | (A) host owns ESC timer · (B) app manages flush | **A — host arms a 50ms timer (via the injectable timer source) after a trailing-ESC carry; cancels on new bytes, else flush()+dispatch** | ✅ Resolved |
| 15 | Scope | Keymap (`createKeymap`) integration: host concern or app concern? | (A) out of host scope · (B) host keymap option + onAction | **A — out of scope; app applies createKeymap to onInput events (RD-07 'Won't Have' assigns input naming to RD-06)** | ✅ Resolved |
| 16 | Behavioral | EPIPE / output-write-error handling mechanism | (A) best-effort restore → clean shutdown exit 0 · (B) treat as crash exit 1 | **A — output 'error' listener; on EPIPE best-effort idempotent restore (swallow secondary errors), onBeforeExit(0), exit 0; no unhandled rejection** | ✅ Resolved |
| 17 | Behavioral | Panic-restore registration (which process events + idempotent restore) | (A) full set funneled to one idempotent restore · (B) signals + uncaughtException only | **A — one idempotent restore() hooked to signals + uncaughtException + unhandledRejection + sync `process.on('exit')` backstop** | ✅ Resolved |

### Resolution Notes

**AR-1:** Factory `createHost(options): Host`. The returned `Host` is a stateful object exposing the lifecycle + draw surface. Chosen for consistency with the engine's existing `create*` factories for stateful seams (`createDecoderState`, `createKeymap`).

**AR-2:** Typed callback options passed to `createHost`: `onInput(e: InputEvent)`, `onResize(e: ResizeEvent)`, `onSuspend()`, `onResume()`. Preserves the discriminated-union type-safety the engine relies on and is trivial to drive headlessly in tests. EventEmitter rejected (stringly-typed, listener-leak prone).

**AR-3:** `host.render(next: ScreenBuffer): void` holds the previous frame, calls `serialize(next, prev, { caps })`, performs the single coalesced write, then stores `next` as the new previous. The app never touches `serialize` or the stream directly.

**AR-4:** Per-platform abstraction (`linux | darwin | win32`) with the Windows code paths implemented now (VT enable, `stdout 'resize'`, `SIGBREAK`). POSIX paths fully tested locally; Windows *acceptance/verification* is deferred-to-Windows-runner, mirroring RD-01's deferred-to-remote CI cells. Roadmap advances to ✅ Implemented on POSIX-green; 🔒 Verified awaits the Windows runner.

**AR-5:** 8-file responsibility split under `src/engine/host/`: `types.ts`, `host.ts` (createHost orchestrator), `modes.ts` (enter/leave escape sequences driven by caps), `signals.ts` (signal install/teardown), `streams.ts` (binding, isTTY, `/dev/tty`), `platform.ts` (per-OS abstraction), `restore.ts` (guaranteed/panic restore), `index.ts` (barrel). Keeps every file single-responsibility and within the 200–500 line target.

**AR-6:** Host owns `process.exit()` on the signal/crash paths because guaranteed restore-on-all-paths (AC-2) requires it. Exit codes: SIGINT→130, SIGTERM→143, SIGHUP→129, uncaughtException→1, normal→0. `exitOnSignal?: boolean` (default `true`) opts out; `onBeforeExit(code)` hook lets apps flush state before exit. On uncaughtException the host also prints the error to stderr before exiting 1.

**AR-7:** `ResizeEvent { readonly type: 'resize'; readonly columns: number; readonly rows: number }` defined in `host/types.ts`. It is delivered via SIGWINCH / stdout `'resize'`, not decoded from bytes, so it stays out of RD-06's pure `InputEvent` union and the input module is untouched.

**AR-8:** `start(): Promise<void>` and `stop(): Promise<void>`, both idempotent (double-start/double-stop are safe no-ops). Async to permit an async `/dev/tty` bind. `stop()` performs teardown + restore (cooked mode, main screen, cursor visible, mouse/paste/focus off) but never calls `process.exit` — exit is owned by the signal/error paths (AR-6).

**AR-9:** Resize coalescing via a pending-flag + a single `setImmediate`: the first SIGWINCH / stdout `'resize'` schedules one immediate callback that reads `out.columns`/`out.rows` once and emits a single `ResizeEvent`, then clears the flag. Deterministic and timer-free (no fake clock in tests). A debounce timer can be added later if real terminals prove chatty across ticks.

**AR-10:** On `SIGCONT` the host re-asserts modes (raw, alt-screen, mouse, paste, focus, keyboard per caps), re-serializes its stored last buffer against `null` (forcing a full repaint) and writes it, then calls `onResume()`. On `SIGTSTP` it fires `onSuspend()`, restores the terminal (cooked/main-screen/cursor), then re-raises the stop with default disposition (`SIGSTOP`) to actually suspend. Works with zero app cooperation.

**AR-11:** In non-TTY mode `start()` skips raw mode + alt-screen + mode setup and sets `isTTY:false`, but `render()` still serializes and writes frames to the bound output stream (no alt-screen framing). The host never swallows frames; the *degradation policy* (whether to run at all) is RD-08's essentials gate, which reads the host-exposed `isTTY`.

**AR-12:** Merged into AR-6 — on `uncaughtException` the host restores, prints the error to stderr, and exits 1. The *registration* of that handler is part of the AR-17 panic-restore set.

**AR-17:** One idempotent `restore()` (guarded so it runs at most once) is wired to: the signal handlers (SIGINT/SIGTERM/SIGHUP/SIGTSTP/SIGCONT), `process.on('uncaughtException')`, `process.on('unhandledRejection')`, and a synchronous `process.on('exit')` last-resort restore (sync fd writes only). The `'exit'` backstop catches any path that bypassed `stop()`, including a synchronous crash mid-setup (AC-8 panic test).

**AR-13:** Test by **designing for injection, not mocking**. All OS effects (`setRawMode`, signal subscription, `exit`, the synchronous process-`exit` backstop, the resize source, the timer source, and the bound input/output streams) sit behind one injectable **runtime adapter** that defaults to the real Node bindings. In-process spec/impl tests inject a fake adapter that records `exit(code)` (instead of killing the runner) and a capturing output stream that collects the exact ANSI — deterministic, no real signals/timers. A small **explicit subprocess e2e** (`host-signals.e2e.test.ts`, run like `install.e2e.test.ts`) spawns a real host, sends a real `SIGINT`, and asserts the real `child.exitCode` (130) plus the leave-mode sequences in captured output — the only honest proof of AC-2/AC-8. `node-pty` rejected (native build-step dev dep, fragile on the 3-OS × Node-18/20/22 matrix, against the zero-native stance); mock-only rejected (cannot prove real exit codes / the real `'exit'` backstop). **Refinement to AR-5:** the injectable runtime adapter is the concrete shape of `platform.ts` — `platform.ts` exports the real adapter (per-OS signal set, VT enable, resize source) implementing an adapter interface declared in `types.ts`; tests pass a fake implementing the same interface. No new file beyond the AR-5 layout.

**AR-14:** The host owns the ESC disambiguation timer. After a `decode()` whose resulting `state.carry` is a lone trailing ESC, the host arms a `ESC_TIMEOUT_MS` (50ms) timer via the injectable timer source; arriving bytes cancel it, otherwise it fires `flush(state)` and dispatches the Escape key. Keeps `decode()`/`flush()` pure (RD-06) and the timer deterministic in tests.

**AR-15:** Keymap naming is out of host scope. The host delivers raw `InputEvent`s through `onInput`; the app layers `createKeymap` on top. Matches RD-07's "Won't Have" (input decoding/naming belongs to RD-06); the host only wires bytes→`decode`→dispatch.

**AR-16:** The host attaches an `'error'` listener to the bound output stream. On `EPIPE` it runs the idempotent `restore()` best-effort (wrapped so secondary write failures are swallowed), calls `onBeforeExit(0)`, and exits 0 — a pipe disconnect is an expected end, not a crash — with no unhandled rejection. Other write errors fall through to the uncaughtException path (AR-6).

---

## Gate Confirmation

All 17 items carry the user's explicit decision. Zero deferred. The user gave the final
confirmation — "I have reviewed and confirmed all 17 items" (2026-06-27) — so the gate is open
and the remaining plan documents may be written.

---

## Runtime Decisions (discovered during exec_plan)

> Decisions made while executing that were not covered by the planning gate. Tagged `(runtime)`.

**RT-1 (runtime) — Keyboard protocol (modes table step 9) is deferred.** During Phase 2 it
surfaced that enabling the Kitty keyboard protocol (`CSI >…u`) or `modifyOtherKeys` (`CSI >4;…m`)
makes a capable terminal emit CSI-u key encodings that **RD-06's decoder cannot yet parse** —
that decoding is `DEF-1`, deferred to Phase B (`plans/00-roadmap.md`). Enabling step 9 now would
therefore *break* keys on exactly the terminals where caps detect support, and the plan never
pinned the flag values (`…`). **Decision (user, 2026-06-27): defer step 9.** `enterMode`/`leaveMode`
implement steps 1–8 only and emit **no** keyboard-protocol bytes, regardless of
`caps.keyboard.kittyFlags`/`.modifyOtherKeys`. The spec tests (ST-1/1b/2) do not exercise keyboard
caps, so they are unaffected. Tracked as **DEF-2** below; revisit when RD-06 Phase B lands CSI-u
decoding (the gating is already present in caps, so it is a one-line re-enable).

**RT-2 (runtime) — `RuntimeAdapter.onProcessExit` returns an unsubscribe.** `restore.teardown()`
must remove the `process.on('exit')` panic backstop (03-03), and `start()`/`stop()` cycles would
otherwise leak an `'exit'` listener per cycle (Node warns past 10). The original 03-01 type returned
`void`. **Decision: `onProcessExit(handler): () => void`**, mirroring `on`/`onUncaughtException`/
`onUnhandledRejection` which already return unsubscribes. Real adapter returns
`() => process.off('exit', handler)`; the fake splices its handler list.

**RT-3 (runtime) — Suspend uses a *soft* leave, not the guarded panic restore.** The idempotent
restore (AR-17) is guarded to run **once** so multiple termination paths don't double-restore. But
SIGTSTP is **not** termination: it restores, suspends, and on SIGCONT re-enters — after which a later
real exit must restore **again**. Routing suspend through the one-shot restore would leave its `done`
guard set, suppressing the post-resume exit restore. **Decision: the `suspend` handler writes
`leaveStr` + `setRawMode(false)` directly (soft leave) and the `continue` handler re-asserts
`enterStr` + full repaint; the guarded restore stays reserved for true termination** (signals that
exit, uncaught/unhandled, EPIPE, the `'exit'` backstop). Observable behaviour matches ST-5 (leave-mode
written, raw off, `suspendSelf()`), and a SIGINT after a suspend/resume cycle still restores.

## Deferrals (DEF)

| #  | Deferral | Reason | Revisit |
|----|----------|--------|---------|
| DEF-2 | Keyboard-protocol enable (modes step 9: Kitty `CSI >…u` / `modifyOtherKeys` `CSI >4;…m`) | RD-06 cannot decode CSI-u key encodings yet (RD-06 DEF-1) | RD-06 Phase B (CSI-u/Kitty decode) |
