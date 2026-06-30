/**
 * Command registry (RD-04, AR-52, PA-3). A typed command layer over the dispatch tick: `emit`
 * raises a `CommandEvent` and enqueues it onto the active tick (routed 3-phase like any event),
 * `enable`/`isEnabled` gate it. Commands are **enabled by default** — state is a single map of
 * *explicit overrides*, so an unregistered command is enabled and only an explicit `enable(name,
 * false)` drops it (PA-3). `opts.commands` seeds the map with `true` as an introspection hint;
 * absence still means enabled.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import type { CommandEvent, DispatchEvent } from '../view/index.js';

/** A typed command layer: raise + 3-phase route, gated by an enable/disable override map. */
export interface CommandRegistry {
  /** Raise a command and enqueue it onto the active tick, unless it is disabled (AR-52, PA-3). */
  emit(name: string, arg?: unknown): void;
  /** Set an explicit enable/disable override for a command (PA-3). */
  enable(name: string, on: boolean): void;
  /** Whether a command is enabled; an unregistered command is enabled by default (PA-3). */
  isEnabled(name: string): boolean;
}

/** Construction options for {@link createCommandRegistry}. */
export interface CommandRegistryOptions {
  /** Upfront command hint, seeded as enabled; absence still means enabled (PA-3). */
  seed?: Iterable<string>;
  /** Enqueue a built command envelope onto the active dispatch tick (cascade, 03-01). */
  enqueue: (ev: DispatchEvent) => void;
}

/**
 * Create a command registry backed by an explicit-override map.
 *
 * @param opts `seed` (introspection hint) + the `enqueue` seam that pushes a command envelope onto
 *             the active dispatch tick.
 * @returns A {@link CommandRegistry}.
 */
export function createCommandRegistry(opts: CommandRegistryOptions): CommandRegistry {
  const overrides = new Map<string, boolean>();
  if (opts.seed !== undefined) {
    for (const name of opts.seed) overrides.set(name, true);
  }

  const isEnabled = (name: string): boolean => {
    const override = overrides.get(name);
    return override === undefined ? true : override; // unknown ⇒ enabled by default (PA-3)
  };

  const emit = (name: string, arg?: unknown): void => {
    if (!isEnabled(name)) return; // disabled ⇒ drop before any envelope/dispatch (AR-52, PA-3)
    const command: CommandEvent =
      arg === undefined ? { type: 'command', command: name } : { type: 'command', command: name, arg };
    opts.enqueue({ event: command, handled: false });
  };

  const enable = (name: string, on: boolean): void => {
    overrides.set(name, on);
  };

  return { emit, enable, isEnabled };
}
