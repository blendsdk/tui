/**
 * Shared view-spine types (RD-03). The `View` state flags, the named-theme-role key type, the
 * stateless clipped paint facade (`DrawContext`, implemented in Phase 3), and the render-root
 * options (consumed by the Phase-5 render root). Internal class wiring lives with the classes
 * (`view.ts`) to avoid a type cycle (RT-1).
 */
import type { Style, Theme, CapabilityProfile, Logger, InputEvent } from '@jsvision/core';
import type { Size2D } from '../layout/index.js';
import type { Point } from './geometry.js';
// Type-only (erased at runtime) — `DispatchEvent.focusView` targets a `View`. A type-only cycle with
// `view.ts` (which imports the contract types here) is safe; no runtime import edge is created.
import type { View } from './view.js';

/**
 * View state flags drawn-against in RD-03. `focused`/`disabled` are driven by RD-04 (the event
 * loop); RD-03 only reads them to pick a theme role (e.g. `buttonFocused`). `visible:false` is
 * `display:none` — the view is skipped in draw and omitted from the layout tree (AR-41).
 */
export interface ViewState {
  visible: boolean;
  disabled: boolean;
  focused: boolean;
}

/**
 * A resolvable named theme role — the keys of core's `Theme` (RD-03-owned; core exports no such
 * type, AR-45). e.g. `'window'`, `'button'`, `'buttonFocused'`.
 */
export type ThemeRoleName = keyof Theme;

/**
 * The stateless, view-local, auto-clipped paint API handed to `View.draw(ctx)` (AR-39).
 * Coordinates are view-local (origin = the view's top-left); the implementation offsets to the
 * view's absolute position and clips to the view's rect ∩ ancestor rects, silently dropping
 * out-of-clip writes. Implemented in Phase 3 (`draw-context.ts`).
 */
export interface DrawContext {
  text(x: number, y: number, str: string, style?: Style): void;
  fillRect(x: number, y: number, w: number, h: number, char: string, style?: Style): void;
  /** Fill the whole view rect. */
  fill(char: string, style?: Style): void;
  box(x: number, y: number, w: number, h: number, style?: Style, title?: string): void;
  shadow(x: number, y: number, w: number, h: number, style?: Style): void;
  /** Resolve a named theme role → `Style` (AR-35). */
  color(role: ThemeRoleName): Style;
  /**
   * Resolve a named theme role → the **raw** `Theme[K]` role, including its role-only extras (the
   * desktop `pattern` glyph, the window `border`/`title` colors) that {@link color} drops. Used by
   * the RD-05 chrome (`Desktop.draw`, `drawFrame`); the generic `K` keeps `role('window').border`
   * type-safe with no cast. (RD-05 PA-16)
   */
  role<K extends ThemeRoleName>(name: K): Theme[K];
  /** The view's content size, in cells. */
  readonly size: Size2D;
}

/**
 * Options for the render root (consumed in Phase 5). `caps` is required by core's `serialize()`
 * for depth-aware encoding (AR-44); the scheduler and logger are injectable for deterministic
 * frames (AR-32) and draw-error-log assertions (AR-42).
 */
export interface RenderRootOptions {
  /** REQUIRED — depth-aware encoding for `serialize()` (AR-44, PF-002). */
  caps: CapabilityProfile;
  /** Active theme; defaults to core's `defaultTheme` (AR-35). */
  theme?: Theme;
  /** Flush scheduler; defaults to `queueMicrotask` (AR-32). */
  schedule?: (flush: () => void) => void;
  /** Draw-error logger; defaults to a disabled `createLogger()` (AR-42). */
  logger?: Logger;
}

// --- RD-04 event-handler contract types ---------------------------------------------------------
// Declared here (alongside `View`) — NOT in `event/` — so `View.onEvent` can reference the dispatch
// envelope without a `view/`→`event/` import cycle (PA-8). The `event/` module imports these and
// re-exports them, so both `view/index.ts` and `event/index.ts` expose them through `@jsvision/ui`.

/** A typed command raised within the app, routed through the 3-phase machine (AR-52). */
export interface CommandEvent {
  /** Discriminant tag. */
  readonly type: 'command';
  /** Opaque command name compared by equality, e.g. `'ok'` | `'cancel'` | `'quit'`. */
  readonly command: string;
  /** Optional payload carried with the command. */
  readonly arg?: unknown;
}

/** Any event the loop dispatches: a decoded core input event or an internal command. */
export type AppEvent = InputEvent | CommandEvent;

/**
 * The envelope the loop wraps each event in before 3-phase routing; this — not the readonly core
 * `InputEvent` — is what `View.onEvent(ev)` receives, keeping core's event model pure (AR-60).
 */
export interface DispatchEvent {
  /** The wrapped decoded input event or internal command. */
  readonly event: AppEvent;
  /** Set `true` by a handler to halt propagation through the remaining phases/views (AR-51). */
  handled: boolean;
  /** Mouse/wheel coordinates translated to view-local cells (AR-50, AR-63); absent for keys/commands. */
  readonly local?: Point;
  /**
   * Raise a typed command onto the current dispatch tick (RD-06 PA-1). Present when a `RouteContext`
   * is active (always, during real dispatch); `undefined` only in bare unit-constructed envelopes, so
   * controls call it optional-chained (`ev.emit?.(…)`).
   */
  readonly emit?: (command: string, arg?: unknown) => void;
  /**
   * Focus another view (RD-06 PA-10) — used by `Label` to focus its link. Same source/availability
   * as {@link emit}; a non-focusable target is a no-op (the focus manager guards it).
   */
  readonly focusView?: (view: View) => void;
}
