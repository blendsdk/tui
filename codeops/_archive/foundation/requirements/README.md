# @blendsdk/tui — Requirements Documents

> **Project**: `@blendsdk/tui` — an enterprise-grade SDK for building Borland Turbo Vision-style terminal (TUI) applications in TypeScript/Node.js. **This requirements set covers Phase 1: the terminal-aware renderer + input + host FOUNDATION only.**
> **Status**: Draft
> **Created**: 2026-06-27
> **Architecture**: TypeScript, Node.js ≥18 (active LTS), ESM-only, npm, native `tty` host (no Ink, no native runtime deps), Node built-in test runner + `@xterm/headless` + `node-pty`
> **CodeOps Skills Version**: 2.0.0

---

## Overview

`@blendsdk/tui` will eventually be a comprehensive SDK for Turbo Vision-style TUI
applications. Before any UI is designed, the project must prove a **foundation**:
a renderer + input + host core that **recognizes the terminal it is running on and
renders/inputs correctly across all mainstream terminals and operating systems**.
This requirements set scopes that foundation and treats it as a hard go/no-go gate —
if keyboard, mouse, and scroll cannot work reliably on mainstream terminals, the
project stops (see RD-09 acceptance gate).

The defining architectural idea is **zero-config terminal adaptation**: a single
capability-detection core powers two faces — (1) a *shipped runtime auto-configuration
subsystem* that, at app startup, detects the terminal and auto-tunes every foundational
component (color, mouse, unicode/width, input, output/diff, host) so the app developer
never reasons about terminal differences; and (2) a *diagnostic probe/survey harness*
that exercises every capability and reports a per-terminal support matrix. The whole
foundation is **capability-driven**: no component hardcodes assumptions (assuming
truecolor is exactly what broke colors over SSH from a Mac).

A working Turbo Vision "hello world" prototype already exists (archived at
`_archive/turbo-hello-clone-v1-2026-06-26.tar.gz`) and contributes proven primitives —
a cell buffer, a flicker-free ANSI serializer, SGR-mouse parsing, and absolute-coordinate
hit-testing — which seed this foundation. The prototype already bypasses Ink's renderer;
this phase finishes demoting Ink (removing it) in favor of a native `tty` host.

## Domain Glossary

| Term | Definition |
|------|-----------|
| **Cell** | One character grid position: a glyph plus foreground/background style and a display width (1 or 2). |
| **ScreenBuffer** | A 2-D grid of Cells the app draws into; the renderer's working surface (a "draw buffer"). |
| **Serializer** | Converts a ScreenBuffer (and the previous frame) into the ANSI byte string that paints it. |
| **Damage diffing** | Emitting bytes only for cells that changed since the last frame (output ∝ damage). |
| **CapabilityProfile** | The resolved set of facts about the running terminal (color depth, mouse, unicode width, OSC features, etc.) that drives auto-configuration. |
| **Probe / survey harness** | The diagnostic tool that attempts every capability and reports a per-terminal support matrix. |
| **Host** | The native layer owning the terminal: raw mode, alt-screen, signals, stream binding, cleanup. |
| **Essentials gate** | The runtime check that refuses to start the SDK if essential capabilities (keyboard + basic rendering) are absent. |
| **CSI / SGR / OSC** | ANSI control families: Control Sequence Introducer (`ESC [`), Select Graphic Rendition (colors/attrs, `ESC [ … m`), Operating System Command (`ESC ] …`). |
| **Alt-screen** | The alternate screen buffer (`?1049`), giving a full-screen surface with no scrollback. |
| **Raw mode** | TTY mode delivering keystrokes byte-by-byte without line buffering or echo. |
| **Bracketed paste** | `?2004` mode wrapping pasted text in `ESC[200~`…`ESC[201~` so it isn't read as keystrokes. |
| **SGR mouse (1006)** | Extended mouse reporting encoding events as `ESC[<b;x;y M|m`, correct beyond column 223. |
| **CSI-u / Kitty keyboard** | Modern keyboard protocols that disambiguate keys and report key-release (progressive enhancement). |
| **Synchronized output** | `?2026` mode that batches a frame so the terminal renders it atomically (no tearing). |
| **wcwidth / grapheme cluster** | The display width of a character/cluster; East-Asian wide chars occupy 2 cells. |
| **Truecolor / 256 / 16** | Color depths: 24-bit RGB, the xterm 256-color cube, and the 16 ANSI colors. |
| **Downsampling** | Mapping a 24-bit color to the nearest available color at a lower depth. |
| **TTY / PTY / ConPTY** | A terminal device / pseudo-terminal / the Windows pseudo-terminal. |
| **VT mode** | Windows console flag enabling ANSI ("Virtual Terminal") sequence processing. |
| **Glyph fallback** | Substituting ASCII for box-drawing/half-block glyphs when UTF-8/font support is absent. |

## Document Index

