# Tier-3 PTY-Style Integration (no node-pty): RD-09

> **Document**: 03-03-pty-integration.md
> **Parent**: [Index](00-index.md)

## Overview

Extend the project's existing **no-node-pty** child-process harness (FR-3, AR-2) to cover
the Tier-3 assertions RD-09 requires beyond the already-proven SIGINT case: alt-screen
enter/leave, mouse enable/disable, and **full restore** on normal exit, `throw`, `SIGTERM`,
and `SIGHUP`. A real child process runs the real `createHost`; its piped stdout is captured
and asserted for the enter/leave control sequences. No pseudo-terminal, no native dep.

## Architecture

### Current Architecture
`test/host-signals.e2e.test.ts` spawns a child via `tsx`, the child advertises piped
streams as TTYs (`output.isTTY = true`, `output.columns/rows`, `input.setRawMode = () => input`),
runs `createHost`, prints `READY`, and the parent delivers a real SIGINT then asserts exit
130 + restore sequences in the captured output. `safety-error-restore.e2e.test.ts` proves
restore on a thrown error.

### Proposed Changes
A new `test/host-tier3.e2e.test.ts` reuses the same child scaffold (extracted/duplicated
minimally) and adds cases. Each case spawns a child, captures stdout, triggers one exit
path, and asserts the captured byte stream contains the expected enter sequences during
run and the expected leave/restore sequences on teardown.

## Implementation Details

### Sequences asserted (from RD-04/RD-07 contracts)

| Concern        | Enter (during run)        | Leave / restore (on teardown) |
| -------------- | ------------------------- | ----------------------------- |
| Alt-screen     | `?1049h`                  | `?1049l`                      |
| Cursor         | (hidden if applicable)    | `?25h` (cursor shown)         |
| Mouse          | mouse-enable (e.g. `?1000h`/`?1006h` per host modes) | mouse-disable (`?1000l`/`?1006l`) |

> Exact mouse mode codes are taken from the RD-07 host `modes` module at authoring time;
> the test asserts the **same** sequences the host actually advertises (read from the
> modes source, which is the contract for the host's own behavior — not from running the
> child first).

### Cases (FR-3)

| Case | Trigger | Assert |
|------|---------|--------|
| Normal exit | child calls `host.stop()` then exits 0 | leave/restore sequences present; exit code 0 |
| Throw | child throws after `start()` | restore sequences present (mapped to `safety-error-restore` pattern); non-zero exit |
| SIGTERM | parent sends `SIGTERM` | restore sequences present; terminated by signal |
| SIGHUP | parent sends `SIGHUP` | restore sequences present; terminated by signal |
| Alt-screen + mouse observable | inspect captured output during run | enter sequences (`?1049h`, mouse-enable) appeared before teardown |

SIGINT→130→restore is **not** re-implemented — it is mapped from RD-07 `host-signals.e2e`
ST-12 in the gate doc.

### Integration Points
- Spawns `tsx` running the real `src/engine/index.ts` `createHost` (same as `host-signals.e2e`).
- Lives in `test/host-tier3.e2e.test.ts` — **explicit**, outside the unit glob (AR-10); run via `npx tsx --test test/host-tier3.e2e.test.ts` and by `npm run gate`.
- Feeds gate criterion 8 (clean teardown, POSIX paths).

## Code Examples

### Child scaffold (shared shape with host-signals.e2e)
```ts
const CHILD = `
import { createHost, resolveCapabilities } from ${JSON.stringify(engineUrl)};
import { Writable } from 'node:stream';
const caps = resolveCapabilities({ env: {}, platform: process.platform, override: { altScreen: true, mouse: { sgr: true, drag: true, wheel: true } } }).profile;
const realOut = process.stdout;
const output = new Writable({ write(c,_e,cb){ realOut.write(c); cb(); } });
output.isTTY = true; output.columns = 80; output.rows = 24; output.fd = 1;
const input = process.stdin; input.isTTY = true;
if (typeof input.setRawMode !== 'function') input.setRawMode = () => input;
void (async () => { const host = createHost({ caps, input, output }); await host.start(); realOut.write('READY\\n'); })();
`;
```

## Error Handling

| Error Case                          | Handling Strategy                                            | AR Ref |
| ----------------------------------- | ----------------------------------------------------------- | ------ |
| Child process leak on failure        | `try/finally`: kill the child + `rmSync` temp dir (mirror host-signals.e2e) | AR-2 |
| Restore sequences absent in capture  | Assertion fails — indicates a real teardown regression (fix the host) | AR-8 |
| Real SIGWINCH resize delivery        | **Deferred (DEF-3)** — needs a real PTY; recorded DEFERRED in the gate doc | AR-2, AR-14 |

> **Traceability:** decisions reference `00-ambiguity-register.md`.

## Testing Requirements
- `host-tier3.e2e.test.ts`: the five cases above. (No separate spec/impl split — e2e files are a single concern per the project's existing convention; expectations derive from the RD-04/RD-07 contracts, making them spec-grade oracles.)
