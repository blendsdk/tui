/**
 * Event-loop public types (RD-04). The `EventLoop` facade and its construction `EventLoopOptions`.
 *
 * The event-handler **contract types** (`CommandEvent`/`AppEvent`/`DispatchEvent`) are declared in
 * `../view/types.ts` (PA-8 — alongside `View`, to avoid a `view/`→`event/` import cycle) and
 * re-exported through this module's barrel (`event/index.ts`), so `@jsvision/ui` exposes them as
 * RD-04 symbols.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import type { CapabilityProfile, Theme, Logger, Keymap } from '@jsvision/core';
import type { Size2D } from '../layout/index.js';
import type { View, RenderRoot, AppEvent } from '../view/index.js';

/** Construction options for {@link EventLoop}. `caps` is required; the rest are optional seams. */
export interface EventLoopOptions {
  /** REQUIRED — depth-aware encoding, built into the loop's `RenderRoot` (AR-44, AR-61). */
  caps: CapabilityProfile;
  /** Active theme forwarded to the `RenderRoot`; defaults to core's `defaultTheme` (AR-35). */
  theme?: Theme;
  /** Logger for `onEvent()` (and `draw()`) errors; defaults to a disabled logger (AR-66). */
  logger?: Logger;
  /** Core `createKeymap` result: bound chords convert to commands (consume, AR-62, PA-1). */
  keymap?: Keymap;
  /** Upfront command hint; an unlisted command is still enabled by default (PA-3). */
  commands?: Iterable<string>;
  /** Fires once when a dispatch tick's cascade queue drains (AR-58). */
  onIdle?: () => void;
}

/**
 * The host-agnostic dispatch mechanism (AR-47). It builds and owns a `RenderRoot`, routes events
 * through the 3-phase machine, manages focus/commands/modality, and drives exactly one coalesced
 * frame per tick. Real host/`run()` wiring is RD-05; RD-04 is driven purely via `dispatch()`.
 */
export interface EventLoop {
  /** The loop-built render root (host integration + tests, AR-61). */
  readonly renderRoot: RenderRoot;
  /** Mount a view tree into the loop's render root. */
  mount(root: View): void;
  /** The single pure input entry: wrap `event` in a `DispatchEvent` and route it 3-phase (AR-49). */
  dispatch(event: AppEvent): void;
  /** Resize the viewport: reflow + exactly one frame (AR-54). */
  resize(size: Size2D): void;
  /** Advance focus to the next focusable view in traversal order (wrap, AR-57). */
  focusNext(): void;
  /** Move focus to the previous focusable view in traversal order (wrap, AR-57). */
  focusPrev(): void;
  /** Focus exactly `view`; a no-op if `view` is non-focusable (PA-5). */
  focusView(view: View): void;
  /** The current globally-focused view (root→leaf `current` chain), or `null` (AR-48). */
  getFocused(): View | null;
  /** Raise a `CommandEvent` and route it through the 3-phase machine, unless disabled (AR-52, PA-3). */
  emitCommand(command: string, arg?: unknown): void;
  /** Enable/disable a command; a disabled command's `emitCommand` is dropped (PA-3). */
  enableCommand(command: string, on: boolean): void;
  /** Whether a command is currently enabled (unregistered ⇒ enabled by default, PA-3). */
  isCommandEnabled(command: string): boolean;
  /** Open `view` as a modal, capturing input to its subtree; resolves when `endModal` is called (AR-53). */
  execView<R>(view: View): Promise<R>;
  /** Close the top modal, restoring focus and resolving the matching `execView` promise (AR-53). */
  endModal<R>(result: R): void;
}
