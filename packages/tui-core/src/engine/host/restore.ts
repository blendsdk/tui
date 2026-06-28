/**
 * Idempotent guaranteed/panic restore (RD-07, plan doc 03-03).
 *
 * `createRestore()` builds a restore closure that returns the terminal to cooked
 * mode with the leave-mode sequence written, runnable from every termination
 * path, and installs the synchronous `process.on('exit')` backstop so a crash
 * that bypassed `stop()` still restores (AR-17). A single `done` guard ensures
 * the body runs **at most once** even if a signal handler and the `'exit'`
 * backstop both fire. Suspend/resume deliberately do **not** route through this
 * guard (RT-3) — they manage modes directly so a later real exit still restores.
 *
 * Every write is best-effort: a secondary failure (e.g. the output is already
 * gone on EPIPE) is swallowed so restore never throws (AR-16).
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import { leaveMode } from './modes.js';
import type { CapabilityProfile } from '../capability/profile.js';
import type { RuntimeAdapter } from './types.js';

/** Inputs the restore closure needs. `leaveStr` is precomputed so the `'exit'` path allocates nothing. */
export interface RestoreContext {
  readonly adapter: RuntimeAdapter;
  readonly output: NodeJS.WriteStream;
  readonly input: NodeJS.ReadStream;
  readonly caps: CapabilityProfile;
  /** Focus host-policy toggle threaded into the leave sequence (PF-006). */
  readonly focus?: boolean;
  /** Whether the terminal was actually entered; a non-TTY host has nothing to restore (AR-11). */
  readonly isTTY: boolean;
}

/** The idempotent restore handle returned by {@link createRestore}. */
export interface GuaranteedRestore {
  /**
   * Restore the terminal exactly once. `sync` selects the write channel: `false`
   * (default) uses async `output.write` (loop running); `true` uses
   * `adapter.writeSync(output.fd, …)` for the draining `'exit'` backstop (PF-004).
   */
  run(sync?: boolean): void;
  /** Remove the process-level `'exit'` backstop (called by `stop()`, RT-2). */
  teardown(): void;
}

/** Read a stream's file descriptor, defaulting to stdout's fd 1 (not on the WriteStream type). */
function outputFd(output: NodeJS.WriteStream): number {
  const fd = (output as { fd?: number }).fd;
  return typeof fd === 'number' ? fd : 1;
}

/** Run a restore step, swallowing any secondary failure — restore must never throw (AR-16). */
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    /* best-effort: the terminal may already be gone */
  }
}

/**
 * Build an idempotent restore closure and install the panic backstop. [AR-17]
 *
 * @param ctx - the adapter, bound streams, caps, focus policy, and TTY flag.
 * @returns a {@link GuaranteedRestore} whose `run()` is safe to call repeatedly.
 */
export function createRestore(ctx: RestoreContext): GuaranteedRestore {
  const leaveStr = leaveMode(ctx.caps, { focus: ctx.focus });
  let done = false;

  function run(sync = false): void {
    if (done) return;
    done = true;
    if (!ctx.isTTY) return; // nothing was entered → nothing to restore (AR-11)
    if (sync) {
      safely(() => ctx.adapter.writeSync(outputFd(ctx.output), leaveStr));
    } else {
      safely(() => ctx.output.write(leaveStr));
    }
    safely(() => ctx.adapter.setRawMode(ctx.input, false));
  }

  // Register the synchronous last-resort restore immediately (AR-17).
  const unsubExit = ctx.adapter.onProcessExit(() => run(true));

  return {
    run,
    teardown(): void {
      unsubExit();
    },
  };
}
