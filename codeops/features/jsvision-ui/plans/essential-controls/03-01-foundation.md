# Foundation: `ev.emit` primitive · Theme roles · `controls/` subsystem

> **Document**: 03-01-foundation.md
> **Parent**: [Index](00-index.md)

The cross-cutting prerequisites every later control depends on. Three pieces: the additive command-emit
primitive (PA-1), the faithful control theme roles (PA-5), and the `controls/` subsystem skeleton (PA-4).

## A. The `ev.emit()` dispatch-envelope primitive (PA-1)

### Proposed change
A focused control raises a typed command directly from `onEvent`. The loop's `RouteContext` already
carries `emitCommand` (`event/dispatch.ts:31`); expose it on the per-event envelope.

```ts
// view/types.ts — DispatchEvent gains two optional accessors sourced from the active RouteContext:
export interface DispatchEvent {
  readonly event: AppEvent;
  handled: boolean;
  readonly local?: Point;
  /** Raise a typed command onto the current dispatch tick (RD-06 PA-1). Present when a RouteContext
   *  is active (always, during real dispatch); undefined only in bare unit-constructed envelopes. */
  readonly emit?: (command: string, arg?: unknown) => void;
  /** Focus another view (RD-06 PA-10) — used by `Label` to focus its link. Same source/availability
   *  as `emit`. */
  readonly focusView?: (view: View) => void;
}
```
- `event/dispatch.ts`: when building each phase's envelope, set `emit: (c, a) => ctx.emitCommand(c, a)`
  and `focusView: (v) => ctx.focusView(v)` from the active `RouteContext` (the context already reaches
  the command registry + focus manager — focus-on-click uses the latter, `hit-test.ts:146`). Intra-ui,
  additive, optional — no loop re-shape (mirrors the RD-05 `setCapture`/`onFrame` additive seams).
  Existing call sites are unaffected (both fields are new + optional).

### Error handling
| Case | Strategy | Ref |
|------|----------|-----|
| `ev.emit` called with no active context (bare test envelope) | optional-chained `ev.emit?.(…)` ⇒ no-op; controls never assume it exists | PA-1 |
| command disabled | the registry drops a disabled command (existing RD-04 behavior) | PA-1 |

## B. Faithful `cpGrayDialog` control theme roles (PA-5)

### Proposed change
Add to `@jsvision/core` `Theme` + `defaultTheme` the control roles, each decoded from
`app.h:142` `cpAppColor[ cpGrayDialog[slot] ]` (`dialogs.h:42-72` slot map). **Buttons reuse** the
existing `button` (slot 10, `0x20` black/green) + `buttonFocused` (slot 12, `0x2F` white/green).

```ts
// core/src/engine/color/theme.ts — additive roles (exact bytes pinned FROM app.h in the spec test):
readonly staticText: ThemeRole;        // slot 6  (verified 0x70 black/lightGray)
readonly label: ThemeRole;             // slot 7  (label normal)
readonly labelSelected: ThemeRole;     // slot 8  (link focused)
readonly labelShortcut: ThemeRole;     // slot 9  (hotkey accent)
readonly buttonDefault: ThemeRole;     // slot 11
readonly buttonDisabled: ThemeRole;    // slot 13
readonly buttonShortcut: ThemeRole;    // slot 14 (button hotkey accent)
readonly clusterNormal: ThemeRole;     // slot 16
readonly clusterSelected: ThemeRole;   // slot 17 (focused item)
readonly clusterShortcut: ThemeRole;   // slot 18 (hotkey accent)
readonly clusterDisabled: ThemeRole;   // slot 31
readonly inputNormal: ThemeRole;       // slot 19 (unfocused field)
readonly inputSelected: ThemeRole;     // slot 20 (focused field)
readonly inputArrows: ThemeRole;       // slot 21 (◄/► scroll arrows)
```
- ScrollBar (4–5) + ListViewer (26–29) roles → RD-11; History (22–25) → RD-07 (not added here).
- The hotkey-accent roles (`labelShortcut`/`buttonShortcut`/`clusterShortcut`) supply the `~hotkey~` color;
  where TV uses a distinct shortcut slot, the role's `hotkey?` field carries it on the base role.

### Error handling
| Case | Strategy | Ref |
|------|----------|-----|
| a byte mis-decoded vs source | the spec oracle asserts each role `==` the source decode; CI fails until corrected | PA-5 |
| `encode()` of a new role throws | covered by the per-role encode spec (no throw) | AC-9 |

## C. The `controls/` subsystem skeleton (PA-4)
- `packages/ui/src/controls/index.ts` — the barrel; explicit named re-exports added to `src/index.ts`.
- Files: `text.ts`, `label.ts`, `button.ts`, `input.ts`, `cluster.ts`, `check-group.ts`, `radio-group.ts`;
  validators in `controls/validators/{types,filter,range,lookup,index}.ts`. Each ≤ 500 lines.
- Convention: ESM/NodeNext `.js` specifiers, JSDoc on every exported symbol, zero runtime deps.

## Integration Points
- `ev.emit` is consumed by `Button` (03-03) and any future command-emitting control.
- The theme roles are consumed by every control's `draw()` via `ctx.color(role)`/`ctx.role(role)`.

## Testing Requirements
- Spec: the `ev.emit` envelope carries the command to the registry (a focused stub control emits `'ok'` ⇒ a command spy sees it). The new theme roles deep-equal their `app.h` source decode + `encode()` no-throw.
- Impl: `ev.emit` is `undefined` on a bare envelope (optional-chain safe); roles present in `defaultTheme`.
