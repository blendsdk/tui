/**
 * `createEventLoop` — the host-agnostic dispatch mechanism (RD-04, AR-47/AR-49/AR-54/AR-61).
 *
 * The loop **builds and owns** a `RenderRoot`, constructing it with a **deferring** `schedule` seam
 * so the root never self-flushes; the loop drives `renderRoot.flush()` itself exactly once per
 * dispatch tick (AR-61/AR-64). Every public mutator that can change focus/command/modal state and
 * the buffer routes through the single internal `runTick`, so each produces exactly one coalesced
 * frame (PA-11): do work → drain the cascade queue → `onIdle?.()` → one `flush()`. A re-entrant call
 * (e.g. `emitCommand` from inside a handler) joins the active tick rather than starting a new one.
 *
 * The full 3-phase router (`dispatch.ts`), command registry (`commands.ts`), and focus manager
 * (`focus.ts`) are wired in below; the mouse hit-test (Phase 4) and modal stack (Phase 5) plug into
 * the marked seams.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { createLogger } from '@jsvision/core';
import type { Logger, Keymap } from '@jsvision/core';
import type { Size2D } from '../layout/index.js';
import { createRenderRoot } from '../view/index.js';
import type { View, RenderRoot, AppEvent, DispatchEvent } from '../view/index.js';
import type { EventLoop, EventLoopOptions } from './types.js';
import { createCommandRegistry } from './commands.js';
import type { CommandRegistry } from './commands.js';
import { route } from './dispatch.js';
import type { RouteContext } from './dispatch.js';
import { createFocusManager } from './focus.js';
import type { FocusManager } from './focus.js';
import { hitTestRoute } from './hit-test.js';
import { createModalManager } from './modal.js';
import type { ModalManager } from './modal.js';

/** Concrete event loop. Builds + owns the render root; drives one coalesced frame per tick. */
class EventLoopImpl implements EventLoop {
  readonly renderRoot: RenderRoot;
  private readonly logger: Logger;
  private readonly onIdle?: () => void;
  private readonly keymap?: Keymap;
  private readonly registry: CommandRegistry;
  private readonly focus: FocusManager;
  private readonly modal: ModalManager;

  /** The mounted root view, for focus/hit-test walks; `null` until `mount`. */
  private root: View | null = null;
  /** The tick's cascade queue: events (and the commands they raise) drained in one tick (AR-64). */
  private readonly queue: DispatchEvent[] = [];
  /** True while a tick is draining; a re-entrant `runTick` joins the active tick instead (PA-11). */
  private draining = false;

  constructor(viewport: Size2D, opts: EventLoopOptions) {
    this.logger = opts.logger ?? createLogger();
    this.onIdle = opts.onIdle;
    this.keymap = opts.keymap;
    this.registry = createCommandRegistry({
      seed: opts.commands,
      enqueue: (ev) => this.queue.push(ev), // a command cascades onto the active tick (03-01)
    });
    this.focus = createFocusManager(() => this.root);
    this.modal = createModalManager(this.focus);
    // Build the render root with a DEFERRING schedule: the callback is dropped, so the root never
    // self-flushes; the loop owns frame timing and calls `renderRoot.flush()` once per tick (AR-61).
    this.renderRoot = createRenderRoot(viewport, {
      caps: opts.caps,
      theme: opts.theme,
      logger: this.logger,
      schedule: () => {
        // deferring seam — intentionally drops the flush callback (the loop drives flush itself)
      },
    });
  }

  mount(root: View): void {
    this.root = root;
    this.renderRoot.mount(root); // RenderRoot.mount flushes the initial frame once, internally
  }

  dispatch(event: AppEvent): void {
    this.runTick(() => {
      this.queue.push({ event, handled: false });
    });
  }

  resize(size: Size2D): void {
    // The one path outside the queue: a reflow with no event cascade, then exactly one frame (AR-54).
    this.renderRoot.resize(size);
    this.renderRoot.flush();
  }

  getFocused(): View | null {
    return this.focus.getFocused();
  }

  focusNext(): void {
    // Standalone traversal owns a tick so the focus-flip repaint paints exactly one frame (PA-11).
    this.runTick(() => this.focus.focusNext());
  }

  focusPrev(): void {
    this.runTick(() => this.focus.focusPrev());
  }

  focusView(view: View): void {
    this.runTick(() => this.focus.focusView(view));
  }

  emitCommand(command: string, arg?: unknown): void {
    // Route through runTick so a standalone emitCommand drains its cascade + paints once (PA-11);
    // a re-entrant emit (from inside a handler) joins the active tick.
    this.runTick(() => this.registry.emit(command, arg));
  }

