# RD-07 Host & Lifecycle — Implementation Plan

> **Feature**: The native `tty` host that owns the terminal — raw mode, alternate screen, mode setup/teardown, signals, stream binding, and guaranteed restoration on every exit path. Wires RD-02 caps + RD-06 decoder + RD-04 renderer into a running application loop.
> **Status**: Planning Complete
> **Created**: 2026-06-27
> **Implements**: RD-07
> **CodeOps Skills Version**: 2.0.0

## Overview

RD-07 is the layer that makes the SDK an *application runtime* rather than a set of pure
functions. It owns the real terminal: it puts stdin in raw mode, enters the alternate screen,
enables the mouse / bracketed-paste / focus / keyboard-protocol modes the detected `caps` allow,
pumps stdin bytes through RD-06's `decode()`, hands RD-04's `serialize()` output to the output
stream as a single coalesced write, and — above all — **guarantees the terminal is restored on
every exit path**: normal `stop()`, `SIGINT`/`SIGTERM`/`SIGHUP`, suspend/resume, uncaught
exceptions, and a synchronous crash during setup.

The host abstracts the real per-platform differences behind one injectable **runtime adapter**:
POSIX uses `SIGWINCH` for resize and `SIGTSTP`/`SIGCONT` for suspend/resume, while Windows (which
has none of those signals) uses the `stdout 'resize'` event, `SIGBREAK`, and VT-processing
enablement. The adapter doubles as the testing seam — tests inject a fake that records exit codes
and captures ANSI in-process, backed by a thin subprocess e2e that proves the real signal→exit
wiring.

The public surface is a single factory: `createHost(options): Host`. The returned `Host` exposes
`start()`, `stop()`, `render(buffer)`, and `isTTY`, and delivers input/resize/suspend/resume
through typed callbacks. Input *decoding* (RD-06) and frame *composition* (RD-04) are wired, not
re-implemented; the essentials *policy* (which caps are required) belongs to RD-08 — the host only
provides the facts (`isTTY`, resolved caps, a guaranteed-restore primitive).

## Document Index

| #   | Document                                                   | Description                                   |
| --- | ---------------------------------------------------------- | --------------------------------------------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md)             | Zero-Ambiguity Gate decisions (audit trail)   |
| 00  | [Index](00-index.md)                                       | This document — overview and navigation       |
| 01  | [Requirements](01-requirements.md)                         | Feature requirements and scope                |
| 02  | [Current State](02-current-state.md)                       | Integration surfaces the host consumes        |
| 03-01 | [Public API & Orchestrator](03-01-public-api-and-orchestrator.md) | `types.ts` + `host.ts` — createHost, lifecycle, dispatch, render |
| 03-02 | [Modes, Signals & Platform](03-02-modes-signals-platform.md) | `modes.ts` + `signals.ts` + `platform.ts` — sequences, signal matrix, per-OS adapter |
| 03-03 | [Streams & Restore](03-03-streams-and-restore.md)        | `streams.ts` + `restore.ts` — binding, isTTY, /dev/tty, EPIPE, guaranteed/panic restore |
| 07  | [Testing Strategy](07-testing-strategy.md)                 | Specification test cases (ST-*) and verification |
| 99  | [Execution Plan](99-execution-plan.md)                     | Phases, sessions, and task checklist          |

## Quick Reference

### Usage Example

```ts
import {
  createHost,
  resolveCapabilities,
  ScreenBuffer,
  createKeymap,
} from '@blendsdk/tui';

const { profile: caps } = resolveCapabilities();
const keymap = createKeymap({ 'ctrl+c': 'quit' });

const host = createHost({
  caps,
  onInput: (e) => {
    if (e.type === 'key' && keymap.lookup(e) === 'quit') void host.stop();
  },
  onResize: ({ columns, rows }) => draw(columns, rows),
  onResume: () => draw(process.stdout.columns ?? 80, process.stdout.rows ?? 24),
});

await host.start();           // raw mode, alt-screen, modes per caps
function draw(cols: number, rows: number): void {
  const frame = new ScreenBuffer(cols, rows, { fg: 'default', bg: 'default' });
  frame.text(2, 1, 'Hello — Ctrl-C to quit', { fg: '#c0c0c0', bg: 'default' });
  host.render(frame);         // serialize(diff) → single coalesced write
}
draw(process.stdout.columns ?? 80, process.stdout.rows ?? 24);
// SIGINT/SIGTERM/SIGHUP/throw → terminal restored, process exits with the right code.
```

### Key Decisions

| Decision               | Outcome                                                                       | AR |
| ---------------------- | ----------------------------------------------------------------------------- | -- |
| Public API             | `createHost(options): Host` factory                                           | AR-1 |
| Event delivery         | Typed callbacks (`onInput`/`onResize`/`onSuspend`/`onResume`)                  | AR-2 |
| Draw API               | `host.render(buffer)` owns prev + serialize + write                           | AR-3 |
| Windows                | Implemented now; acceptance deferred-to-Windows-runner                        | AR-4 |
| File layout            | 8-file split under `src/engine/host/`                                          | AR-5 |
| Exit ownership         | Host restores+exits on signal/crash paths; `exitOnSignal` opt-out + hook      | AR-6 |
| ResizeEvent            | Host-owned type in `host/types.ts`                                            | AR-7 |
| start/stop             | `Promise<void>`, idempotent; stop() restores, never exits                     | AR-8 |
| Resize coalescing      | pending-flag + single `setImmediate`                                          | AR-9 |
| Suspend/resume         | auto full repaint + `onResume()`; SIGTSTP→restore→re-raise SIGSTOP            | AR-10 |
| Non-TTY                | skip mode setup, still write frames; expose `isTTY`                           | AR-11 |
| Panic restore          | one idempotent restore via signals + uncaught + unhandled + `exit` backstop   | AR-17 |
| Testing                | injectable runtime adapter + real objects + thin subprocess e2e (no node-pty) | AR-13 |
| ESC timer              | host-owned 50ms `flush()` timer via injectable timer source                   | AR-14 |
| Keymap                 | out of host scope (app applies `createKeymap`)                                | AR-15 |
| EPIPE                  | best-effort restore → clean shutdown exit 0                                   | AR-16 |
| Focus reporting        | host policy via `HostOptions.focus` (default on; no capability models it)     | PF-006 |
| Adapter additions      | `suspendSelf`/`onUncaughtException`/`onUnhandledRejection`/`writeSync`/`writeError`; `realRuntime(output)` + pure `hostSignalSource` | PF-001/002/004/005/010 |

## Related Files

**Created** (`src/engine/host/`): `types.ts`, `host.ts`, `modes.ts`, `signals.ts`, `streams.ts`,
`platform.ts`, `restore.ts`, `index.ts`.
**Modified**: `src/engine/index.ts` (re-export the host public API), `README.md` (Host section).
`CLAUDE.md` (Overview + structure) and `plans/00-roadmap.md` (RD-07 → ✅ Implemented) are updated by
exec_plan's post-completion hooks, **not** plan tasks. **[PF-009]**
**Tests** (`test/`): `host-modes.spec.test.ts`, `host.spec.test.ts`, `host-lifecycle.spec.test.ts`,
`host-security.spec.test.ts`, `host.impl.test.ts`, `host-platform.impl.test.ts`,
`host-signals.e2e.test.ts` (explicit).
