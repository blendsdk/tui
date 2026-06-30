# Input

> **Document**: 03-05-input.md
> **Parent**: [Index](00-index.md)
> TV source: `tinputli.cpp:86-468` · arrows `tvtext1.cpp:106-107`

A lean single-line text editor bound to a two-way signal, with horizontal scroll, edge arrows, a length
cap, and a validator hook. **Selection + clipboard are deferred** (AR-94/PA-11 → `DEFERRED.md`).

```ts
export interface InputOptions {
  value: Signal<string>;     // two-way binding (read renders, edits write back) — PA-3/AR-100
  maxLength?: number;        // cap on the stored value (default unbounded)
  validator?: Validator;     // filter live + blocking on focus-leave (03-04)
}
export class Input extends View {
  focusable = true;
  constructor(opts: InputOptions);
  /** Run the blocking validator over the current value; sets `invalid`; returns the result (PA-2). */
  valid(): boolean;
}
```

## State (faithful `tinputli.cpp:86-103`)
- `curPos` (cursor index into the value), `firstPos` (the first visible char index — horizontal scroll).
- `invalid` (boolean, set by `valid()`/focus-leave) — drives the invalid theming (PA-2).

## Drawing (`tinputli.cpp:134-161`)
- One row: col 0 = left arrow `◄`(0x11) **iff** `firstPos > 0` else field; cols `1..size.x-2` = the value
  from `firstPos`; col `size.x-1` = right arrow `►`(0x10) **iff** more text to the right (`canScroll`).
- **Role:** `inputSelected` when focused, else `inputNormal`; the arrows in `inputArrows` (PA-5). When
  `invalid`, blend toward an invalid tint (use `inputNormal` fg over a flagged bg, or reuse an error
  accent — pinned in the spec oracle; faithful TV has no separate invalid color, so v1 uses a subtle
  marker: keep `inputNormal`/`inputSelected` and expose `invalid` for the app — minimal, PA-2).
- **Cursor:** placed at `curPos - firstPos + 1` when focused (the host positions the hardware cursor; the
  RD-05 `cursor` machinery handles visibility).

## Behavior (`tinputli.cpp:341-468`)
- **Editing:** printable char inserts at `curPos` (respecting `maxLength` + `validator.isValidInput` on
  the candidate — reject the keystroke if false, TV `checkValid`); Backspace deletes before cursor;
  Delete deletes at cursor; Home/End/←/→ move `curPos`; Tab/Enter are **not** consumed (they pass through
  to focus traversal / default-button). Each edit writes the bound `value` signal (two-way).
- **Scroll:** keep the cursor visible — adjust `firstPos` so `curPos` stays within `[firstPos, firstPos +
  fieldWidth)` (TV `firstPos` adjust, `tinputli.cpp` view-update). Arrows show when scrolled.
- **Validator:** `isValidInput` gates each keystroke (live reject — `filter`/`range`); on focus-leave (a
  blur event / when focus moves away) run `valid()` → `isValid` → set `invalid`; **no focus-trap** (Tab
  proceeds — PA-2). The modal trap is RD-11.
- **Mouse:** a click positions `curPos` at the clicked column (`ev.local.x` → char index via `firstPos`);
  clicking an arrow scrolls. (Selection-drag deferred.)

## Deferred (tracked → RD-07 / RD-11, `DEFERRED.md`)
- Text **selection** + cut/copy/paste **clipboard** (AR-94). The modal **focus-trap** on invalid (PA-2 → RD-11).

## Error handling
| Case | Strategy | Ref |
|------|----------|-----|
| `maxLength` reached | further inserts rejected (no-op) | PA-11 |
| `validator.isValidInput` false | the keystroke is rejected (value unchanged) | tvalidat / PA-2 |
| value longer than the field | horizontal scroll + edge arrows | tinputli.cpp:134 |
| no validator | every keystroke accepted; `valid()` true | PA-11 |
| cursor at bounds (Home/End/←/→) | clamp to `[0, value.length]` | tinputli.cpp:341 |

## Testing Requirements
- Spec: typing inserts at the cursor + writes `value`; Backspace/Delete/Home/End/←/→ behave; `maxLength`
  caps; a `filter('0-9')` rejects a letter live; long text scrolls with `◄`/`►`; `valid()` runs the
  blocking validator and sets `invalid` (no focus-trap — Tab still moves). Focused ⇒ `inputSelected`.
- Impl: scroll-keeps-cursor-visible math; click-to-position; arrow-click scroll; no-validator path.
