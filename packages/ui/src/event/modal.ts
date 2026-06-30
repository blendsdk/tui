/**
 * Modal stack (RD-04, AR-53, PA-4). An async modal: `begin` pushes a frame, saves the outer focus,
 * and focuses into the modal subtree; `end` pops (LIFO), restores the saved focus, and resolves the
 * matching `execView` promise. While the stack is non-empty the dispatch + hit-test scope is the top
 * frame's `view` subtree, so the outer tree is inert (capture, AR-53). `endModal` is called
 * **explicitly** by app/modal handlers (PA-4) — RD-04 ships no built-in Esc/cancel wiring.
 *
 * The modal manager mutates focus through the injected focus manager (its pure mutations); the loop
 * wraps `begin`/`end` in a `runTick` so opening/closing a modal paints exactly one frame (PA-11,
 * PF-009).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import type { View } from '../view/index.js';

/** A pushed modal: the modal subtree, the outer focus to restore, and the `execView` resolver. */
interface ModalFrame {
  readonly view: View;
  readonly savedFocus: View | null;
  /** The `execView<R>` resolver, stored behind `unknown` at this heterogeneous-stack boundary. */
  readonly resolve: (result: unknown) => void;
}

/** The focus seams the modal manager needs (the focus manager's pure mutations). */
export interface ModalFocus {
  getFocused(): View | null;
  focusInto(view: View): void;
  focusView(view: View): void;
}

/** Loop-owned modal stack. `isActive()` ⇒ dispatch/hit-test confine to `topView()`. */
export interface ModalManager {
  /** Whether a modal is active (the stack is non-empty). */
  isActive(): boolean;
  /** The top modal subtree root (the dispatch/hit-test scope), or `null` when inactive. */
  topView(): View | null;
  /** Open `view` as a modal: save the outer focus, push the frame, and focus into the modal (AR-53). */
  begin<R>(view: View, resolve: (result: R) => void): void;
  /** Close the top modal (LIFO): restore the saved focus and resolve its promise; empty ⇒ no-op (AR-53). */
  end<R>(result: R): void;
}

/**
 * Create a modal manager over the injected focus seams.
 *
 * @param focus The focus manager's pure mutations (save/restore + focus-into).
 * @returns A {@link ModalManager}.
 */
export function createModalManager(focus: ModalFocus): ModalManager {
  const stack: ModalFrame[] = [];

  const isActive = (): boolean => stack.length > 0;

  const topView = (): View | null => {
    const top = stack[stack.length - 1];
    return top !== undefined ? top.view : null;
  };

  const begin = <R>(view: View, resolve: (result: R) => void): void => {
    const savedFocus = focus.getFocused();
    // Heterogeneous stack: each frame carries its own R. Erase the resolver to `unknown` here;
    // `end(result)` passes the caller-supplied result back through it (a controlled type-erasure
    // boundary, not an `as any`/`as unknown` bypass).
    stack.push({ view, savedFocus, resolve: resolve as (result: unknown) => void });
    focus.focusInto(view); // focus the modal's first focusable (or its saved current), AR-53
  };

  const end = <R>(result: R): void => {
    const frame = stack.pop();
    if (frame === undefined) return; // empty stack → no-op (AR-53)
    // Restore the outer focus; focusView is a no-op if it is no longer focusable (AR-48, PA-5).
    if (frame.savedFocus !== null) focus.focusView(frame.savedFocus);
    frame.resolve(result);
  };

  return { isActive, topView, begin, end };
}
