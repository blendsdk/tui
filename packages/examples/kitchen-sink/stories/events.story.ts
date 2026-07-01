/**
 * Story: Events (RD-04) — focus chain + command dispatch, live. Folds in `demo:events`.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { Group, Button, Text, signal } from '@jsvision/ui';
import { at } from '../story.js';
import type { Story, StoryContext } from '../story.js';

export const eventsStory: Story = {
  id: 'foundations/events',
  category: 'Foundations',
  title: 'Events',
  rd: 'RD-04',
  blurb: '3-phase dispatch + focus chain: Tab moves focus (watch the highlight); activation emits commands.',
  build(ctx: StoryContext) {
    const w = ctx.width;
    const last = signal('(none)');
    const g = new Group();
    g.add(at(new Button('~O~ne', { onClick: () => last.set('one') }), 1, 0, 9, 2));
    g.add(at(new Button('~T~wo', { onClick: () => last.set('two') }), 11, 0, 9, 2));
    g.add(at(new Button('T~h~ree', { onClick: () => last.set('three') }), 21, 0, 11, 2));
    g.add(at(new Text(() => `Last command: ${last()}`), 1, 3, w, 1));
    g.add(
      at(new Text('Tab / Shift-Tab cycle the focus chain; the focused button paints in buttonFocused.'), 1, 5, w, 1),
    );
    g.add(
      at(new Text('Space / Enter activates the focused button; Alt-O / Alt-T / Alt-H are its hotkeys.'), 1, 6, w, 1),
    );
    return g;
  },
};
