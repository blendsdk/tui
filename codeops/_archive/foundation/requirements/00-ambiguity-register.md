# Ambiguity Register: @blendsdk/tui Foundation Requirements

> **Status**: ✅ GATE PASSED — all 26 items resolved
> **Last Updated**: 2026-06-27
> **Scope**: Phase 1 — the terminal-aware renderer + input + host **foundation**.
> UI/widgets/object-model are explicitly out of this phase (AR-1, AR-26).

Every decision below traces to an explicit user answer in the discovery
conversation. Items marked "accepted recommendation" were resolved by the user's
explicit statements *"if we did not forget anything then I accept your
recommendations"* and *"go"*, after reviewing each recommendation — not by silence.

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|---|----------|-----------------|-------------------|---------------|--------|
| 1 | Scope | What is in Phase 1? | Foundation-only / include some UI | **Foundation only; all UI deferred to later phases (vision)** | ✅ Resolved |
| 2 | Technical | Build own core vs reuse blessed/terminal-kit | Own pure-JS core / build on blessed / terminal-kit | **Own a small pure-JS core (no native runtime deps); reuse only narrow pure-JS leaves** | ✅ Resolved |
| 3 | Technical | Host layer | Native Node-`tty` (Ink-free) / keep Ink as host | **Native Node-`tty` host, Ink removed from the engine** | ✅ Resolved |
| 4 | NFR/Scope | OS support & verification | Linux-only / Linux+mac+win | **Linux + macOS + Windows all MUST; dev+gate on Linux now; macOS & Windows verified as separate milestones** | ✅ Resolved |
| 5 | Technical | Unicode width handling | Pre-fixed wcwidth / capability-driven via probe | **Capability-driven via the probe + baseline wcwidth/grapheme measurer** | ✅ Resolved |
| 6 | Packaging | Name / module format / license | various | **`@blendsdk/tui`, ESM-only, MIT, ~zero runtime deps** | ✅ Resolved |
| 7 | Behavioral | Stop philosophy | Single gate / two-mode | **Two modes: spike probes ALL & never stops; runtime SDK enforces an essentials gate and stops if unmet** | ✅ Resolved |
| 8 | Behavioral | Runtime "essentials" set | A: keyboard+rendering only / B: also mouse+scroll | **Option A — keyboard + basic rendering essential; mouse/scroll/color/alt-screen degrade gracefully** | ✅ Resolved |
| 9 | Architecture | Is the probe a dev tool only? | dev-only / shipped runtime subsystem | **Shared detection core: shipped runtime auto-config (zero-config) + diagnostic harness** | ✅ Resolved |
| 10 | Behavioral | Probe coverage & method | only "Wants" / all Wants+Maybes; auto+manual | **Probe all Wants AND Maybes (record Skips); auto-detect where possible + guided manual confirmation** | ✅ Resolved |
| 11 | Feature | Desktop notifications | include / exclude | **Include: probe OSC 9/777/99/9;4 + bell; capability-driven `notify()` degrading to bell; sanitize content** | ✅ Resolved |
| 12 | Technical | Color depth floor & degradation | various | **Auto-detect + downsample truecolor→256→16; honor `NO_COLOR`/`FORCE_COLOR`; 16-color floor; monochrome degrade** | ✅ Resolved (accepted rec) |
| 13 | Technical | Input fidelity bar for the gate | classic xterm / require CSI-u | **Classic xterm input is the gate; CSI-u/Kitty keyboard is progressive enhancement** | ✅ Resolved (accepted rec) |
| 14 | Technical | Required rendering features | various | **Damage diffing + synchronized output (`?2026`) required; glyph capability + ASCII fallback** | ✅ Resolved (accepted rec) |
| 15 | Security | Untrusted content & injection | ignore / sanitize | **Sanitize untrusted text/OSC/control before it enters the buffer or an OSC sequence; cap paste size** | ✅ Resolved (accepted rec) |
| 16 | NFR | Diagnostic logging (lib owns screen) | stdout / screen-safe sink | **Screen-safe logging (file/stderr/in-memory ring, env-gated); MUST NOT log raw keystrokes by default** | ✅ Resolved (accepted rec) |
| 17 | Technical | I/O stream binding | hardcode process std / configurable | **Configurable/injectable input+output streams; use `/dev/tty` when stdout is piped** | ✅ Resolved (accepted rec) |
| 18 | Behavioral | Error model & failure restore | unspecified / typed + guaranteed restore | **Typed errors; guaranteed terminal restore on any throw/exit/SIGHUP/crash** | ✅ Resolved (accepted rec) |
| 19 | Technical | Encoding/locale assumptions | unspecified | **Assume UTF-8 output; `LANG`/`LC_*` influence ambiguous-width resolution** | ✅ Resolved (accepted rec) |
| 20 | Packaging | Node support & dist details | unspecified | **Active LTS (18/20/22); ship `.d.ts`; tree-shakeable, sideEffect-free ESM; `engines` field** | ✅ Resolved (accepted rec) |
| 21 | Security | Supply chain | unspecified | **Reused leaves MIT-compatible; dependency audit; npm provenance; security tests** | ✅ Resolved (accepted rec) |
| 22 | NFR | API governance | unspecified | **SemVer + documented deprecation policy + changelog; frozen public API surface** | ✅ Resolved (accepted rec) |
| 23 | NFR | Testing strategy & matrix | unspecified | **4 tiers (unit / golden via `@xterm/headless` / PTY via `node-pty` / manual matrix) + CI matrix (ubuntu/macos/windows); input corpus; perf benchmarks** | ✅ Resolved (accepted rec) |
| 24 | Edge cases | 12 failure-mode handlings | various | **All 12 accepted as specified (see RD-07/RD-08)** | ✅ Resolved (accepted rec) |
| 25 | NFR | Performance budget | unspecified | **Frame compose+diff under one frame (≤16 ms) at a defined reference size (200×50); output bytes proportional to damage** | ✅ Resolved (accepted rec) |
| 26 | Scope | Explicit out-of-scope | — | **Bidi/RTL text, Sixel/Kitty images as core, nested TUIs, telemetry, persistence, and ALL UI/widgets/object-model** | ✅ Resolved |

### Resolution Notes

- **AR-2/AR-3/AR-8 and AR-12–AR-25** were recommendations I presented with rationale; the user reviewed them across the discovery turns and explicitly accepted ("I accept your recommendations", then "go"). Recorded as the user's decision, not AI delegation.
- **AR-4:** user verbatim — *"yes, windows is a must but needed to be tested separately, the same goes for osx, we are on linux/ubuntu now."* Windows lacks `SIGWINCH`/`SIGTSTP`/`SIGCONT`; the host abstracts per-platform.
- **AR-5:** user verbatim — *"yes"* (width is capability-driven, the reason the probe is first-class).
- **AR-6:** user verbatim — *"ESM, MIT, @blendsdk/tui."*
- **AR-7:** user verbatim — *"When doing the spike we probe all and do not stop. When using the probe from the SDK, then we stop if essentials are not met."*
- **AR-9:** user instruction to remember — the probe's detection core doubles as a shipped runtime auto-configuration subsystem (zero-config terminal adaptation). Persisted to project memory.
- **AR-11:** user — *"Do terminals support notifications? if so then add that too to the probe."*
- **AR-26:** the UI/object-model strategic direction (TView-OOP vs React vs FFI) is intentionally NOT decided here; it is a later-phase decision.