  enableCommand(command: string, on: boolean): void {
    this.registry.enable(command, on); // toggling enablement changes no visual state — no tick
  }

  isCommandEnabled(command: string): boolean {
    return this.registry.isEnabled(command);
  }

  execView<R>(view: View): Promise<R> {
    // Open inside a runTick so the modal paints exactly one coalesced frame on open (PA-11/PF-009);
    // the returned Promise resolves later, on endModal. The caller has added `view` to the tree.
    return new Promise<R>((resolve) => {
      this.runTick(() => this.modal.begin(view, resolve));
    });
  }

  endModal<R>(result: R): void {
    // Close inside a runTick so the restore-focus repaint paints one frame (PA-11).
    this.runTick(() => this.modal.end(result));
  }

  /**
   * Run one coalesced tick: do `work` (enqueue an event or mutate focus/command/modal state), drain
   * the cascade queue, fire `onIdle`, then flush exactly one frame. A re-entrant call (while already
   * draining) just contributes its `work` to the active tick and returns (PA-11). The `draining`
   * flag is reset in a `finally` so a throw can never wedge the loop.
   *
   * @param work A thunk that enqueues an event or performs a focus/command/modal mutation.
   */
  private runTick(work: () => void): void {
    if (this.draining) {
      work(); // join the active tick; the owner drains + flushes
      return;
    }
    this.draining = true;
    try {
      work();
      while (this.queue.length > 0) {
        const ev = this.queue.shift();
        if (ev !== undefined) this.route(ev);
      }
    } finally {
      this.draining = false;
    }
    this.onIdle?.(); // the cascade drained (AR-58)
    this.renderRoot.flush(); // exactly one coalesced frame for the tick (AR-54, AR-64)
  }

  /**
   * Route one dispatch envelope through the full 3-phase machine (`dispatch.ts`): keymap consume →
   * built-in Tab → mouse/wheel hit-test → pre/focus/post sweeps with `handled` short-circuit.
   *
   * @param ev The dispatch envelope to route.
   */
  private route(ev: DispatchEvent): void {
    route(ev, this.routeContext());
  }

  /**
   * The dispatch/hit-test scope: the top modal subtree when a modal is active (capture, AR-53), else
   * the mounted root. Confining all phases to this subtree — including the Phase-2 focused-chain
   * bubble clamp (PA-12) — keeps the outer tree inert while a modal is open.
   */
  private scopeRoot(): View | null {
    return this.modal.isActive() ? this.modal.topView() : this.root;
  }

  /** Build the {@link RouteContext} of seams the 3-phase router needs from this loop. */
  private routeContext(): RouteContext {
    const scope = this.scopeRoot();
    return {
      scopeRoot: scope,
      keymap: this.keymap,
      focusedLeaf: this.focus.focusedLeafIn(scope),
      emitCommand: (name, arg) => this.registry.emit(name, arg),
      deliver: (view, ev) => this.deliver(view, ev),
      // The built-in Tab handler runs inside the active dispatch tick, so it calls the focus
      // manager's pure mutation directly (no nested runTick) — the tick's flush paints (PA-11).
      focusNext: () => this.focus.focusNext(),
      focusPrev: () => this.focus.focusPrev(),
      hitTestRoute: (ev) =>
        hitTestRoute(ev, {
          scopeRoot: scope,
          isFocusable: (view) => this.focus.isFocusable(view),
          focusView: (view) => this.focus.focusView(view), // pure mutation (inside the active tick)
          deliver: (view, mouseEv) => this.deliver(view, mouseEv),
        }),
    };
  }

  /**
   * Deliver an envelope to a view's `onEvent`, isolating a throwing handler: the error is logged via
   * the injected logger and the loop continues to the next phase/event (AR-66).
   *
   * @param view The target view.
   * @param ev   The dispatch envelope.
   */
  private deliver(view: View, ev: DispatchEvent): void {
    try {
      view.onEvent(ev);
    } catch (error) {
      this.logger.error('event', 'onEvent() threw', { error: String(error) });
    }
  }
}

/**
 * Create a host-agnostic {@link EventLoop} over a `viewport`-cell render root.
 *
 * @param viewport The initial viewport size in cells.
 * @param opts     Required `caps` + optional `theme`/`logger`/`keymap`/`commands`/`onIdle` seams.
 * @returns An `EventLoop` ready to `mount` a view tree and be driven via `dispatch`.
 */
export function createEventLoop(viewport: Size2D, opts: EventLoopOptions): EventLoop {
  return new EventLoopImpl(viewport, opts);
}
