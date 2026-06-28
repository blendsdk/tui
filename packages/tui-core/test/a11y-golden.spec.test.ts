/**
 * Accessibility & degradation golden tests (RD-10 FR-9/FR-10, plan doc 03-03;
 * ST-5, ST-6). Proven through the real `@xterm/headless` emulator (RD-09 harness),
 * so these are end-to-end screen oracles, not unit assertions on SGR strings.
 *
 * Specification oracles — derived from RD-10 AC-5/AC-6 and the RD-05 mono /
 * RD-04 glyph-fallback contracts, never from the rendered output:
 *  - ST-5: under NO_COLOR (mono depth) a focused cell (reverse attribute) and a
 *    normal cell both render WITHOUT colour, yet focus stays distinguishable via
 *    the inverse attribute — no information is lost (AC-5).
 *  - ST-6: with `glyphs.boxDrawing:false` a `box(...)` renders in ASCII (`+ - |`),
 *    remaining legible (AC-6).
 *
 * ST-7 (non-TTY / TERM=dumb degradation) is mapped to RD-08's essentials gate
 * (`safety-essentials.spec` / `host-detect-tty.spec`) — no new test here (AR-10).
 *
 * The `.js` extension on engine/helper imports is required by NodeNext ESM
 * resolution (resolved to source by tsx at run time).
 */
import { test, expect } from 'vitest';
import { ScreenBuffer, serialize, resolveCapabilities, Attr } from '../src/engine/index.js';
import { makeTerm, feed, readCell, reverseState } from './golden-screen-helpers.js';

// ST-5 — NO_COLOR / monochrome: no colour emitted, focus conveyed by attribute.
test('ST-5: NO_COLOR mono renders without colour yet conveys focus via the inverse attribute', async () => {
  // NO_COLOR maps to mono in resolveCapabilities; pinning colorDepth:'mono'
  // selects the same render path deterministically.
  const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'mono' } }).profile;
  const term = makeTerm(10, 1);

  const buf = new ScreenBuffer(10, 1, { fg: 'default', bg: 'default' });
  buf.set(0, 0, 'A', { fg: 'red', bg: 'default', attrs: Attr.reverse }); // "focused"
  buf.set(1, 0, 'B', { fg: 'red', bg: 'default' }); // normal

  await feed(term, serialize(buf, null, { caps }));

  const focused = readCell(term, 0, 0);
  const normal = readCell(term, 1, 0);

  // Mono: the requested 'red' is dropped — neither cell carries colour.
  expect(focused.fg.mode).toBe('default');
  expect(focused.bg.mode).toBe('default');
  expect(normal.fg.mode).toBe('default');

  // Yet focus is still distinguishable — by a NON-colour attribute (no info lost).
  expect(reverseState(term, 0, 0)).toBe(true);
  expect(reverseState(term, 1, 0)).toBe(false);
  expect(reverseState(term, 0, 0)).not.toBe(reverseState(term, 1, 0));
});

// ST-6 — glyph fallback: box-drawing degrades to legible ASCII when unavailable.
test('ST-6: boxDrawing:false renders the frame in legible ASCII (+ - |)', async () => {
  const caps = resolveCapabilities({
    env: {},
    platform: 'linux',
    override: { glyphs: { boxDrawing: false } },
  }).profile;
  const term = makeTerm(6, 3);

  const buf = new ScreenBuffer(6, 3, { fg: 'default', bg: 'default' });
  buf.box(0, 0, 6, 3, { fg: 'default', bg: 'default' }, 'single');

  await feed(term, serialize(buf, null, { caps }));

  // Corner ┌→'+', top edge ─→'-', left edge │→'|' (RD-04 fallback contract).
  expect(readCell(term, 0, 0).char).toBe('+');
  expect(readCell(term, 1, 0).char).toBe('-');
  expect(readCell(term, 0, 1).char).toBe('|');
});