| # | Document | Description | Depends On |
|---|----------|-------------|------------|
| **AR** | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (audit trail) | — |
| **RD-01** | [Scaffolding & Toolchain](RD-01-scaffolding-and-toolchain.md) | Repo, TS/ESM build, `@blendsdk/tui` package, test runner, CI matrix, release | — |
| **RD-02** | [Capability Model & Auto-Config](RD-02-capability-model.md) | Terminal detection, `CapabilityProfile`, runtime auto-config, override API | RD-01 |
| **RD-03** | [Capability Probe & Survey Harness](RD-03-capability-probe.md) | The spike: probe all capabilities, emit a per-terminal support matrix | RD-02, RD-04, RD-06, RD-07 |
| **RD-04** | [Rendering Engine](RD-04-rendering-engine.md) | Cell buffer, width model, damage diff, serializer, sync output, glyph fallback, OSC features | RD-01, RD-02 |
| **RD-05** | [Color & Styling](RD-05-color-and-styling.md) | Color depth downsampling, text attributes, `NO_COLOR`, palette primitives | RD-02 |
| **RD-06** | [Input System](RD-06-input-system.md) | Keyboard, mouse, scroll, paste; chunk-safe decoder; event model | RD-01 |
| **RD-07** | [Host & Lifecycle](RD-07-host-and-lifecycle.md) | Native `tty` host, raw mode, alt-screen, signals, restore, non-TTY, configurable I/O, cross-platform | RD-02, RD-04, RD-06 |
| **RD-08** | [Essentials Gate, Logging, Errors & Security](RD-08-essentials-logging-security.md) | Runtime essentials gate, screen-safe logging, error model, sanitization | RD-02, RD-07 |
| **RD-09** | [Testing Strategy & Acceptance Gate](RD-09-testing-and-acceptance.md) | 4 test tiers, terminal matrix, the project go/no-go acceptance criteria | all |
| **RD-10** | [Non-Functional Requirements](RD-10-non-functional.md) | Performance, cross-platform matrix, API stability, packaging, accessibility, docs, supply-chain | all |

## Dependency Graph

```
RD-01 (Scaffolding)
  ├── RD-02 (Capability Model & Auto-Config)
  │     ├── RD-04 (Rendering Engine) ──┐
  │     ├── RD-05 (Color & Styling)    │
  │     └── RD-07 (Host & Lifecycle) ◄─┤ (also needs RD-06)
  │             └── RD-08 (Essentials, Logging, Security)
  ├── RD-06 (Input System) ────────────┘
  └── RD-03 (Capability Probe)  ◄ uses RD-02 core + RD-04/06/07 to render & read
RD-09 (Testing & Acceptance)  ◄ spans all
RD-10 (Non-Functional)        ◄ spans all
```

## Suggested Implementation Order

| Phase | Documents | Description |
|-------|-----------|-------------|
| **A: Gate MVP** | RD-01 → RD-02 → RD-06 → RD-04 → RD-07 → RD-08 → RD-09 | The minimum to prove the go/no-go gate on Linux: detect, render, input, host, essentials, and the acceptance harness. |
| **B: Full foundation** | RD-03 → RD-05 → (notifications/OSC in RD-04) → progressive enhancements | The complete probe/survey harness, full color/styling, OSC features incl. notifications, CSI-u/Kitty enhancement, perf tuning. |
| **C: Cross-platform verification** | RD-09 matrix on macOS + Windows | Separate required milestones verifying the matrix beyond Linux. |
| **Cross-cutting** | RD-10 | Non-functional requirements enforced throughout. |

## Key Architecture Decisions

| Decision | Choice | Rationale | AR Ref |
|----------|--------|-----------|--------|
| Phase scope | Foundation only; UI deferred | Prove the renderer/input gate before building anything on it | AR-1, AR-26 |
| Build vs reuse | Own a small **pure-JS** core | Full control + best portability across all OSes; no native runtime deps | AR-2 |
| Host | Native Node-`tty`, Ink removed | The engine renders/inputs itself; Ink added only plumbing | AR-3 |
| Cross-platform | Linux + macOS + Windows MUST | Enterprise reach; verified per-OS | AR-4 |
| Capability core | Shared: runtime auto-config + probe harness | Zero-config terminal adaptation is the core value | AR-9 |
| Stop behavior | Spike never stops; runtime essentials gate stops | Probe broadly; refuse to run broken | AR-7, AR-8 |
| Packaging | `@blendsdk/tui`, ESM-only, MIT | User decision | AR-6 |

## How to Use These Documents

Each requirements document is designed to be used with the make_plan skill:

1. Pick a requirements document (e.g., RD-01).
2. Run the make_plan skill.
3. The plan system uses the RD as input to create an implementation plan.
4. Run the exec_plan skill for the feature.
5. Implement iteratively, specification-first.

Suggested order: **RD-01 → RD-02 → RD-06 → RD-04 → RD-07 → RD-08 → RD-09**, then RD-03, RD-05, RD-10.
