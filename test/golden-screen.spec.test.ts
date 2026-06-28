/**
 * Tier-2 golden-screen tests (RD-09 FR-2, plan doc 03-02).
 *
 * Validates the render path end-to-end through a real terminal emulator: build a
 * `ScreenBuffer` → `serialize` it (with the RD-05 depth-aware default encoder) →
 * feed the bytes to `@xterm/headless` → read back the grid → assert cells (char +
 * width + colour mode). Asserted across all four colour depths (ST-8…ST-11), so
 * the RD-05 downsample chain (truecolor→256→16→mono) is proven against a real
 * emulator, not just as a raw byte string (gate items 1 and 2).
 *
 * The expected grid is derived from the render/depth contract (RD-04 width model
 * + RD-05 depth modes), never by running `serialize` first. Per-depth colour
 * expectation: truecolor → RGB (exact), 256 → palette index, 16 → palette index
 * 0–15, mono → terminal default (no colour emitted).
 *
 * `@xterm/headless` is a CommonJS package whose `.d.ts` exposes named exports but
 * whose runtime requires a default import; the test runner is tsx (esbuild), which
 * resolves this correctly. The `.js` extension on the engine import is required by
 * NodeNext ESM resolution (it resolves to the `.ts` source under tsx).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenBuffer, serialize, resolveCapabilities } from '../src/engine/index.js';
import type { ColorDepth, RenderOptions, Style } from '../src/engine/index.js';
import { feed, makeTerm, readCell } from './golden-screen-helpers.js';
import type { CellColor } from './golden-screen-helpers.js';

/** Build `RenderOptions` pinned to a colour depth (with optional further overrides). */
function optsFor(depth: ColorDepth, override: Record<string, unknown> = {}): RenderOptions {
  const profile = resolveCapabilities({
    env: {},
    platform: 'linux',
    override: { colorDepth: depth, ...override },
  }).profile;
  return { caps: profile };
}

/** The colour mode the render contract requires of a styled cell at each depth. */
const COLOR_CONTRACT: Record<ColorDepth, (c: CellColor, label: string) => void> = {
  truecolor: (c, label) => assert.equal(c.mode, 'rgb', `${label}: truecolor must render in RGB mode`),
  '256': (c, label) => assert.equal(c.mode, 'palette', `${label}: 256 must downsample to palette mode`),
  '16': (c, label) => {
    assert.equal(c.mode, 'palette', `${label}: 16 must downsample to palette mode`);
    assert.ok(c.value >= 0 && c.value <= 15, `${label}: 16-colour index must be 0–15 (got ${c.value})`);
  },
  mono: (c, label) => assert.equal(c.mode, 'default', `${label}: mono must emit no colour (terminal default)`),
};

const DEPTHS: readonly ColorDepth[] = ['truecolor', '256', '16', 'mono'];
const STYLE: Style = { fg: '#0a141e', bg: '#28323c' };

for (const depth of DEPTHS) {
  // ST-8 / ST-9: a styled buffer renders the written chars and depth-correct colours.
  test(`ST-8/9: full repaint at ${depth} — chars + depth-correct colours`, async () => {
    const buf = new ScreenBuffer(6, 2, { fg: 'default', bg: 'default' });
    buf.set(0, 0, 'X', STYLE);
    buf.set(1, 0, 'Y', STYLE);
    const term = makeTerm(6, 2);
    await feed(term, serialize(buf, null, optsFor(depth)));

    const x = readCell(term, 0, 0);
    assert.equal(x.char, 'X', `${depth}: cell (0,0) char`);
    assert.equal(x.width, 1, `${depth}: cell (0,0) width`);
    COLOR_CONTRACT[depth](x.fg, `${depth} fg`);
    COLOR_CONTRACT[depth](x.bg, `${depth} bg`);
    assert.equal(readCell(term, 1, 0).char, 'Y', `${depth}: cell (1,0) char`);

    // Truecolor is exact pass-through; the lower depths must NOT be raw truecolor.
    if (depth === 'truecolor') {
      assert.equal(x.fg.value, 0x0a141e, 'truecolor fg is exact');
      assert.equal(x.bg.value, 0x28323c, 'truecolor bg is exact');
    } else {
      assert.notEqual(x.fg.mode, 'rgb', `${depth}: fg must not be raw truecolor`);
    }
  });

  // ST-10: a single-cell diff changes exactly the target cell, leaving the rest.
  test(`ST-10: single-cell update at ${depth} — only the target cell changes`, async () => {
    const prev = new ScreenBuffer(6, 1, { fg: 'default', bg: 'default' });
    for (let c = 0; c < 4; c += 1) prev.set(c, 0, 'a', STYLE);
    const next = new ScreenBuffer(6, 1, { fg: 'default', bg: 'default' });
    for (let c = 0; c < 4; c += 1) next.set(c, 0, 'a', STYLE);
    next.set(2, 0, 'Z', STYLE);

    const term = makeTerm(6, 1);
    await feed(term, serialize(prev, null, optsFor(depth))); // baseline
    await feed(term, serialize(next, prev, optsFor(depth))); // minimal diff

    assert.equal(readCell(term, 2, 0).char, 'Z', `${depth}: target cell updated`);
    assert.equal(readCell(term, 1, 0).char, 'a', `${depth}: left neighbour unchanged`);
    assert.equal(readCell(term, 3, 0).char, 'a', `${depth}: right neighbour unchanged`);
  });

  // ST-11: a wide CJK glyph occupies two columns; a combining mark adds none.
  test(`ST-11: CJK + combining row at ${depth} — correct column occupancy`, async () => {
    const buf = new ScreenBuffer(8, 1, { fg: 'default', bg: 'default' });
    buf.set(0, 0, '漢', STYLE); // wide: lead (w2) + continuation (w0)
    buf.set(2, 0, 'é', STYLE); // base + combining acute: one column (w1)
    buf.set(3, 0, 'Q', STYLE); // sentinel: stays at column 3 only if the mark adds no column
    const term = makeTerm(8, 1);
    await feed(term, serialize(buf, null, optsFor(depth, { unicode: { utf8: true, widthMode: 'wcwidth' } })));

    const lead = readCell(term, 0, 0);
    assert.equal(lead.char, '漢', `${depth}: wide glyph in the lead cell`);
    assert.equal(lead.width, 2, `${depth}: wide glyph lead width 2`);
    assert.equal(readCell(term, 1, 0).width, 0, `${depth}: wide glyph continuation width 0`);

    const combining = readCell(term, 2, 0);
    assert.equal(combining.width, 1, `${depth}: combining sequence occupies one column`);
    assert.ok(combining.char.startsWith('e'), `${depth}: combining cell keeps its base char`);
    // The combining mark must NOT spill into the next column: the sentinel stays at col 3.
    assert.equal(readCell(term, 3, 0).char, 'Q', `${depth}: combining mark added no column (sentinel intact)`);
  });
}
