# Ambiguity Register: RD-08 Essentials Gate, Logging, Errors & Security

> **Status**: ✅ GATE PASSED — all 14 items resolved (+ preflight amendments, see Resolution Notes)
> **Last Updated**: 2026-06-27
> **Parent**: [Index](00-index.md)
> **Source RD**: [RD-08](../../requirements/RD-08-essentials-logging-security.md)

This register is the audit trail for the RD-08 plan. Every design, scope, naming,
and behavioral decision in the plan documents traces back to a numbered row here.
All rows were resolved by explicit user decision during the make_plan interview
(three clarifying batches), each option grounded in the actual current code.

| #  | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|----|----------|-----------------|-------------------|---------------|--------|
| 1  | Technical unknown | RD-08 AC-6 references "the SDK's run loop" / "app's draw callback", but RD-07's host owns no app callback loop — the app calls `host.render()` itself (`host.ts:213`). How is the run-loop error model delivered? | A) Standalone gate + typed errors; reuse host's existing crash path · B) Add a runApp/createApp loop owner | **A** — standalone `assertEssentials()` + typed errors; AC-6 satisfied by the host's existing `handleFatal` restore-before-exit path (`host.ts:113`) | ✅ Resolved |
| 2  | Integration | The gate formula reads `caps.rendering.cursorAddressing && caps.rendering.clear` (no such fields on `CapabilityProfile`, `profile.ts:63`) and `host.canRawMode` (Host exposes only `isTTY`). How does the gate read its inputs? | A) `isTTY` (covers raw-mode) + `colorDepth` present; cursor/clear implied · B) Add `rendering{}` to RD-02 + `canRawMode` to RD-07 | **A** — gate on `host.isTTY` (raw mode is `isTTY`-guarded in the adapter) + `caps.colorDepth` present; cursor-addressing/clear are universal on any ANSI/VT TTY → implied-true. No edits to RD-02/RD-07 public types | ✅ Resolved |
| 3  | Naming & terminology | `sanitize()` already exists as a real impl at `render/sanitize.ts` (RD-04 "provisional"). RD-08 "owns/relocates the canonical version". Where does it live? | A) Relocate to a new RD-08 module; render imports it · B) Keep in render/, own in place | **A** — relocate canonical `sanitize()` to the RD-08 directory; `render/` imports it; top-level index re-export stays | ✅ Resolved |
| 4  | Naming & terminology | How is RD-08's new code organized under `src/engine/` (one-concern-per-dir pattern)? | A) One `safety/` directory for all RD-08 concerns · B) Separate `essentials/`+`logging/`+`security/` dirs | **A** — single `src/engine/safety/` directory grouping the gate, errors, logger, redaction, and sanitizer | ✅ Resolved |
| 5  | Scope | AC-4 ("a key logs its event TYPE, never the raw char; a paste logs only its length") — does RD-08 wire logging into the RD-07 host pump (`host.ts:79`), or stay standalone? | A) Standalone `createLogger` + `redactEvent()`; host untouched · B) Wire logger into host `dispatch` | **A** — standalone logger + pure `redactEvent()` helper; the RD-07 host is **not** edited; AC-4 proven by feeding events through `redactEvent`→logger | ✅ Resolved |
| 6  | Scope | RD-08 "Should Have" items: structured log record format, and a caps-summary debug dump reusing RD-02's reason trace. Include now or defer? | A) Include both now · B) Defer both to Phase B | **A** — include both: structured record `{level,component,msg,...}` and `dumpCaps()` over the RD-02 reasons trace | ✅ Resolved |
| 7  | Data & state | What typed-error set does RD-08 define? (AC-1 requires `EssentialsNotMetError`; AC-7 requires refusing a UI-stream log path.) | A) Base `TuiError` + `EssentialsNotMetError` + `LoggerConfigError` · B) Base + `EssentialsNotMetError` only; UI-stream refusal is a silent no-op | **A** — base `TuiError`; `EssentialsNotMetError` (carries the missing essential(s)); `LoggerConfigError` thrown when a sink resolves to the UI stream (AC-7 fail-fast) | ✅ Resolved |
| 8  | Behavioral | AC-2: missing mouse → SDK **starts** (keyboard-only) with a one-time screen-safe notice, never a hard stop. How is the degradation notice delivered? | A) Gate returns a structured report; notices go to the logger (screen-safe) · B) stderr-only, no structured report | **A** — `evaluateEssentials()` returns `{met, missing, degradations[]}`; `assertEssentials()` throws only when `!met`; degradation notices are written **once** to the logger sink (never the UI stream) | ✅ Resolved |
| 9  | Security & compliance | AC-4 forbids logging the raw char of a printable key. In `KeyEvent`, `key` is the character for printable keys and a name for control keys (`events.ts:16`). What does `redactEvent()` emit for `key`? | A) Named control keys by name; printable keys → placeholder + modifiers · B) Never emit `key` at all | **A** — named keys (in `KEY_NAMES`, no `codepoint`) logged by name; printable keys (`codepoint` present) → `{type:'key', printable:true, ctrl,alt,shift}` with `key`+`codepoint` dropped | ✅ Resolved |
| 10 | Behavioral | How is logging enabled and which sink is chosen? (RD-08 names `BLENDTUI_DEBUG`, `BLENDTUI_LOG`, default disabled.) | A) DEBUG gates on; LOG→file else stderr-if-safe; level=debug; ring=1024 · B) DEBUG gates on; ring is default sink; LOG→file | **A** — disabled unless `BLENDTUI_DEBUG=1`; then `BLENDTUI_LOG=<path>`→file (append) else stderr when `stderr ≠ UI` else no auto sink; default level `debug`; levels `error\|warn\|info\|debug`; ring (default 1024 entries) constructable via the API anytime; a sink resolving to the UI stream throws `LoggerConfigError` | ✅ Resolved |
| 11 | Scope | `PASTE_CAP_BYTES = 1_048_576` is already defined AND enforced in the RD-06 decoder (`events.ts:131`), configurable, and re-exported. What is RD-08's paste-cap scope? | A) Tests + docs only; no new enforcement · B) Re-assert in a safety constant/wrapper | **A** — tests + docs only; AC-7 boundary test and AC-8 DoS test live in RD-08's suite; no new runtime code (enforcement stays in the decoder) | ✅ Resolved |
| 12 | Naming & terminology | `redactEvent()` (input redaction) and `dumpCaps()` (caps summary) are redaction concerns distinct from sink plumbing. Where do they live within `safety/`? | A) Own `redact.ts` (6th file) · B) Inside `logger.ts` | **A** — `src/engine/safety/redact.ts` holds `redactEvent()` + `dumpCaps()`; `logger.ts` keeps levels/record/sinks | ✅ Resolved |
| 13 | Behavioral | RD-08's sanitizer rule table offers "strip (or escape to visible)" for ESC; the current impl strips (`render/sanitize.ts:27`). Keep behavior identical on relocation, or add an escape-to-visible mode? | A) Strip-only; identical signature `sanitize(text:string):string` · B) Add an escape-to-visible option | **A** — strip-only, identical signature; the relocation is a pure behavior-preserving refactor (escape-to-visible is a possible later enhancement) | ✅ Resolved |
| 14 | Naming & terminology | What API shape does the logger expose (codebase mixes `createHost` factory and `ScreenBuffer` class)? | A) `createLogger(options)` factory returning a `Logger` interface · B) `Logger` class (`new Logger()`) | **A** — `createLogger(options)` factory (mirrors `createHost`, the nearest stateful-resource analog); disabled → no-op `Logger` (AC-5); ring sink exposes `entries()` | ✅ Resolved |

