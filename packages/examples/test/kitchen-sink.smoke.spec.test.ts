/**
 * Specification test (immutable oracle) — the kitchen-sink showcase registry.
 *
 * Source: the jsvision "kitchen-sink showcase (NON-NEGOTIABLE)" rule (repo `CLAUDE.md` +
 * `codeops/kitchen-sink-gate.md`). Every registered `Story` MUST mount headlessly and draw
 * something — this is the CI guard that keeps stories from rotting and makes "a story exists +
 * renders" mechanically checkable without a TTY. It also enforces the registry hygiene the shell
 * relies on (unique ids, required metadata).
 *
 * Real `@jsvision/ui` `RenderRoot` over fixed caps; each story is built + mounted + composed, then
 * the buffer is asserted non-empty. Expectations derive from the showcase contract, not the stories'
 * internals. The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import { createRenderRoot, createRoot } from '@jsvision/ui';
import { STORIES } from '../kitchen-sink/stories/index.js';
import { at } from '../kitchen-sink/story.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;
const WIDTH = 72;
const HEIGHT = 16;

/** Count cells that were actually painted (a bare frame/empty view leaves only spaces). */
function paintedCells(rows: readonly { char: string }[][]): number {
  let n = 0;
  for (const row of rows) for (const cell of row) if (cell.char !== ' ') n += 1;
  return n;
}

test('the registry is non-empty and every story carries the required metadata', () => {
  expect(STORIES.length).toBeGreaterThan(0);
  for (const story of STORIES) {
    expect(story.id, 'id').toBeTruthy();
    expect(story.category, `${story.id} category`).toBeTruthy();
    expect(story.title, `${story.id} title`).toBeTruthy();
    expect(story.blurb, `${story.id} blurb`).toBeTruthy();
  }
});

test('story ids are unique (the shell uses them as menu command names)', () => {
  const ids = STORIES.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
});

// The core smoke oracle: each story builds + mounts + draws without throwing, and paints something.
for (const story of STORIES) {
  test(`story "${story.id}" mounts headlessly and paints`, () => {
    // Build inside a disposable owner (as the shell does) so any story computeds/effects are owned.
    createRoot((dispose) => {
      const view = at(story.build({ caps, width: WIDTH, height: HEIGHT }), 0, 0, WIDTH, HEIGHT);
      const rr = createRenderRoot({ width: WIDTH, height: HEIGHT }, { caps });
      expect(() => rr.mount(view)).not.toThrow();
      expect(paintedCells(rr.buffer().rows()), `${story.id} painted nothing`).toBeGreaterThan(0);
      dispose();
    });
  });
}
