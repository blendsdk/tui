# Button

> **Document**: 03-03-button.md
> **Parent**: [Index](00-index.md)
> TV source: `tbutton.cpp:66-275` · glyphs `tvtext1.cpp`

A focusable command button: `[ text ]` with a TV block-glyph drop-shadow; activates on click / `Space` /
`Alt-hotkey`, and (when `default`) on `Enter` if unconsumed; emits a typed command and/or `onClick`.

```ts
export interface ButtonOptions {
  command?: string;          // emitted via ev.emit on activation
  onClick?: () => void;      // called on activation (in addition to command)
  default?: boolean;         // also activates on Enter when unconsumed (PA-7)
  disabled?: boolean | (() => boolean); // greyed + inert
}
export class Button extends View {
  focusable = true;          // Space when focused
  postProcess = true;        // catches Alt-hotkey + (default) Enter when not in the focus chain (PA-7)
  constructor(text: string, opts?: ButtonOptions); // text marks the hotkey ~X~
}
```

## Drawing (faithful `tbutton.cpp` `drawState`)
- Layout: `[ text ]` centered in the view; min width = text + 2 (`tbutton.cpp` min). Height fills `size.y`
  (typically 1–2 rows); text row centered. The `[`/`]` brackets are drawn (TV `markers[0]`/`[1]` at cols
  1 and `size.x-2`).
- **Block-glyph drop-shadow (PA-8, `tbutton.cpp:121-164`):** the right column gets `▄`(0xDC) at the top
  row and `█`(0xDB) below; the bottom row gets a leading space then `▀`(0xDF) across — all in a shadow
  style (`getColor(8)` = darkGray/black). The clickable area excludes the shadow row/column.
- **State→role (PA-5, `tbutton.cpp:107-119`):** disabled ⇒ `buttonDisabled`; focused+active ⇒
  `buttonFocused` (reuses the existing role = TV "selected"); default (unfocused) ⇒ `buttonDefault`;
  else ⇒ `button` (reuses existing = TV "normal"). The `~hotkey~` char is accented via `buttonShortcut`.
- **Default markers** (TV `specialChars[2]`/`[3]` = `▬`/`◄`) are **out** unless `showMarkers` — v1 omits
  the focus/default end-markers (we draw the bracketed `[ text ]` + shadow; the default state shows via
  `buttonDefault` color), faithful to the non-`showMarkers` path (`tbutton.cpp:89-99`).

## Behavior (`tbutton.cpp:172-275`)
- **Mouse:** a down inside the button (excluding the shadow row) shows the pressed state; release inside
  ⇒ `activate()`; release outside ⇒ cancel. (Pointer tracking via the existing capture seam if needed,
  else a simple down-then-up-on-self.)
- **Keyboard:** `Space` when focused ⇒ `activate()`; `Alt-<hotkey>` (post-process) ⇒ `activate()`;
  `Enter` (post-process) ⇒ `activate()` **iff `default` and unconsumed**. (PA-7)
- **`activate()`:** if not disabled, `ev.emit?.(command)` (when `command` set) and call `onClick?.()`;
  set `ev.handled`. (PA-1) The 100 ms press animation (`tbutton.cpp:231`) is **out of v1** (a static
  pressed-frame is enough; animation needs a timer — note, not deferred-scope since it's cosmetic).
- **Disabled:** `disabled` (bool or reactive getter) greys (`buttonDisabled`) + makes `activate()` a
  no-op; bound reactively so a command's enable/disable reflects.

## Error handling
| Case | Strategy | Ref |
|------|----------|-----|
| `command` set but `ev.emit` absent (bare envelope) | optional-chain no-op; `onClick` still fires | PA-1 |
| both `command` + `onClick` | both run on activate | RD-06 AC-3 |
| `Enter` on a non-default focused button | not consumed by the button (only `default` catches Enter) | PA-7 |
| disabled activate (click/Space/Enter) | no-op, no emit | AC-3 |

## Testing Requirements
- Spec: a `[ OK ]` renders with the block-glyph shadow; click / `Space`(focused) / `Alt-O` emit `command`
  + call `onClick`; a `default` button activates on `Enter` when unconsumed; a `disabled` button greys
  (`buttonDisabled`) and never activates; focused ⇒ `buttonFocused`, default-unfocused ⇒ `buttonDefault`.
- Impl: release-outside cancels; both `command`+`onClick` fire; Enter ignored by a non-default button.
