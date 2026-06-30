/**
 * Focus manager (RD-04, AR-48/AR-56/AR-57/AR-65). Global focus is the **root→leaf path of
 * `Group.current` pointers** (AR-48): each group names its focused child; following `current` from
 * the root yields the focused leaf. Because focus is encoded *in* the persisted `current` pointers,
 * a group that loses then regains the active path keeps its `current` — re-entry restores the
 * previous child, not the first (save/restore, AR-48/AR-53).
 *
 * The mutations here (`focusView`, `focusNext`/`focusPrev`) are **pure** — they set `current`, flip
 * exactly two `focused` flags, and `invalidate()`, but they do **not** flush. The loop wraps each
 * public call in a `runTick` so a standalone call paints exactly one frame (PA-11), while the
 * built-in Tab handler (`dispatch.ts`) calls them directly because it already runs inside the tick.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { View, Group } from '../view/index.js';

/** Loop-owned focus state machine over the mounted root view. */
export interface FocusManager {
  /** The globally-focused leaf (root→leaf `current` chain), or `null` if none (AR-48). */
  getFocused(): View | null;
  /** The focused leaf within `scope`'s `current` chain, or `null` — used to clamp dispatch to a modal. */
  focusedLeafIn(scope: View | null): View | null;
  /** Focus exactly `view`; a no-op if `view` is non-focusable (PA-5). */
  focusView(view: View): void;
  /** Focus into a container: its saved `current` (restore) or first focusable descendant (AR-53). */
  focusInto(view: View): void;
  /** The leaf focusable predicate (used by focus-on-click to climb to the nearest focusable, AR-56). */
  isFocusable(view: View): boolean;
  /** Advance focus to the next focusable sibling (wrap), descending into a focusable container (AR-57). */
  focusNext(): void;
  /** Retreat focus to the previous focusable sibling (wrap) (AR-57). */
  focusPrev(): void;
}

/**
 * Create a focus manager over the mounted root, read lazily via `getRoot` (the loop sets the root at
 * mount).
 *
 * @param getRoot Accessor for the current mounted root view (or `null` before mount).
 * @returns A {@link FocusManager}.
 */
export function createFocusManager(getRoot: () => View | null): FocusManager {
  /** True if no `!visible`/`disabled` ancestor blocks `view` (subtree semantics, AR-65). */
  const noBlockingAncestor = (view: View): boolean => {
    let ancestor = view.parent;
    while (ancestor !== null) {
      if (!ancestor.state.visible || ancestor.state.disabled) return false;
      ancestor = ancestor.parent;
    }
    return true;
  };

  /** The leaf focusable predicate: `visible && !disabled && focusable` + no blocking ancestor (AR-56). */
  const isFocusable = (view: View): boolean =>
    view.state.visible && !view.state.disabled && view.focusable && noBlockingAncestor(view);

  /** Whether a group has at least one focusable descendant (AR-65). */
  const isFocusableContainer = (group: Group): boolean => {
    for (const child of group.children) {
      if (isFocusable(child)) return true;
      if (child instanceof Group && isFocusableContainer(child)) return true;
    }
    return false;
  };

  /** Whether `view` can receive focus: a focusable leaf, or a container with a focusable descendant. */
  const canReceiveFocus = (view: View): boolean => {
    if (view instanceof Group) return isFocusable(view) || isFocusableContainer(view);
    return isFocusable(view);
  };

  /** Follow the `current` chain down from `scope` to the focused leaf, or `null` if `scope` holds none. */
  const focusedLeafIn = (scope: View | null): View | null => {
    if (!(scope instanceof Group) || scope.current === null) return null;
    let node: View = scope.current;
    while (node instanceof Group && node.current !== null) {
      node = node.current;
    }
    return node;
  };

  const getFocused = (): View | null => focusedLeafIn(getRoot());

  /** Set `current` pointers along `view`'s ancestor chain so root→…→view (AR-48). */
  const setCurrentChain = (view: View): void => {
    let child: View = view;
    let parent = view.parent;
    while (parent instanceof Group) {
      parent.current = child;
      child = parent;
      parent = parent.parent;
    }
  };

  /**
   * Focus a specific view: set its `current` chain, then flip the old/new `focused` flags and
   * invalidate both (exactly two repaints, coalesced by the loop into one frame, AC-6).
   */
  const focusLeaf = (view: View): void => {
    const old = getFocused();
    setCurrentChain(view);
    if (old === view) return; // idempotent — chain re-affirmed, no flag flip
    if (old !== null) {
      old.state.focused = false;
      old.invalidate();
    }
    view.state.focused = true;
    view.invalidate();
  };

  /**
   * Focus into a target: a leaf is focused directly; a container descends to its saved `current`
   * (restore) or its first focusable child, recursing until a leaf is reached. A focusable container
   * with no focusable descendant is focused itself.
   */
  const focusInto = (view: View): void => {
    if (!(view instanceof Group)) {
      focusLeaf(view);
      return;
    }
    const saved = view.current !== null && canReceiveFocus(view.current) ? view.current : null;
    const target = saved ?? view.children.find(canReceiveFocus) ?? null;
    if (target !== null) {
      focusInto(target);
      return;
    }
    if (isFocusable(view)) focusLeaf(view); // focusable container, no focusable descendants
  };

  const focusView = (view: View): void => {
    if (isFocusable(view)) focusLeaf(view); // non-focusable ⇒ no-op (PA-5)
  };

  /**
   * Advance/retreat focus within the active group (the focused leaf's parent, or the root when no
   * focus). Picks the next/previous focusable child in child order, wrapping at the ends; descends
   * into a chosen container (AR-57). With zero focusable children in the active group, a no-op.
   */
  const advance = (direction: 1 | -1): void => {
    const root = getRoot();
    if (root === null) return;
    const focused = getFocused();
    const active =
      focused !== null && focused.parent instanceof Group ? focused.parent : root instanceof Group ? root : null;
    if (active === null) return;

    const candidates = active.children.filter(canReceiveFocus);
    if (candidates.length === 0) return; // nothing focusable here (AR-57)

    const currentChild = active.current;
    const currentIndex = currentChild !== null ? candidates.indexOf(currentChild) : -1;
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : candidates.length - 1
        : (currentIndex + direction + candidates.length) % candidates.length;

    const chosen = candidates[nextIndex];
    if (chosen !== undefined) focusInto(chosen);
  };

  return {
    getFocused,
    focusedLeafIn,
    focusView,
    focusInto,
    isFocusable,
    focusNext: () => advance(1),
    focusPrev: () => advance(-1),
  };
}
