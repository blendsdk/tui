/**
 * Signal install/teardown, resize coalescing, suspend/resume (RD-07, plan doc 03-02).
 *
 * Pure orchestration over the injected {@link RuntimeAdapter} (`adapter.on(...)`
 * returns an unsubscribe). `installSignals()` wires:
 * - **resize** — pending-flag + one `scheduleImmediate` collapses a SIGWINCH
 *   burst to a single {@link ResizeEvent} (AR-9);
 * - **interrupt/terminate/hangup** — guaranteed restore then exit 130/143/129 (AR-6);
 * - **suspend** — `onSuspend` then a *soft* leave (leave-mode + raw off) then
 *   `suspendSelf()` (RT-3, PF-001); the guarded panic restore is left untouched
 *   so a later real exit still restores;
 * - **continue** — re-assert enter-mode, full repaint of the last buffer, `onResume` (AR-10).
 *
 * On Windows the adapter never emits `suspend`/`continue`, so those handlers are
 * inert and the same code runs unchanged (AR-4).
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import { serialize } from '../render/serialize.js';
import type { CapabilityProfile } from '../capability/profile.js';
import type { ScreenBuffer } from '../render/buffer.js';
import type { GuaranteedRestore } from './restore.js';
import type { ResizeEvent, RuntimeAdapter } from './types.js';

/** Inputs the signal handlers need; orchestrated by `host.ts` so all share one restore. */
export interface SignalContext {
  readonly adapter: RuntimeAdapter;
  readonly output: NodeJS.WriteStream;
  readonly input: NodeJS.ReadStream;
  readonly caps: CapabilityProfile;
  /** The one idempotent restore used by the terminating-signal paths (AR-17). */
  readonly restore: GuaranteedRestore;
  /** Enter-mode string re-asserted on resume (AR-10). */
  readonly enterStr: string;
  /** Leave-mode string written on the suspend soft-leave (RT-3). */
  readonly leaveStr: string;
  /** Whether the terminal is a TTY; gates mode writes + raw toggles (AR-11). */
  readonly isTTY: boolean;
  readonly onResize?: (event: ResizeEvent) => void;
  readonly onSuspend?: () => void;
  readonly onResume?: () => void;
  /** When false, terminating signals restore but do not exit (AR-6). */
  readonly exitOnSignal: boolean;
  readonly onBeforeExit?: (code: number) => void;
  /** The last rendered buffer, for the resume full repaint (AR-10). */
  getLastBuffer(): ScreenBuffer | null;
}

/** Exit codes for the terminating signals (128 + signal number). [AR-6] */
const EXIT_CODES = { interrupt: 130, terminate: 143, hangup: 129 } as const;

/** Run a handler step, swallowing any failure — a signal handler must never throw. */
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    /* best-effort: never throw out of a signal handler */
  }
}

/**
 * Install resize/signal/suspend/resume handlers over the adapter.
 *
 * @param ctx - the adapter, bound streams, shared restore, mode strings, and callbacks.
 * @returns a teardown that removes every handler installed here. [AR-8]
 */
export function installSignals(ctx: SignalContext): () => void {
  const unsubscribes: (() => void)[] = [];

  // resize — collapse a burst to a single coalesced event (AR-9).
  let resizePending = false;
  unsubscribes.push(
    ctx.adapter.on('resize', () => {
      if (resizePending) return;
      resizePending = true;
      ctx.adapter.scheduleImmediate(() => {
        resizePending = false;
        const columns = ctx.output.columns ?? 80;
        const rows = ctx.output.rows ?? 24;
        ctx.onResize?.({ type: 'resize', columns, rows });
      });
    }),
  );

  // interrupt/terminate/hangup — restore then exit with the right code (AR-6).
  for (const signal of ['interrupt', 'terminate', 'hangup'] as const) {
    const code = EXIT_CODES[signal];
    unsubscribes.push(
      ctx.adapter.on(signal, () => {
        ctx.restore.run();
        ctx.onBeforeExit?.(code);
        if (ctx.exitOnSignal) ctx.adapter.exit(code);
      }),
    );
  }

  // suspend — soft leave (RT-3) then stop the process (PF-001); inert on win32.
  unsubscribes.push(
    ctx.adapter.on('suspend', () => {
      ctx.onSuspend?.();
      if (ctx.isTTY) {
        safely(() => ctx.output.write(ctx.leaveStr));
        safely(() => ctx.adapter.setRawMode(ctx.input, false));
      }
      ctx.adapter.suspendSelf();
    }),
  );

  // continue — re-assert modes + full repaint, then notify (AR-10).
  unsubscribes.push(
    ctx.adapter.on('continue', () => {
      if (ctx.isTTY) {
        safely(() => ctx.adapter.setRawMode(ctx.input, true));
        safely(() => ctx.output.write(ctx.enterStr));
        const last = ctx.getLastBuffer();
        if (last) {
          const out = serialize(last, null, { caps: ctx.caps });
          if (out) safely(() => ctx.output.write(out));
        }
      }
      ctx.onResume?.();
    }),
  );

  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
