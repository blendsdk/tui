/**
 * Story: View tree (RD-03) — nested themed Groups + reactive repaint. Folds in `demo:view`.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { Group, Button, Text, signal } from '@jsvision/ui';
import { at } from '../story.js';
import type { Story, StoryContext } from '../story.js';

export const viewStory: Story = {
  id: 'foundations/view',
  category: 'Foundations',
  title: 'View Tree',
  rd: 'RD-03',
  blurb: 'The retained widget tree: nested Groups, each themed + clipped, with reactive repaint.',
  build(ctx: StoryContext) {
    const w = ctx.width;
    const tick = signal(0);
    const g = new Group();

    const outer = new Group();
    outer.background = 'window';
    outer.add(at(new Text('outer panel — window role (blue)'), 1, 0, 34, 1));
    const inner = new Group();
    inner.background = 'dialog';
    inner.add(at(new Text(() => `inner panel — dialog role (grey) · tick = ${tick()}`), 1, 0, 38, 1));
    outer.add(at(inner, 2, 2, Math.min(42, w - 6), 3));
    g.add(at(outer, 1, 0, Math.min(48, w - 2), 6));

    g.add(at(new Button('~B~ump', { onClick: () => tick.update((n) => n + 1) }), 1, 7, 11, 2));
    g.add(
      at(new Text('Only the inner panel repaints on Bump — the dirty-set recomposes just that subtree.'), 1, 10, w, 1),
    );
    return g;
  },
};
