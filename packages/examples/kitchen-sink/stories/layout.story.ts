/**
 * Story: Layout (RD-02) — the cell-native flex engine, live. Folds in `demo:layout`.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { Group, Text } from '@jsvision/ui';
import type { ThemeRoleName, Size } from '@jsvision/ui';
import { at } from '../story.js';
import type { Story, StoryContext } from '../story.js';

/** A colored, labelled flex box: a themed background Group carrying its own flex `size`. */
function box(label: string, role: ThemeRoleName, size: Size): Group {
  const b = new Group();
  b.background = role;
  b.layout = { size };
  b.add(at(new Text(label), 1, 0, 14, 1));
  return b;
}

export const layoutStory: Story = {
  id: 'foundations/layout',
  category: 'Foundations',
  title: 'Layout',
  rd: 'RD-02',
  blurb: 'Cell-native flex: fixed / fr sizing, gap, and stretch — integer-correct, no fractional cells.',
  build(ctx: StoryContext) {
    const w = ctx.width;
    const g = new Group();
    g.add(at(new Text('A row — fixed 16 · fr 1 · fr 2 (the fr boxes split the remaining width):'), 1, 0, w, 1));
    const row = new Group();
    row.layout = { direction: 'row', gap: 1, align: 'stretch' };
    row.add(box('fixed 16', 'window', { kind: 'fixed', cells: 16 }));
    row.add(box('fr 1', 'clusterNormal', { kind: 'fr', weight: 1 }));
    row.add(box('fr 2', 'buttonDefault', { kind: 'fr', weight: 2 }));
    g.add(at(row, 1, 2, w - 2, 4));
    g.add(at(new Text('Also supported: direction row/col, gap, padding, justify, align, overflow.'), 1, 7, w, 1));
    return g;
  },
};
