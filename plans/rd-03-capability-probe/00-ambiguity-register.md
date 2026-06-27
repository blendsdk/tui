# Ambiguity Register: RD-03 Capability Probe & Survey Harness

> **Status**: ✅ GATE PASSED — all 17 items resolved
> **Last Updated**: 2026-06-28
> **Plan**: [rd-03-capability-probe](00-index.md) · **Implements**: RD-03

This register is the audit trail for the Zero-Ambiguity Gate. Every design, scope,
behavioral, naming, and toolchain decision in the plan documents traces back to a
numbered row here. Rows AR-1…AR-13 were resolved by the user in four batched
question rounds on 2026-06-28; AR-14…AR-17 are decisions the RD itself already
locked (recorded here for traceability).

| #  | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|----|----------|-----------------|-------------------|---------------|--------|
| 1  | Scope | How much of the RD-03 taxonomy does this plan cover? | Full RD (phased) / MVP slice + defer | **Full RD, phased into 5 sequential phases** | ✅ Resolved |
| 2  | Naming / Structure | Where does the harness live and how is it run? | `examples/capability-probe/` / `examples/probe/` | **`examples/capability-probe/`, entry `main.ts`, `npm run probe` → `tsx`, dev-only (not in published `files`)** | ✅ Resolved |
| 3  | Architecture | Where does the real tty-backed `TerminalQuery` implementation live? | Ship reusable in `src/engine/host/` / probe-local under `examples/` | **Ship reusable in `src/engine/host/terminal-query.ts`, re-exported from the public API** | ✅ Resolved |
| 4  | Testing | Test boundary for a largely-interactive harness? | Layered (pure spec + fakes + PTY e2e + --auto e2e) / pure modules only | **Layered: pure modules spec-tested, interactive flows via injected fakes, PTY e2e for restore, --auto e2e** | ✅ Resolved |
| 5  | UX / Output | How/where is the report emitted? | Interactive table+JSON file / always both to stdout | **Interactive: table → stdout after alt-screen exit, JSON via `--out`; `--auto`: JSON → stdout** | ✅ Resolved |
| 6  | Scope | Include the `terminal-matrix.json` accumulation (Should-Have)? | Include now / defer | **Include now — append to repo-root `terminal-matrix.json` (JSON array), `--no-matrix` skips** | ✅ Resolved |
| 7  | UX / CLI | Which CLI flags? | `--auto`/`--out`/`--no-matrix`/`--help` / minimal `--auto`+`--help` | **`--auto`, `--out <path>`, `--no-matrix`, `--help`; unknown flag → error message + non-zero exit** | ✅ Resolved |
| 8  | UX / Behavioral | Operator controls (keys) for manual probes + live readout? | y/n/s + Enter + q / y/n + Enter + Esc | **y=yes, n=no, s=skip(→null); Enter advances; `q` ends live readout; Ctrl-C quits all with full restore. Input constrained to this allowlist** | ✅ Resolved |
| 9  | Behavioral / Architecture | Auto-probe sequencing vs. manual probes? | Dedicated auto phase first (inside alt-screen) / interleaved per group | **Dedicated auto-probe phase first, inside alt-screen; then guided manual probes** | ✅ Resolved |
| 10 | Data / Integration | Source of the report `recommendation` block? | Final `CapabilityProfile` (confirmations folded as overrides) / derive purely from probe results | **Run `resolveCapabilities`, fold auto-probe + manual confirmations in as override evidence, emit key fields from the resulting profile** | ✅ Resolved |
| 11 | Data / Output | Default JSON artifacts when `--out` is omitted? | Matrix append only (default); `--out` writes standalone copy / always also write per-run file | **Matrix append is the only default file; `--out <path>` additionally writes a standalone single-report JSON** | ✅ Resolved |
| 12 | Toolchain | How is `examples/` typechecked? (main tsconfig is `src`-only) | Separate `tsconfig.examples.json` + wire into `verify` / lint-only | **Add `tsconfig.examples.json` (extends base, `include:["examples"]`, `noEmit`), `typecheck:examples` script wired into `npm run verify`** | ✅ Resolved |
| 13 | Naming / Structure | Module breakdown, phase ordering, test files | Proposed layout / adjust | **Confirmed: engine `terminal-query.ts`; examples modules `main`/`args`/`taxonomy`/`env-meta`/`auto-probes`/`manual-probes`/`live-readout`/`report`/`matrix`; 5 phases; test files per §07** | ✅ Resolved |
| 14 | Scope | Coverage of probe taxonomy | (RD-locked) | **Probe every Want/Maybe and attempt+record Skip-class (images); record everything** — RD-03 AR-10 | ✅ Resolved |
| 15 | Behavioral | Stop behavior on a missing capability | (RD-locked) | **Never stop — record unsupported and continue (probe mode, not the runtime gate)** — RD-03 AR-7 | ✅ Resolved |
| 16 | Scope | Notifications coverage | (RD-locked) | **Include OSC 9 / 777 / 99 / 9;4 + bell as manual fire-and-forget probes** — RD-03 AR-11 | ✅ Resolved |
| 17 | Security | Data sensitivity of the report | (RD-locked) | **Record only terminal name/version/OS + `TERM`/`COLORTERM`/`TERM_PROGRAM`; no secrets, no full env, no paste contents (length only); query responses length-bounded; OSC patterns are program constants** — RD-03 §Security | ✅ Resolved |
| RT-1 | Technical (runtime) | Exact stream type of `TerminalQueryOptions.input`/`output` | tty `ReadStream`/`WriteStream` (03-01 draft) / base `ReadableStream`/`WritableStream` | **Base `NodeJS.ReadableStream`/`WritableStream`** — the only option that lets tests drive the adapter with real `PassThrough` streams without an unsafe cast (forbidden by the coding standards); `process.stdin`/`stdout` still satisfy the base types, so production loses nothing | ✅ Resolved |
| RT-2 | Technical / Behavioral (runtime) | `main()` test seam + non-TTY interactive exit code | inline `process.*` (untestable) / injectable `ProbeDeps` with an `isTty()` seam; exit code 0 vs 1 | **`main(deps: Partial<ProbeDeps>)` with injectable `argv`/`stdout`/`stderr`/`exit`/`isTty`/`env`/`platform`/`now` (real `process.*` + `detectTty` defaults); non-TTY interactive invocation prints to stderr and exits **1** (could not do what was asked)** | ✅ Resolved |
| RT-3 | Technical (runtime) | How auto-probes obtain results without reaching into `capability/` internals | bespoke DA/XTVERSION byte parsing in the harness / drive `resolveCapabilitiesAsync` with the live query and map the profile | **`runAutoProbes` calls the public `resolveCapabilitiesAsync({ query, env, platform, timeoutMs })` and maps `CapabilityProfile` fields → `auto` `ProbeResult`s; the terminal version string comes from env-meta, not a parsed DA response. ST-16/17/18 oracles updated to profile-derived facts (`output.sync2026`, `color.truecolor`).** | ✅ Resolved |
| RT-4 | UX / Naming (runtime) | `formatEventLine` output format + alignment to RD-06's real event model | (the 03-03 draft assumed `name`/`action`/`left` fields and 0→1-based conversion) | **Use RD-06's actual fields: `KeyEvent.key` (+ `ctrl+`/`alt+`/`shift+` prefixes), `MouseEvent.kind`+`button`+`x`/`y` (already 1-based — displayed as-is, NO conversion), `WheelEvent.dir`, `PasteEvent` → `"paste: <N> bytes"` (length only). Line formats: `key: ctrl+a`, `mouse: down button 0 @ 6,4`, `wheel: up @ x,y`, `paste: 5 bytes`, `focus: in/out`.** | ✅ Resolved |
| RT-5 | Security / UX (runtime) | Whether the readout routes through `redactEvent` | use `redactEvent` (drops printable key chars) / format raw, redact only paste | **Format raw events so keys/mouse/wheel show fully (AC-2 requires visible keystrokes; the readout is on-screen, not logging); paste shows `Buffer.byteLength` only, never contents (AR-17). `redactEvent` is not used because it strips the printable key char the readout must display.** | ✅ Resolved |

