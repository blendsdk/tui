/**
 * Public entry point of the RD-07 host subsystem.
 *
 * Re-exports the host's public API so the SDK's top-level `src/engine/index.ts`
 * can surface it: the {@link createHost} factory, the additive
 * {@link detectTty} pre-start TTY probe (PF-001), and the public type surface
 * ({@link Host}, {@link HostOptions}, {@link ResizeEvent}, {@link RuntimeAdapter},
 * {@link HostSignal}, {@link TimerHandle}). The modes/signals/platform/restore
 * modules — and the rest of `streams` — are internal and not re-exported.
 *
 * The `.js` extension in the import specifiers is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
export { createHost } from './host.js';
export { detectTty } from './streams.js';
export { createTerminalQuery } from './terminal-query.js';
export type { StreamOptions } from './streams.js';
export type { TerminalQueryOptions, ManagedTerminalQuery } from './terminal-query.js';
export type { Host, HostOptions, ResizeEvent, RuntimeAdapter, HostSignal, TimerHandle } from './types.js';
