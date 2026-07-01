/**
 * Story: App Shell (RD-05) — the anatomy of the app you are using. Folds in `demo:shell`.
 *
 * The shell can't nest another desktop inside a content pane, so this story annotates the live shell
 * around the story — the showcase itself is the RD-05 app shell in action.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { Group, Text } from '@jsvision/ui';
import { at } from '../story.js';
import type { Story, StoryContext } from '../story.js';

const PARTS = [
  '• MenuBar    — the ≡ / Foundations / Controls / Nav bar at the top (F10, Alt-letter).',
  '• Desktop    — the window manager hosting this canvas (raise / move / tile / cascade).',
  '• Window     — this grey StoryWindow frame (a faithful TDialog TFrame).',
  '• StatusLine — the command hints along the bottom (click them, or use the accelerators).',
  '• Overlay    — an absolute top layer that hosts the dropdown menus above everything.',
];

export const shellStory: Story = {
  id: 'foundations/shell',
  category: 'Foundations',
  title: 'App Shell',
  rd: 'RD-05',
  blurb: 'createApplication(): a Desktop + Window + MenuBar + StatusLine + overlay — the whole app you are using.',
  build(ctx: StoryContext) {
    const w = ctx.width;
    const g = new Group();
    g.add(at(new Text('You are using the app shell right now — its pieces:'), 1, 0, w, 1));
    PARTS.forEach((part, i) => g.add(at(new Text(part), 2, 2 + i, w - 3, 1)));
    g.add(
      at(
        new Text('run() wires createHost → dispatch, drives one frame per tick, and restores on every exit.'),
        1,
        9,
        w,
        1,
      ),
    );
    return g;
  },
};