### Resolution Notes

**AR-1:** Full RD coverage, phased: (1) engine `TerminalQuery` + harness foundation, (2) auto-probes, (3) manual probes, (4) live input/mouse readout, (5) report + recommendation + matrix + `--auto` + e2e. Matches the completeness of the RD-05/RD-08 plans.

**AR-3:** The new `createTerminalQuery` completes the layer-2 wiring RD-02 deliberately deferred (`src/engine/capability/query.ts` consumes the `TerminalQuery` seam; `profile.ts:107` defines it; no concrete implementation existed). Shipping it in `src/engine/host/` (an OS/tty concern, alongside `streams.ts`) makes `resolveCapabilitiesAsync` usable by real consumers, not only the probe. This is the I/O seam, not auto-configuration logic, so it does not violate RD-03's "Won't Have: runtime auto-config (that is RD-02)".

**AR-4:** Pure/unit-testable surface = arg parser, report builder + schema, recommendation derivation, matrix merge/append, probe taxonomy registry, auto-probe response classification, env-meta redaction. Interactive flows are driven through injected fake host/streams. A PTY-backed e2e proves full restore on normal / Ctrl-C / thrown-error exits (RD AC-7, mirroring `host-signals.e2e.test.ts` and `safety-error-restore.e2e.test.ts`). An `--auto` e2e proves exit 0 + schema-valid JSON (RD AC-5).

**AR-9:** The dedicated upfront auto-probe phase reads query responses through `createTerminalQuery` under a bounded timeout (reusing RD-02's `runQueries`), so terminal response bytes can never be mistaken for manual-confirmation keypresses.

**AR-12:** `tsconfig.json` is `rootDir:"src"` / `include:["src"]`, so `examples/` cannot join the main tsconfig without breaking `tsc` and would otherwise pollute `dist`. A sibling `tsconfig.examples.json` with `noEmit` and no `rootDir` typechecks the harness without changing the build. ESLint already lints `examples/` (not in `eslint.config.js` ignores) and Prettier covers it.

**AR-17:** Security posture is enforced in `env-meta.ts` (env allowlist), `report.ts` (no secret fields), `live-readout.ts` (paste shows byte length only), and by delegating auto-probe response bounding to RD-02's `runQueries` (`RESPONSE_BUFFER_CAP`). All OSC test patterns are program-generated constants — no untrusted text embedded.
