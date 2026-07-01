/**
 * Story: `ScrollBar` (RD-11) — a vertical + a horizontal `TScrollBar` bound to live `value` signals.
 *
 * Arrows step ±1, the page track pages, and dragging the ■ thumb scrubs; a live echo shows both
 * bound values. Passive chrome (not focusable) — this story shows the bars driven purely by mouse.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { Group, ScrollBar, Text, signal } from '@jsvision/ui';
import { at } from '../story.js';
import type { Story, StoryContext } from '../story.js';

export const scrollBarStory: Story = {
  id: 'containers/scrollbar',
  category: 'Containers',
  title: 'ScrollBar',
  rd: 'RD-11',
  blurb: 'TScrollBar: ▲/▼ arrows step, the ▒ page track pages, drag the ■ thumb to scrub. Bound to a signal.',
  build(ctx: StoryContext) {
    const vpos = signal(0);
    const hpos = signal(0);
    const g = new Group();

    // A vertical bar down the left, a horizontal bar along the top.
    const vBar = new ScrollBar({ value: vpos, min: 0, max: 100, orientation: 'vertical', pageStep: 10 });
    const hBar = new ScrollBar({ value: hpos, min: 0, max: 100, orientation: 'horizontal', pageStep: 10 });
    g.add(at(vBar, 1, 1, 1, Math.max(6, ctx.height - 4)));
    g.add(at(hBar, 4, 1, Math.max(20, ctx.width - 8), 1));

    g.add(
      at(
        new Text(() => `vertical value = ${vpos()}   ·   horizontal value = ${hpos()}   (0–100)`),
        4,
        4,
        ctx.width - 6,
        1,
      ),
    );
    g.add(
      at(
        new Text('Click the arrows / page area, or drag the ■ thumb. Wheel over the vertical bar scrolls ±3.'),
        4,
        6,
        ctx.width - 6,
        1,
      ),
    );
    return g;
  },
};
