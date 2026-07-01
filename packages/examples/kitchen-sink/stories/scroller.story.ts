/**
 * Story: `Scroller` (RD-11) — a small viewport over oversized content with an owned scroll bar.
 *
 * The content is a tall/wide block of numbered lines; the `Scroller` clips it to the viewport and
 * offsets it by `-delta`. Focus the viewport and press ↑↓/PgUp/PgDn/Home/End (or use the owned bar +
 * wheel) to reveal more. A live echo shows the current scroll offset.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { Group, Scroller, Text } from '@jsvision/ui';
import { at } from '../story.js';
import type { Story, StoryContext } from '../story.js';

/** The oversized content: 24 numbered lines, each wider than a small viewport. */
const CONTENT_LINES = 24;
const CONTENT_WIDTH = 60;

export const scrollerStory: Story = {
  id: 'containers/scroller',
  category: 'Containers',
  title: 'Scroller',
  rd: 'RD-11',
  blurb: 'TScroller: a viewport over oversized content. Focus it, then ↑↓/PgDn/Home/End or the owned ▒ bar scroll.',
  build(ctx: StoryContext) {
    const content = new Group();
    for (let i = 0; i < CONTENT_LINES; i += 1) {
      content.add(
        at(
          new Text(`Line ${String(i + 1).padStart(2, '0')} — the quick brown fox jumps over the lazy dog.`),
          0,
          i,
          CONTENT_WIDTH,
          1,
        ),
      );
    }

    const extent = { width: CONTENT_WIDTH, height: CONTENT_LINES };
    const scroller = new Scroller({ content, extent, scrollbars: 'both' });

    const g = new Group();
    // A framed viewport ~half the content size so scrolling is visible.
    const vpW = Math.min(CONTENT_WIDTH, Math.max(24, ctx.width - 24));
    const vpH = Math.max(6, ctx.height - 4);
    g.add(at(scroller, 1, 1, vpW, vpH));
    g.add(
      at(
        new Text('Focus the viewport (Tab), then ↑↓ / PgUp / PgDn / Home / End — or drag the bar / wheel.'),
        1,
        ctx.height - 1,
        ctx.width - 2,
        1,
      ),
    );
    return g;
  },
};
