# RD-09: Testing Strategy & Acceptance Gate

> **Document**: RD-09-testing-and-acceptance.md
> **Status**: Draft
> **Created**: 2026-06-27
> **Project**: @blendsdk/tui (Foundation)
> **Depends On**: all
> **CodeOps Skills Version**: 2.0.0

---

## Feature Overview

Defines how the foundation is proven and encodes the **project go/no-go gate**. Terminal
I/O is "bytes in → bytes out", which is unusually testable: most of the engine is pure
functions. This RD specifies four test tiers (pure unit, golden-screen, PTY integration,
manual terminal matrix), the CI matrix, the recorded input corpus, performance
benchmarks, and the explicit **acceptance criteria that decide whether the project
proceeds or stops** (per the user's gate: if keyboard + mouse + scroll can't work
reliably on mainstream terminals, halt).

---

## Functional Requirements

### Must Have
- [ ] **Tier 1 — Pure unit tests** (no terminal): capability resolution (RD-02), color downsampling (RD-05), input decoder against a recorded corpus (RD-06), damage-diff correctness + width model (RD-04), sanitizer (RD-08). Spec vs impl files separated.
- [ ] **Tier 2 — Golden-screen tests**: render a buffer → serialize → feed bytes to `@xterm/headless` → assert the resulting grid (cell char + colors + width) per capability profile.
- [ ] **Tier 3 — PTY integration** (`node-pty`): spawn a harness in a real pseudo-terminal, feed input bytes, capture output; assert decoded events and verify alt-screen enter/leave, mouse enable/disable, and **full restore** on normal/Ctrl-C/throw exits.
- [ ] **Tier 4 — Manual terminal matrix**: the RD-03 probe run on each target terminal, producing the support-matrix checklist (the human-judged half of the gate).
- [ ] **CI matrix**: ubuntu/macos/windows × Node 18/20/22 running Tiers 1–2 and the headless parts of Tier 3, plus the probe in `--auto` mode.
- [ ] **Recorded input corpus**: a checked-in set of `bytes → expected events` fixtures (incl. chunk-split sequences, SGR mouse, wheel, paste, DA responses) driving Tier 1 regression.
- [ ] **Performance benchmarks** asserting the RD-10 budget (frame compose+diff time; bytes ∝ damage).
- [ ] **Security tests**: sanitizer (ESC/BEL/ST/C0/C1), paste-cap DoS, essentials gate, no-secret-logging, malformed/oversized query-response handling.

### Should Have
- [ ] A fuzz harness feeding random/adversarial byte streams to the decoder (no crash, bounded memory).
- [ ] Accumulating `terminal-matrix.json` across runs/contributors.

### Won't Have (Out of Scope)
- UI/widget tests — out of phase.

---

## Technical Requirements

### Terminal / OS matrix (verification targets)
| OS | Terminals | Color | Notes |
|----|-----------|-------|-------|
| Linux | xterm, gnome-terminal/VTE, Konsole, Alacritty, foot, plain console | truecolor / 16 | dev + immediate gate |
| Linux | inside tmux/screen, over SSH | varies | conservative caps |
| macOS | Terminal.app (256), iTerm2 (truecolor) | 256 / truecolor | separate milestone |
| Windows | Windows Terminal, VS Code terminal | truecolor | VT mode; separate milestone |

### Test tooling
| Tier | Tool | Runs in CI? |
|------|------|-------------|
| 1 unit | `node:test` | yes (all cells) |
| 2 golden | `@xterm/headless` | yes |
| 3 PTY | `node-pty` (dev dep) | yes (headless parts) |
| 4 matrix | RD-03 probe | manual + `--auto` in CI |

---

## Integration Points

### With every RD
- Each RD's acceptance criteria are realized as tests across the tiers; spec tests derive from the acceptance criteria, not the implementation.

### With RD-03 / RD-10
- The probe feeds Tier 4; the perf benchmarks enforce RD-10's budget.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Test tiers | unit-only / 4 tiers | 4 tiers | Cover pure logic + real terminal behavior | AR-23 |
| macOS/Windows | manual-only / CI matrix + manual | CI matrix + manual spot-checks | Cross-platform MUST, verified | AR-4, AR-23 |
| Gate basis | feature checklist / kbd+mouse+scroll on mainstream | The latter | User's explicit stop line | AR-7 |

---

## Security Considerations

- **Data sensitivity**: test fixtures must contain **no real secrets**; the no-secret-logging test asserts redaction.
- **Input validation**: the fuzz/corpus tests are themselves the validation of RD-06/RD-02 bounded parsing.
- **Authentication & authorization**: N/A.
- **Injection risks**: the sanitizer security tests are mandatory here.
- **Encryption needs**: N/A.
- **Rate limiting**: paste-cap/DoS tests live here.
- **Infrastructure**: CI runs headless; PTY tests must clean up child processes.

---

## Acceptance Criteria — Project Go/No-Go Gate

> **These criteria decide whether the project proceeds past the foundation. If items 3, 4, or 5 cannot be met on the mainstream matrix, the project HALTS (per AR-7).**

1. [ ] **Correct colors**: on each matrix terminal, rendered colors match the detected depth (no garbled SSH/Terminal.app output) — verified by the probe's swatch confirmation + golden tests per profile.
2. [ ] **Flicker-free + correct partial updates**: a full repaint and a single-cell update both render correctly; diff output bytes are proportional to changed cells (Tier 2 + perf bench).
3. [ ] **Keyboard**: printable, arrows, Home/End, PgUp/PgDn, F1–F12, and Ctrl/Alt/Shift combinations decode correctly on every matrix terminal (corpus + manual readout).
4. [ ] **Mouse**: click, drag, release decode with correct coordinates including beyond column 223 on every matrix terminal.
5. [ ] **Scroll**: wheel up/down events are delivered on every matrix terminal.
6. [ ] **Resize**: a terminal resize yields a correct `ResizeEvent` and a corruption-free repaint on Linux, macOS, and Windows.
7. [ ] **Paste**: a bracketed paste arrives as a single `PasteEvent`, not keystrokes; an over-cap paste truncates safely.
8. [ ] **Clean teardown**: alt-screen/mouse/cursor/wrap are restored on normal exit, Ctrl-C, SIGTERM, SIGHUP, crash, and (POSIX) Ctrl-Z/resume — verified by PTY capture.
9. [ ] **Cross-platform**: the CI matrix (ubuntu/macos/windows × Node 18/20/22) is green for Tiers 1–2 and headless Tier 3; the probe runs in `--auto` on all three.
10. [ ] **Security**: sanitizer, paste-cap DoS, essentials-gate, no-secret-logging, and malformed-query-response tests all pass.
11. [ ] Boundary/negative: a non-TTY run degrades without raw mode; a never-responding terminal completes detection via fallback within the timeout; an adversarial input fuzz run causes no crash.
