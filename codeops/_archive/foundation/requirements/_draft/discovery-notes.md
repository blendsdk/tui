# Discovery Notes — Turbo Vision-style TUI SDK (TypeScript/Node)

> Working draft for `make_requirements` Full Discovery. Survives interruptions.
> Resume with "make_requirements --continue".

## Mode & classification
- Mode: **Full Discovery**
- Project type: **Library / SDK** (key focus: API design, backward compatibility,
  bundle/dependency size, cross-platform support)
- Phase reached: **Phase 1 (Discovery)** — first interview turn sent.

## Established context (from user, do not re-derive)
- Goal: enterprise-grade SDK for building Borland **Turbo Vision-style** TUI apps in TS/Node.
- **Hard gate**: a terminal-aware **renderer + input core** that detects the terminal and
  renders/inputs correctly across mainstream terminals/OSes. If keyboard, mouse, and
  scroll can't be supported reliably → **stop the project**. UI/widgets are out of scope
  until the foundation is proven.
- A working TV "hello world" clone is ARCHIVED at
  `_archive/turbo-hello-clone-v1-2026-06-26.tar.gz`; source still in `src/`.
  It already bypasses Ink's renderer (own `ScreenBuffer` + direct ANSI; Ink only a host).
- Existing reusable primitives: `src/tui/buffer.ts`, `serialize.ts`, `ansi.ts`,
  `theme.ts`, `color.ts`; `src/app/input.ts`, `geometry.ts`, `paint.ts`.
- Known gaps to cover: (1) no capability detection (truecolor assumed → broke over SSH/Mac);
  (2) no width-correct cell model (CJK/emoji); (3) partial input (press only);
  (4) no frame diffing; (5) non-portable host (no Windows VT, no SIGCONT/SIGTSTP).
- Feasibility verdict: **GO** (prior art: blessed/neo-blessed, terminal-kit; Node tty).
- Foundation plan: `/home/gevik/.claude/plans/question-now-that-snuggly-leaf.md`.
- Toolchain: TS, Node >=18, ESM, npm, tsx, Node built-in test runner; CodeOps standards.

## Stakeholders (draft — to confirm)
| # | Role | Needs |
|---|------|-------|
| 1 | App developer (SDK consumer) | Clean typed API, reliable cross-terminal behavior, docs |
| 2 | SDK maintainer/contributor | Testable pure core, clear layering, CI terminal matrix |
| 3 | End user of a built app | Correct rendering, responsive mouse/keyboard/scroll on their terminal |
| 4 | Release/CI | Reproducible builds, automated tests, packaging |

## KEY REFRAME (user, this turn) — probe-first, evidence-driven
- The spike is a **Capability Probe & Terminal Survey**: it must **test ALL listed
  capabilities (Wants AND Maybes)** across the terminal/OS matrix and report a
  **per-terminal support matrix + recommendation** — "see what is actually possible"
  rather than assume. The Maybes are wanted *if achievable*.
- Consequence: the probe is the FIRST deliverable (likely RD-01). Its evidence sets the
  engine's required baseline (capability model + acceptance gate). Want/Maybe/Skip calls
  convert mostly to "probe → matrix decides," except pure policy/architecture decisions
  (build-vs-reuse, host, Windows scope, packaging, unicode-as-gate) which the user still
  decides.
- Probe should be Ink-free (pure terminal I/O) and throwaway-able but structured so its
  detection/encoding modules seed the real engine.

## KEY REFRAME #2 (user, this turn) — probe core IS a shipped runtime subsystem
- The probe's **detection core is a foundational, shipped component**, not just a dev
  tool. At app startup the SDK detects the running terminal and **auto-configures/adjusts
  the foundational components** (color, mouse, unicode/width, input, output/diff, host) —
  **zero-config**; the developer never reasons about terminal differences.
- One shared core, two faces: (a) runtime **auto-config** (shipped) and (b) diagnostic
  **probe/survey harness** (dev tool = core + guided test patterns + support-matrix report).
