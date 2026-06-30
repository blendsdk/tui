# Clusters: Cluster · CheckGroup · RadioGroup

> **Document**: 03-06-clusters.md
> **Parent**: [Index](00-index.md)
> TV source: `tcluster.cpp:87-396` · `tcheckbo.cpp:18-31` · `tradiobu.cpp:18-42`

A vertical column of selectable items over a shared internal `Cluster` base. `CheckGroup` (independent
toggles) and `RadioGroup` (exclusive) differ only in the marker glyph, the `mark()` predicate, and the
`press()` mutation (faithful: TV's check/radio are thin overrides of `TCluster`).

## `Cluster` base (internal, `tcluster.cpp`)
```ts
// controls/cluster.ts — not exported; the base for CheckGroup/RadioGroup
abstract class Cluster extends View {
  focusable = true;
  protected sel = 0;                  // the focused item index
  constructor(labels: string[]);      // each label marks its hotkey ~X~
  protected abstract mark(i: number): boolean;     // is item i "on"? (check: flag; radio: i===value)
  protected abstract press(i: number): void;       // toggle/select item i (writes the bound signal)
  protected abstract box(): { icon: string; on: string; off: string }; // " [ ] "/"X" or " ( ) "/"•"
}
```

### Drawing (single-column, PA-6; faithful 5-cell box `tcluster.cpp:87-129`)
- One item per row (`size.y ≥ item count`; multi-column flow **deferred**, PA-6). Each row: a 5-cell box
  `␣[x]␣` (`icon` with the middle char = `mark(i) ? on : off`) at cols 0–4, then the label from col 5.
  - **CheckGroup:** icon ` [ ] `, on `X`, off ` ` ⇒ ` [X] label` / ` [ ] label`.
  - **RadioGroup:** icon ` ( ) `, on = the filled marker (PA-9 — an **unambiguous-narrow** glyph, e.g.
    `•`; the exact code point pinned in the spec oracle, not CP437 `0x07`/`◉` which is EA-ambiguous),
    off ` ` ⇒ ` (•) label` / ` ( ) label`.
- **Role (`tcluster.cpp:93-95`):** the focused item (`i === sel` and the cluster focused) ⇒
  `clusterSelected`; a disabled item ⇒ `clusterDisabled`; else `clusterNormal`. The `~hotkey~` char in
  `clusterShortcut`.

### Behavior (`tcluster.cpp:161-295`)
- **Keyboard (focused):** `↑`/`↓` move `sel` within the column (skipping disabled, wrapping); `Space`
  ⇒ `press(sel)`; `Alt-<hotkey>` (matching an item's tilde char) ⇒ focus + `press` that item.
  (`←`/`→` between-column nav is N/A in single-column v1.)
- **Mouse:** a click on a row (`ev.local.y` → item index) ⇒ `sel = i` + `press(i)`.
- **Reactive:** `onMount(() => this.bind(() => <read the bound signal>))` repaints when the value changes.

## `CheckGroup` (TV `TCheckBoxes`, AR-96/PA-3)
```ts
export class CheckGroup extends Cluster {
  constructor(labels: string[], value: Signal<boolean[]>); // one flag per item (PA-3)
  // mark(i) = value()[i]; press(i) = value.set(toggle index i); box() = { ' [ ] ', 'X', ' ' }
}
```

## `RadioGroup` (TV `TRadioButtons`, AR-96/PA-3/PA-9)
```ts
export class RadioGroup extends Cluster {
  constructor(labels: string[], value: Signal<number>);    // selectedIndex (PA-3)
  // mark(i) = value() === i; press(i) = value.set(i); box() = { ' ( ) ', '•', ' ' } (narrow marker, PA-9)
}
```

## Error handling
| Case | Strategy | Ref |
|------|----------|-----|
| `value` array shorter than labels (check) | a missing flag reads falsy ⇒ unchecked; `press` writes a full-length array | PA-3 |
| `value` index out of range (radio) | no item marked; `press` sets a valid index | PA-3 |
| all items disabled | `↑↓` no-op; `Space`/click on a disabled item is inert | tcluster.cpp:189 |
| empty `labels` | renders nothing; not focusable-effective (no items) | PA-6 |

## Testing Requirements
- Spec: `CheckGroup` renders ` [ ] `/` [X] ` per the bound `boolean[]`; `Space`/click toggles the
  focused/clicked item + writes the signal; `RadioGroup` renders ` ( ) `/` (•) `, `↑↓` move selection,
  selecting clears the others, writes the index; the focused item paints `clusterSelected`, hotkey
  `clusterShortcut`.
- Impl: disabled-item skip on `↑↓`; click-to-item mapping; short/out-of-range bound value; hotkey select.
