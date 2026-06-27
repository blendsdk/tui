# Ambiguity Register: RD-02 Capability Model & Auto-Config (Plan)

> **Status**: ✅ GATE PASSED — all 14 items resolved
> *(User confirmed via the make_plan interview on 2026-06-27: 8 explicit choices + "Confirm all" for PL-9…PL-14.)*
> **Last Updated**: 2026-06-27
> **Scope**: Plan-level decisions for implementing **RD-02** (capability model & auto-config) only.
> **Source RD**: [RD-02](../../requirements/RD-02-capability-model.md)

The requirements-level Zero-Ambiguity Gate (AR-* in the requirements set) already
passed. This register covers only the **new** plan-level decisions surfaced while
turning RD-02 into an implementation plan. Each entry is prefixed `PL-`.

| #     | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|-------|----------|-----------------|-------------------|---------------|--------|
| PL-1 | Architecture / Dependency | Layer-2 live runtime query needs the RD-06 input decoder (to read + demux responses), but RD-06 is not built yet | A: seam + injectable stub · B: standalone raw-stdin reader · C: plan RD-06 first | **A — define a `TerminalQuery` seam; layer 2 takes an injectable query function (default no-op). RD-06 wires the real stream later. ACs 3/4/7 are tested via an injected stub stream.** | ✅ Resolved |
| PL-2 | Scope / Types | Profile fields needing the RD-03 probe (unicode widthMode/emoji, some OSC) — include now or omit | A: full type, table/defaults now · B: omit until RD-03 | **A — define the complete `CapabilityProfile` type now; populate probe-dependent fields from table + conservative defaults (reason `table`/`default`). RD-03 refines them. Keeps the type stable for RD-04+.** | ✅ Resolved |
| PL-3 | Scope / Should-have | Reason trace + per-process caching — include now or defer | A: both now · B: reason trace only · C: defer both | **A — include both. RD-03's report needs the reason trace; the cache is small.** | ✅ Resolved |
| PL-4 | Layout | Module layout + public API surface | A: `capability/` subfolder · B: flat files under `src/engine/` | **A — `src/engine/capability/` (profile, defaults, env, table, query, detect, index); re-export `resolveCapabilities` + types from `src/engine/index.ts`.** | ✅ Resolved |
| PL-5 | Behavior / Precedence | colorDepth precedence when override / NO_COLOR / FORCE_COLOR conflict | A: override > NO_COLOR > FORCE_COLOR > env · B: override > FORCE_COLOR > NO_COLOR > env | **A — override > NO_COLOR > FORCE_COLOR > COLORTERM > TERM/table > default. Matches AC-1 ("regardless of other signals").** | ✅ Resolved |
| PL-6 | API | Return shape of the resolve function | A: `{ profile, reasons }` · B: profile with reasons attached | **A — `resolveCapabilities(options?)` returns a frozen `CapabilityResolution = { profile, reasons }`. Keeps the profile shape clean for downstream RDs.** | ✅ Resolved |
| PL-7 | API | Override granularity | A: deep partial · B: top-level fields only | **A — `override: DeepPartial<CapabilityProfile>`, deep-merged over detected values.** | ✅ Resolved |
| PL-8 | Security / Scope | Build the bounded query-response parser now, and the response-length cap | A: build now, 1 KB cap · B: build now, 256 B cap · C: defer to RD-06 | **A — build the strict, length-bounded parser in `query.ts` now, fed by an injected stream, **1 KB** per-response cap. Enables AC-3/4/7 testing now.** | ✅ Resolved |
| PL-9 | Quality | Immutability mechanism for the resolved result | (recommendation) | **Deep `Object.freeze` on `profile` and `reasons`; `readonly` types throughout.** | ✅ Resolved |
| PL-10 | Scope | Known-terminal table seed set | (recommendation) | **Seed all terminals RD-02 lists: iTerm2, Apple Terminal, gnome-terminal/VTE, Konsole, xterm, Windows Terminal, VS Code, Kitty, Alacritty, foot, tmux/screen.** | ✅ Resolved |
| PL-11 | Behavior | Query timeout default + configurability | (recommendation) | **Default **200 ms**, configurable via `options.timeoutMs`; bounded, never hangs (AC-3).** | ✅ Resolved |
| PL-12 | Behavior | `NO_COLOR` value semantics | (recommendation) | **Presence with any value (including empty string) forces `mono` (no-color.org standard; matches AC-1 "any value").** | ✅ Resolved |
| PL-13 | Behavior | Conservative defaults (layer 5) | (recommendation) | **`colorDepth:'16'`; all capability booleans `false`; `unicode.widthMode:'wcwidth'`, `emoji:'unknown'`, `utf8` derived from `LANG`/`LC_ALL`/`LC_CTYPE` containing `UTF-8` (case-insensitive); `platform` from `process.platform`.** | ✅ Resolved |
| PL-14 | API | Cache re-resolve mechanism | (recommendation) | **First call caches per-process (module-level); `resolveCapabilities({ refresh: true })` forces re-resolution.** | ✅ Resolved |

### Resolution Notes

- **PL-1 (the crux):** RD-02's runtime queries are read "via the input decoder (RD-06)" and "demultiplexed from user input" (RD-02 §Detection algorithm, AC-4). Since RD-06 does not exist yet, layer 2 is built behind a `TerminalQuery` seam: `resolveCapabilities` accepts an optional query function/stream; when absent, layer 2 is skipped (no-op) and detection relies on layers 1/3/4/5. The bounded response **parser** (PL-8) is built now and unit-tested with stub streams, so AC-3 (timeout), AC-4 (demux), and AC-7 (oversized/malformed) are verified in RD-02; RD-06 later supplies the real stream.
- **PL-5 / PL-12:** `NO_COLOR` (any value) → `mono` and wins over `FORCE_COLOR`. Full colorDepth precedence: layer-1 override → `NO_COLOR` → `FORCE_COLOR` → `COLORTERM` → `TERM`/table → default `'16'`.
- **PL-9…PL-14** are the planner's recommendations, confirmed by the user's explicit "Confirm all" (per the gate's final-confirmation rule), not by silence.