### Resolution Notes

**AR-1:** The host already restores the terminal before exiting on `uncaughtException`/`unhandledRejection` via `handleFatal` (`src/engine/host/host.ts:113-130`). RD-08 adds no run loop; the app owns its own draw loop and a throw there reaches `handleFatal`. AC-6 is an acceptance test over that existing path, throwing an RD-08 typed error to prove restore precedes exit.

**AR-2:** On Node, `setRawMode` exists on a stream only when it is a TTY, and the RD-07 `RuntimeAdapter.setRawMode` is `isTTY`-guarded (`types.ts:80`), so "interactive TTY" and "raw-mode keyboard input" collapse to the single signal `host.isTTY`. `caps.colorDepth` is a non-null union (`'mono'|'16'|'256'|'truecolor'`), so the `colorDepth != null` essential is always met ("mono counts") — encoded for spec fidelity but never the failing condition. Cursor addressing and screen clear are universal on any VT/ANSI terminal, so they are implied-true once an interactive TTY exists; no new capability fields are added to the already-Implemented RD-02 profile.

**AR-3 / AR-13:** The canonical file moves to `src/engine/safety/sanitize.ts` verbatim (strip-only, same signature). Internal importers update their paths: `render/osc.ts:16` and `render/buffer.ts:20` import from `../safety/sanitize.js`; `render/index.ts:35` drops its `sanitize` re-export; `src/engine/index.ts` re-exports `sanitize` from `./safety/index.js` so the public surface (`@blendsdk/tui` → `sanitize`) is unchanged.