- Implications (new requirements): every foundational component is **capability-driven**
  (reads CapabilityProfile, no hardcoded assumptions); startup detection is **fast,
  non-blocking, safe** with layered fallback (runtime query w/ timeout → env → terminfo/
  known-terminal table → safe defaults; never hang); always an **override API**.
- Reinforces: own a small core (not blessed); native Node-`tty` host (Ink-free).
- Persisted to cross-session memory: `tui-sdk-capability-autoconfig`.

## RESOLVED DECISIONS (user confirmed)
- **D1 Build-vs-reuse → OWN a small modern, PURE-JS core** (no native runtime deps, for
  max portability); reuse only narrow pure-JS leaf libs (e.g. string-width/wcwidth, maybe
  a terminfo parser). Driver: must work on all mainstream OSes; owning gives full control.
- **D2 Host → native Node-`tty` host, Ink-free** (drop Ink entirely from the engine).
- **D3 Cross-platform → Linux + macOS + Windows all MUST.** Architected cross-platform
  from day one. Dev + immediate gate on **Linux/Ubuntu** (current env). **macOS and Windows
  are required but verified in SEPARATE testing passes/milestones** (method TBD: real
  machines and/or CI matrix). NOTE: Windows has no SIGWINCH/SIGTSTP/SIGCONT — host must
  abstract per-platform (stdout 'resize' on Windows, ConPTY, VT-mode enable).
- **D4 Unicode width → CAPABILITY-DRIVEN via the probe (first-class).** The probe detects
  width behavior (ambiguous-width, emoji/ZWJ) and the SDK **auto-adapts**; a correct base
  wcwidth/grapheme implementation is the required baseline. Not a pre-fixed "implement all"
  — probe + auto-config decide the achievable level per terminal.
- **D5 Packaging → npm `@blendsdk/tui`, ESM-only, MIT**, minimal (ideally zero) runtime deps.
- **D6 Eventual UI direction → OUT of this phase** (long-term vision only).
- **D7 Stop philosophy → TWO DISTINCT MODES of the shared detection core:**
  - **Spike / probe-survey harness mode:** probe **ALL** capabilities, **never stop** —
    gather full evidence and report what's possible everywhere.
  - **Runtime SDK mode:** at app startup, enforce an **"essentials gate"** — if the running
    terminal does not meet the essential capabilities, the SDK **stops** (fail fast, clear
    error, restore terminal, exit non-zero). Non-essential capabilities **degrade
    gracefully**.
  - OPEN (AR): the precise **"essentials" set** the runtime gate enforces — keyboard +
    basic rendering are clearly essential; whether **mouse + scroll** are hard-essential
    (refuse to run) vs preferred-degrade-to-keyboard is the decision to make.
- **D4 Unicode width → CONFIRMED capability-driven** (baseline wcwidth/grapheme measurer +
  probe resolves ambiguous/emoji width and auto-adapts the cell model).

## COMPLETENESS SWEEP — gaps found & folded in (user pre-accepted recs)
- **Essentials = Option A** (keyboard + basic rendering hard-essential; mouse/scroll/color/
  alt-screen degrade gracefully with a one-time notice). macOS/Windows verified via **CI
  matrix** + manual spot-checks. Edge-case 12-row recs accepted as-is.
- **C1 Screen-safe diagnostic logging:** a TUI lib can't log to stdout (owns the screen).
  Log to file/stderr/in-memory ring, env-gated (e.g. `BLENDTUI_DEBUG`). **MUST NOT log raw
  keystrokes by default** (they may contain passwords) — security.
- **C2 Configurable I/O streams:** inject input/output streams (for tests) and use `/dev/tty`
  when stdout is piped. Improves testability + piped-stdout apps.
- **C3 Glyph capability + ASCII fallback:** detect UTF-8/box-drawing/half-block availability;
  degrade box/shadow glyphs to ASCII when absent. Part of capability-driven rendering.
