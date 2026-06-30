# Text + Label

> **Document**: 03-02-text-label.md
> **Parent**: [Index](00-index.md)
> TV source: `tstatict.cpp` · `tlabel.cpp`

## `Text` (TV `TStaticText`, AR-100/PA-14)

A non-focusable static label. Renders a string or a reactive getter, word-wrapped on spaces, left-aligned.

```ts
export class Text extends View {
  constructor(content: string | (() => string));   // reactive getter ⇒ repaint on change
  // focusable = false (default); draw() word-wraps to ctx.size.width, fills rows top-down.
}
```
- **draw():** resolve the content; word-wrap on spaces to `ctx.size.width` (faithful `tstatict.cpp:74-88`
  loop — break at the last space ≤ width, else hard-break); paint each wrapped line with `ctx.color('staticText')`. Lines beyond `ctx.size.height` are clipped. (PA-14)
- **Reactive:** if `content` is a function, `onMount(() => this.bind(content))` repaints on change.
- **Center alignment** (TV's leading-`0x03`) is **out of v1** (PA-14).

### Error handling
| Case | Strategy | Ref |
|------|----------|-----|
| empty string | paints nothing (blank rows) | PA-14 |
| a word longer than the width | hard-break at the width boundary (TV behavior) | tstatict.cpp:74 |
| getter throws | the draw-error isolation in the compose walker contains it (existing RD-03) | — |

## `Label` (TV `TLabel`, AR-103/PA-10)

A single-line text with a `~hotkey~`, **linked** to a target control; clicking it or pressing its hotkey
focuses the link, and it highlights while the link is focused.

```ts
export class Label extends View {
  postProcess = true;                               // catches its Alt-hotkey when not in the focus chain
  constructor(text: string, link: View);            // text marks the hotkey with ~X~
  // focusable = false; observes link.state.focused for the highlight (reactive).
}
```
- **draw():** render `parseTilde(text)` with `moveCStr`-style hotkey accenting (`tlabel.cpp:64`): the base
  in `label` (or `labelSelected` when `link.state.focused`), the `~hotkey~` char in `labelShortcut`
  (faithful: TV swaps the whole label color on link-focus, accents the hotkey). Single line, height 1.
- **onEvent():** a mouse-down on the label (delivered by hit-test — the Label is visible/enabled), or an
  `Alt-<hotkey>` key (caught in the post-process phase since the Label is not focusable), focuses the
  link via **`ev.focusView?.(this.link)`** (the additive envelope accessor, 03-01/PA-1), then sets
  `ev.handled`. (PA-10, `tlabel.cpp:91-98`)
- **Highlight:** `onMount(() => this.bind(() => this.link.state.focused))` repaints when the link's focus
  flips (the link sets `state.focused` via RD-04; the Label re-reads it).

### Focus-link mechanism (PA-10)
The Label focuses its link via the **additive `ev.focusView` envelope accessor** (defined in 03-01,
bundled with PA-1's `ev.emit`; sourced from the `RouteContext` focus manager). Behavior is fixed by
PA-10 (click/hotkey → focus the link); the seam is the same additive-envelope pattern as command emit.

### Error handling
| Case | Strategy | Ref |
|------|----------|-----|
| no hotkey in the text | the whole label is plain `label`/`labelSelected`; click still focuses the link | PA-10 |
| link is `disabled`/`!visible` | focusing a non-focusable link is a no-op (RD-04 `isFocusable`) | focus.ts:54 |

## Testing Requirements
- Spec: `Text` word-wraps a long string across rows in `staticText`; a reactive `Text` repaints on signal change. `Label` paints `labelSelected` when its link is focused (else `label`), hotkey in `labelShortcut`; a click / `Alt-hotkey` focuses the link.
- Impl: hard-break of an over-long word; a hotkey-less label; focusing a disabled link is inert.
