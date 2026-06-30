/**
 * `RadioGroup` — a column of mutually-exclusive radio buttons (Turbo Vision `TRadioButtons`,
 * RD-06 AC-7/PA-3/PA-9).
 *
 * Bound to a `Signal<number>` (the selected index); `↑/↓` move the selection (radio selects on move,
 * TV `movedTo`), `Space`/click/`Alt-<hotkey>` select. Faithful to `tradiobu.cpp` (`button=" ( ) "`,
 * marker `" \x7"` → the unambiguous-narrow `•` per PA-9, `press = value = i`). The `.js` extension in
 * import specifiers is required by NodeNext ESM resolution.
 */
import { Cluster } from './cluster.js';
import type { ClusterBox } from './cluster.js';
import type { Signal } from '../reactive/index.js';

/** A column of mutually-exclusive radio buttons bound to a `number` (the selected index). */
export class RadioGroup extends Cluster {
  /** The selected item index; the source of truth (two-way). */
  protected readonly value: Signal<number>;

  /**
   * @param labels One label per item (each may mark its hotkey with `~X~`).
   * @param value  A `Signal<number>` — the selected index (PA-3).
   */
  constructor(labels: readonly string[], value: Signal<number>) {
    super(labels);
    this.value = value;
    this.sel = value(); // start focus on the selected item (TV `setData` sets `sel = value`)
    this.onMount(() => this.bind(() => this.value())); // repaint when the bound index changes
  }

  protected override mark(i: number): boolean {
    return this.value() === i;
  }

  protected override press(i: number): void {
    this.value.set(i);
  }

  protected override movedTo(i: number): void {
    this.value.set(i); // radio: moving the selection selects it (TV `TRadioButtons::movedTo`)
  }

  protected override box(): ClusterBox {
    return { icon: ' ( ) ', on: '•', off: ' ' };
  }
}