- **C4 Developer error model:** typed errors; **guaranteed terminal restore on ANY throw**
  (never leave the terminal corrupted).
- **C5 Locale/encoding:** assume UTF-8 output; `LANG`/`LC_*` influence ambiguous-width.
- **C6 Explicit OUT-OF-SCOPE:** bidi/RTL text, Sixel/Kitty images as core, nested TUIs,
  telemetry/analytics, persistence, and ALL UI/widgets/object-model.
- **C7 Node + packaging:** support active LTS (18/20/22); ship `.d.ts`; ESM-only,
  tree-shakeable/sideEffect-free; `engines` field; ESM-only interop trade-off accepted.
- **C8 Dependency/supply-chain:** reused leaves MIT-compatible; `npm` provenance; security
  tests (sanitization, paste cap, control-injection).
- **C9 Release governance:** SemVer + deprecation policy + changelog.
- **C10 SIGHUP** (terminal closed) added to host signal handling.
- **Security non-negotiables status:** input sanitization (untrusted text → buffer) ✅,
  control/ANSI-injection prevention ✅, paste/flood DoS caps ✅, no-secret-logging (keystrokes)
  ✅, dependency audit ✅, security tests ✅. Auth/authz/encryption/rate-limit-endpoints = N/A
  (offline rendering library, no server/network/DB).

## ADDITION (user) — desktop notifications as a probed capability
- Terminals support desktop notifications via **terminal-specific OSC sequences** (no
  universal standard): **OSC 9** (iTerm2), **OSC 777** (urxvt-style title/body),
  **OSC 99** (Kitty rich), **OSC 9;4** (progress; ConEmu/Windows Terminal), and
  **BEL + WM urgency** as the near-universal fallback.
- Fire-and-forget (no query reply) → probe via known-terminal table + **manual confirmation**
  in the harness; bell is the always-available fallback.
- Folds into RD-02 (capability flag + auto-config), RD-03 (probe/report), RD-04 (a
  capability-driven `notify(title, body)` that auto-selects protocol or degrades to bell,
  alongside OSC hyperlinks/clipboard/title/bell).
- **Security:** sanitize notification title/body (strip BEL/ST/control) to prevent OSC
  injection — ties to the untrusted-text sanitization requirement.

## PROPOSED RD DECOMPOSITION (to confirm before authoring)
- RD-01 Scaffolding & toolchain (TS, ESM, `@blendsdk/tui`, test runner, CI matrix, build/release)
- RD-02 Terminal capability model — detection + runtime auto-config + override API (shared core)
- RD-03 Capability probe & survey harness (the spike; diagnostic; emits support matrix)
- RD-04 Rendering engine — cell buffer + width model + damage diff + serializer + sync output + glyph/ASCII fallback
- RD-05 Color & styling — truecolor/256/16 downsample + attributes + NO_COLOR + palette primitives
- RD-06 Input system — keyboard + mouse + scroll + paste, chunk-safe decoder + event model
- RD-07 Host & lifecycle — native tty host, raw mode, alt-screen, signals, crash restore, non-TTY, configurable I/O, cross-platform
- RD-08 Runtime essentials gate + diagnostic logging + error model + security
- RD-09 Testing strategy & terminal matrix (unit/golden/PTY/corpus/perf) + acceptance gate
- RD-10 Non-functional requirements (perf budget, cross-platform matrix, API stability/SemVer, packaging, accessibility/degradation, docs, supply-chain)

## Still-open (carried into edge cases / structuring)
- Security: sanitize untrusted text/ANSI-control injection into the buffer; paste size limits.
- macOS/Windows verification logistics (manual on real machines vs CI matrix).
- Edge-case handling policies (terminal lies, query timeout, resize mid-render, non-TTY,
  SSH drop, suspend/resume, crash restore) — Phase 1.5 next.

## Next step
Await answers to the Phase 1 interview (vision/stakeholder confirmation,
comparable-systems feature selection, top decision forks), then edge cases →
scope confirmation → Phase 2 structuring → Zero-Ambiguity Gate.
