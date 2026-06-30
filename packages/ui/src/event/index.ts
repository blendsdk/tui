/**
 * Event loop (RD-04) — public barrel.
 *
 * The host-agnostic dispatch mechanism on the RD-03 view spine: `createEventLoop` builds and owns a
 * `RenderRoot`, routes decoded input + internal commands through a 3-phase machine with focus,
 * mouse hit-test, and modality, driving exactly one coalesced frame per tick. Re-exported through
 * the single `@jsvision/ui` entry point.
 *
 * The event-handler contract types (`CommandEvent`/`AppEvent`/`DispatchEvent`) are declared in
 * `../view/types.ts` (PA-8) and re-exported here so `@jsvision/ui` exposes them as RD-04 symbols.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
export { createEventLoop } from './event-loop.js';
export type { EventLoop, EventLoopOptions } from './types.js';
export type { CommandEvent, AppEvent, DispatchEvent } from '../view/index.js';
