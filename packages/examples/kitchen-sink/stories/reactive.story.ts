/**
 * Story: Reactivity (RD-01) — signals + computed + effect, live. Folds in `demo:reactive`.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { Group, Button, Text, signal, computed } from '@jsvision/ui';
import { at } from '../story.js';
import type { Story, StoryContext } from '../story.js';

export const reactiveStory: Story = {
  id: 'foundations/reactive',
  category: 'Foundations',
  title: 'Reactivity',
  rd: 'RD-01',
  blurb: 'Fine-grained signals: a signal, a derived computed, and effects that repaint only on change.',
  build(ctx: StoryContext) {
    const w = ctx.width;
    const count = signal(0);
    const doubled = computed(() => count() * 2);
    const g = new Group();
    g.add(
      at(
        new Text(
          () => `count = ${count()}      doubled (computed) = ${doubled()}      ${count() % 2 === 0 ? 'even' : 'odd'}`,
        ),
        1,
        0,
        w,
        1,
      ),
    );
    g.add(at(new Button('~I~nc', { onClick: () => count.update((n) => n + 1) }), 1, 2, 9, 2));
    g.add(at(new Button('~D~ec', { onClick: () => count.update((n) => n - 1) }), 11, 2, 9, 2));
    g.add(at(new Button('~R~eset', { onClick: () => count.set(0) }), 21, 2, 11, 2));
    g.add(
      at(new Text('The line above is one Text bound to count; the computed re-derives lazily + memoized.'), 1, 5, w, 1),
    );
    g.add(at(new Text('Tab to a button · Space / Enter activates · Alt-I / Alt-D / Alt-R.'), 1, 6, w, 1));
    return g;
  },
};
