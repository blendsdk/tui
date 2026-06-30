/**
 * `CheckGroup` — a column of independent checkboxes (Turbo Vision `TCheckBoxes`, RD-06 AC-6/PA-3).
 *
 * Bound to a `Signal<boolean[]>` (one flag per item); `Space`/click toggles the focused/clicked item.
 * Faithful to `tcheckbo.cpp` (`button=" [ ] "`, marker `" X"`, `press = value ^ (1<<i)`), reframed onto
 * a `boolean[]` signal (PA-3). The `.js` extension in import specifiers is required by NodeNext resolution.
 */
import { Cluster } from './cluster.js';
import type { ClusterBox } from './cluster.js';
import type { Signal } from '../reactive/index.js';

/** A column of independent checkboxes bound to a `boolean[]` (one flag per item). */
export class CheckGroup extends Cluster {
  /** One flag per item; the source of truth (two-way). */
  protected readonly value: Signal<boolean[]>;

  /**
   * @param labels One label per item (each may mark its hotkey with `~X~`).
   * @param value  A `Signal<boolean[]>` — one flag per item (PA-3).
   */
  constructor(labels: readonly string[], value: Signal<boolean[]>) {
    super(labels);
    this.value = value;
    this.onMount(() => this.bind(() => this.value())); // repaint when the bound array changes
  }

  protected override mark(i: number): boolean {
    return this.value()[i] ?? false; // a missing flag reads unchecked (PA-3)
  }

  protected override press(i: number): void {
    // Write a full-length array so a short bound value is normalized (PA-3).
    const cur = this.value();
    const next = this.rawLabels.map((_, idx) => cur[idx] ?? false);
    next[i] = !next[i];
    this.value.set(next);
  }

  protected override box(): ClusterBox {
    return { icon: ' [ ] ', on: 'X', off: ' ' };
  }
}
