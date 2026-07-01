/**
 * Story: `ListView`/`ListBox` (RD-11) — a virtual-scroll list of ~40 items with type-ahead.
 *
 * A `ListBox` over a `Signal<string[]>`: ↑↓/PgUp/PgDn/Home/End move the highlight, Enter/click select,
 * and typing jumps to the next matching prefix (type-ahead). A live echo shows the focused + selected
 * rows. The owned scroll bar tracks the focused item.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { Group, ListBox, Text, signal } from '@jsvision/ui';
import { at } from '../story.js';
import type { Story, StoryContext } from '../story.js';

/** ~40 fruit names — enough to overflow the viewport so the scroll bar + virtualization show. */
const ITEMS = [
  'Apple',
  'Apricot',
  'Avocado',
  'Banana',
  'Blackberry',
  'Blueberry',
  'Boysenberry',
  'Cantaloupe',
  'Cherry',
  'Clementine',
  'Coconut',
  'Cranberry',
  'Currant',
  'Date',
  'Dragonfruit',
  'Elderberry',
  'Fig',
  'Gooseberry',
  'Grape',
  'Grapefruit',
  'Guava',
  'Honeydew',
  'Jackfruit',
  'Kiwi',
  'Kumquat',
  'Lemon',
  'Lime',
  'Lychee',
  'Mango',
  'Mulberry',
  'Nectarine',
  'Orange',
  'Papaya',
  'Passionfruit',
  'Peach',
  'Pear',
  'Persimmon',
  'Pineapple',
  'Plum',
  'Pomegranate',
  'Raspberry',
  'Strawberry',
];

export const listViewStory: Story = {
  id: 'containers/listview',
  category: 'Containers',
  title: 'ListView',
  rd: 'RD-11',
  blurb: 'TListBox: ↑↓/PgDn move · Enter/click select · type a prefix to jump (type-ahead). The bar tracks focus.',
  build(ctx: StoryContext) {
    const items = signal([...ITEMS]);
    const focused = signal(0);
    const selected = signal(-1);
    const list = new ListBox({ items, focused, selected, typeAhead: true });

    const g = new Group();
    const listW = Math.max(24, Math.floor((ctx.width - 4) / 2));
    const listH = Math.max(6, ctx.height - 4);
    g.add(at(list, 1, 1, listW, listH));

    const echoX = listW + 3;
    g.add(
      at(new Text(() => `focused: #${focused()} = ${ITEMS[focused()] ?? '—'}`), echoX, 1, ctx.width - echoX - 1, 1),
    );
    g.add(
      at(
        new Text(() => {
          const s = selected();
          return `selected: ${s < 0 ? '(none)' : `#${s} = ${ITEMS[s] ?? '—'}`}`;
        }),
        echoX,
        3,
        ctx.width - echoX - 1,
        1,
      ),
    );
    g.add(at(new Text('Try typing "gr" to jump to Grape.'), echoX, 5, ctx.width - echoX - 1, 1));
    return g;
  },
};
