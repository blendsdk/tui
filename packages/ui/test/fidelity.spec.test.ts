/**
 * Specification tests (immutable oracle) — RD-11 cross-component TV fidelity (ST-14).
 *
 * Source: jsvision-ui/RD-11 AC-13 → ST-14 (containers-scrolling-lists/07-testing-strategy.md). Asserts
 * the decoded TV geometry/colour that each component must reproduce, checked at the composed-buffer
 * level across the whole tier:
 *   • `ScrollBar` — arrow/track/thumb glyphs (`TScrollBar::draw`, `tscrlbar.cpp`): ▲/▼ (V) · ◄/► (H) ·
 *     ▒ track · ■ thumb · ▓ when disabled (range 0).
 *   • `ListView` — the colour-only focus indicator (no glyph, no divider), text at column 1, and the
 *     focused > selected > normal colour priority (`TListViewer::draw`, `tlstview.cpp:66-70`).
 *   • `Dialog` — the frame in the gray-`dialog` role (white border, close box, NO zoom box; `tframe.cpp`
 *     + PA-19).
 * Per the fidelity directive, the C++ source outranks these oracles for the TV-derived components.
 * `.js` per NodeNext.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, defaultTheme } from '@jsvision/core';
import { Group, createRenderRoot } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import { signal } from '../src/reactive/index.js';
import { ScrollBar } from '../src/scroll/index.js';
import { ListBox } from '../src/list/index.js';
import { Dialog } from '../src/dialog/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

/** Mount a single absolutely-placed view and return its composed buffer. */
function render(view: Group, w: number, h: number) {
  const rr = createRenderRoot({ width: w, height: h }, { caps });
  rr.mount(view);
  return rr.buffer();
}

/** Collect every glyph in a buffer as one string (for `toContain` glyph checks). */
function allChars(buf: ReturnType<typeof render>, w: number, h: number): string {
  let s = '';
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) s += buf.get(x, y)?.char ?? ' ';
  return s;
}

// ST-14 — ScrollBar glyphs: vertical arrows ▲/▼, a ▒ track, and a ■ thumb (TScrollBar::draw).
test('ST-14: a vertical ScrollBar draws ▲/▼ arrows, a ▒ track, and a ■ thumb', () => {
  const g = new Group();
  const bar = new ScrollBar({ value: signal(0), min: 0, max: 100, orientation: 'vertical' });
  bar.layout = { position: 'absolute', rect: { x: 0, y: 0, width: 1, height: 8 } };
  g.add(bar);
  const buf = render(g, 1, 8);
  expect(buf.get(0, 0)?.char).toBe('▲'); // top arrow
  expect(buf.get(0, 7)?.char).toBe('▼'); // bottom arrow
  const chars = allChars(buf, 1, 8);
  expect(chars).toContain('■'); // the thumb
  expect(chars).toContain('▒'); // the page track
});

// ST-14 — a horizontal ScrollBar draws ◄/► arrows (the horizontal glyph pair).
test('ST-14: a horizontal ScrollBar draws ◄/► arrows', () => {
  const g = new Group();
  const bar = new ScrollBar({ value: signal(0), min: 0, max: 100, orientation: 'horizontal' });
  bar.layout = { position: 'absolute', rect: { x: 0, y: 0, width: 8, height: 1 } };
  g.add(bar);
  const buf = render(g, 8, 1);
  expect(buf.get(0, 0)?.char).toBe('◄');
  expect(buf.get(7, 0)?.char).toBe('►');
});

// ST-14 — a disabled ScrollBar (range 0) fills its whole track with ▓ (TV's disabled shade).
test('ST-14: a disabled ScrollBar (max=0) fills the track with ▓', () => {
  const g = new Group();
  const bar = new ScrollBar({ value: signal(0), min: 0, max: 0, orientation: 'vertical' });
  bar.layout = { position: 'absolute', rect: { x: 0, y: 0, width: 1, height: 6 } };
  g.add(bar);
  const buf = render(g, 1, 6);
  // Every interior cell (between the arrows) is the ▓ disabled shade.
  for (let y = 1; y < 5; y += 1) expect(buf.get(0, y)?.char).toBe('▓');
});

// ST-14 — ListView: colour-only focus (no glyph/divider), text at column 1, focused>selected>normal.
test('ST-14: ListView focus is colour-only (no glyph/divider) with the TV colour priority', () => {
  const items = signal(['Alpha', 'Bravo', 'Charlie']);
  const g = new Group();
  const list = new ListBox({ items, focused: signal(0), selected: signal(1) });
  list.layout = { position: 'absolute', rect: { x: 0, y: 0, width: 12, height: 3 } };
  g.add(list);
  // The `listFocused` colour only applies to an ACTIVE list, so drive it through the loop + focus it
  // (TV: the focused-row colour needs `sfActive`; `tlstview.cpp:66`).
  const loop = createEventLoop({ width: 13, height: 3 }, { caps });
  loop.mount(g);
  loop.focusView(list.rows);
  const buf = loop.renderRoot.buffer(); // +1 col for the owned bar

  // Text is drawn at column 1 (TV curCol+1); column 0 is blank — NO focus marker glyph.
  expect(buf.get(0, 0)?.char).toBe(' ');
  expect(buf.get(1, 0)?.char).toBe('A'); // 'Alpha'

  // Colour priority: row 0 focused → listFocused; row 1 selected(not focused) → listSelected; row 2 normal.
  expect(buf.get(1, 0)?.bg).toBe(defaultTheme.listFocused.bg); // green
  expect(buf.get(1, 1)?.fg).toBe(defaultTheme.listSelected.fg); // yellow (distinct from normal)
  expect(buf.get(1, 2)?.fg).toBe(defaultTheme.listNormal.fg); // black

  // Single-column ⇒ no vertical divider glyph anywhere in the rows region.
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 12; x += 1) {
      const ch = buf.get(x, y)?.char;
      expect(ch).not.toBe('│');
      expect(ch).not.toBe('►'); // no TV focus marker
    }
  }
});

// ST-14 — the Dialog frame is drawn in the gray-`dialog` role: white border, close box, no zoom box (PA-19).
test('ST-14: the Dialog frame uses the dialog role — white border + close box, no zoom box', () => {
  const g = new Group();
  const dlg = new Dialog({ title: 'D' });
  dlg.layout = { position: 'absolute', padding: 1, rect: { x: 0, y: 0, width: 18, height: 6 } };
  g.add(dlg);
  const buf = render(g, 18, 6);
  // Active double-line border in the dialog border colour (white-on-lightGray).
  expect(buf.get(0, 0)?.char).toBe('╔');
  expect(buf.get(0, 0)?.fg).toBe(defaultTheme.dialog.border);
  // Close box [×] at cols 2–4.
  expect(buf.get(2, 0)?.char).toBe('[');
  expect(buf.get(3, 0)?.char).toBe('×');
  // No zoom box glyph anywhere on the title row.
  for (let x = 0; x < 18; x += 1) {
    expect(buf.get(x, 0)?.char).not.toBe('↑');
    expect(buf.get(x, 0)?.char).not.toBe('↕');
  }
});