**AR-5 / AR-9 / AR-12:** `redactEvent(event: InputEvent)` is pure and lives in `safety/redact.ts`. Discriminator for keys: `KeyEvent.codepoint` is present only for printable keys (`events.ts:24`) and absent for named keys (`key ∈ KEY_NAMES`). Mouse/wheel/focus carry no secrets (coordinates/button/direction/focus flag) and are logged as-is.

**AR-7 / AR-10:** `LoggerConfigError` is thrown by `createLogger()` at construction when the resolved sink (file path or stderr) maps to the UI output stream's file descriptor — failing fast so a misconfigured logger can never corrupt the screen (AC-7).

**AR-8:** `evaluateEssentials(caps, facts)` is pure (no I/O) for testability; `assertEssentials(caps, facts, { logger? })` throws `EssentialsNotMetError` when `!met` and, when given a logger, writes each degradation once at `info`. The two essentials and three non-essentials (mouse→keyboard-only, color/mono→monochrome, no-alt-screen→inline) are derived from RD-08 §Essentials evaluation and AC-2.

**AR-11:** No new paste-cap code. RD-08 adds the AC-7 boundary test (`cap+1` bytes → `truncated:true`) and the AC-8 DoS test, both exercising the existing decoder enforcement, and documents the cap as the RD-08 security boundary.

### Preflight amendments (2026-06-27, see `00-preflight-report.md`)

- **AR-2 (PF-001):** `host.isTTY` is populated only inside `start()` (`host.ts:138`), so the gate
  cannot read it pre-start — calling `assertEssentials(caps, host)` before `start()` would refuse
  every real terminal. Resolved by adding an **additive** `detectTty(options?)` helper to RD-07
  `streams.ts` (factored from `bindStreams`, ephemeral open+dispose, shares the `/dev/tty`
  detection) that the gate reads before `start()`. This is not a `Host`/`CapabilityProfile` type
  change, so AR-2's "no RD-07 type edits" intent stands; the original "host untouched" wording is
  relaxed to "no RD-07 *type* edits". Option A (app re-deriving `process.stdout.isTTY`) was
  rejected: it duplicates `bindStreams` (DRY) and regresses the `/dev/tty` fallback for piped apps.
- **AR-2 (PF-007):** the `colorDepth != null` essential is removed from the runtime check — the
  `ColorDepth` union is non-null, making the branch unreachable dead code. The only runtime
  essential is `isTTY`; color stays a non-essential degradation (mono counts).
- **AR-8 (PF-002):** AC-1's "host guaranteed-restore" wording corrected — a pre-start refusal
  enters no modes, so the terminal is untouched and no restore runs; guaranteed-restore is AC-6.
- **AR-10 (PF-003):** the logger UI-stream guard (AC-7) mechanism is pinned: stderr → fd-number
  compare; file → `{dev,ino}` equality with an `ino !== 0` guard (best-effort where inodes are
  unstable), behind an injectable stat seam so ST-22 is deterministic cross-platform.

### Runtime decisions (during execution)

- **RT-1 (AR-10, runtime):** the file-sink UI-stream guard drops the documented `realpathSync`
  step. The doc described "`realpath`s + `openSync`s + `fstatSync`s the path", but `realpathSync`
  throws `ENOENT` on a not-yet-created log file (the common case), and `openSync(path,'a')` already
  follows symlinks so the fd-based `fstatSync` reads the real `{dev,ino}` — making `realpath`
  redundant for the guard. The injectable `LoggerFs` seam therefore omits `realpathSync`; the AC-7
  behavior (throw on UI-stream collision; allow distinct / `ino===0`) is unchanged.
