/**
 * Specification tests (immutable oracles) — RD-06 `Text` + `Label` (03-02).
 *
 * Source: jsvision-ui RD-06 AC-1/AC-2 → ST-03/ST-04 (essential-controls/07-testing-strategy.md).
 * TV sources: `tstatict.cpp` (word-wrap) · `tlabel.cpp` (link focus + highlight). Real `View`
 * subclasses + a real `RenderRoot`/`EventLoop` over fixed `caps`; buffers are read pre-`serialize`
 * for glyph/color assertions. Expectations derive from the TV geometry + theme roles, never from the
 * implementation.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, defaultTheme, PALETTE } from '@jsvision/core';
import type { KeyEvent, MouseEvent as CoreMouseEvent } from '@jsvision/core';
// (core's `MouseEvent` is the decoded terminal mouse event — 1-based coords, no key modifiers.)
import { View, Group, createRenderRoot } from '../src/view/index.js';
import type { DrawContext } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import { signal } from '../src/reactive/index.js';
import { Text, Label } from '../src/controls/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

/** Read row `y` of the buffer as a string (trailing blanks trimmed). */
function rowText(buf: ReturnType<ReturnType<typeof createRenderRoot>['buffer']>, y: number, width: number): string {
  let s = '';
  for (let x = 0; x < width; x++) s += buf.get(x, y)?.char ?? ' ';
  return s.replace(/\s+$/, '');
}

/** A focusable stub standing in for a `Label`'s linked control. */
class LinkStub extends View {
  override focusable = true;
  draw(_ctx: DrawContext): void {}
}

function key(k: string, mods: Partial<Pick<KeyEvent, 'alt' | 'ctrl' | 'shift'>> = {}): KeyEvent {
  return { type: 'key', key: k, ctrl: false, alt: false, shift: false, ...mods };
}

function mouseDown(x: number, y: number): CoreMouseEvent {
  return { type: 'mouse', kind: 'down', button: 0, x, y };
}

// ST-03 / AC-1 — Text word-wraps a long multi-word string across rows in `staticText`, and a
// reactive Text repaints when its bound getter changes.
test('ST-03: Text word-wraps on spaces across rows in the staticText role', () => {
  const text = new Text('the quick brown fox jumps');
  const rr = createRenderRoot({ width: 20, height: 5 }, { caps });
  rr.mount(text); // Text as root → full 20×5 viewport bounds

  const buf = rr.buffer();
  // Greedy fit at width 20: "the quick brown fox" (19) fits; "jumps" wraps to the next row.
  expect(rowText(buf, 0, 20)).toBe('the quick brown fox');
  expect(rowText(buf, 1, 20)).toBe('jumps');
  // Painted in the `staticText` role (black on lightGray).
  expect(buf.get(0, 0)?.fg).toBe(defaultTheme.staticText.fg);
  expect(buf.get(0, 0)?.bg).toBe(defaultTheme.staticText.bg);
  expect(PALETTE.black).toBe(defaultTheme.staticText.fg); // the worked example (black #000000)
});

test('ST-03: a reactive Text repaints when its bound getter changes', () => {
  const content = signal('hello');
  const text = new Text(() => content());
  const rr = createRenderRoot({ width: 20, height: 2 }, { caps });
  rr.mount(text);
  expect(rowText(rr.buffer(), 0, 20)).toBe('hello');

  content.set('world wide');
  rr.flush();
  expect(rowText(rr.buffer(), 0, 20)).toBe('world wide');
});

test('ST-03: Text is non-focusable (Tab skips it)', () => {
  const text = new Text('static');
  expect(text.focusable).toBe(false);
});

// ST-04 / AC-2 — a Label `~N~ame` linked to a control: hotkey accented in `labelShortcut`,
// `labelSelected` while the link is focused (else `label`), and a click / Alt-N focuses the link.
function mountLabel(): {
  loop: ReturnType<typeof createEventLoop>;
  label: Label;
  link: LinkStub;
  width: number;
} {
  const width = 20;
  const link = new LinkStub();
  const label = new Label('~N~ame', link);
  const root = new Group();
  // Column layout: each child is a fixed 1-row line; cross-axis (width) stretches to the 20-col root.
  root.layout = { direction: 'col' };
  label.layout = { size: { kind: 'fixed', cells: 1 } };
  link.layout = { size: { kind: 'fixed', cells: 1 } };
  root.add(label);
  root.add(link);
  const loop = createEventLoop({ width, height: 3 }, { caps });
  loop.mount(root);
  return { loop, label, link, width };
}

test('ST-04: Label accents its ~hotkey~ in labelShortcut and swaps to labelSelected on link focus', () => {
  const { loop, link, width } = mountLabel();
  const buf = loop.renderRoot.buffer();

  // Display text is "Name"; the 'N' hotkey is accented in `labelShortcut`, the rest in `label`.
  expect(rowText(buf, 0, width)).toBe('Name');
  expect(buf.get(0, 0)?.fg).toBe(defaultTheme.labelShortcut.fg); // 'N'
  expect(buf.get(1, 0)?.fg).toBe(defaultTheme.label.fg); // 'a' — unfocused base role
  expect(buf.get(1, 0)?.bg).toBe(defaultTheme.label.bg);

  // Focus the link → the base swaps to `labelSelected`; the hotkey stays `labelShortcut`.
  loop.focusView(link);
  const buf2 = loop.renderRoot.buffer();
  expect(buf2.get(1, 0)?.fg).toBe(defaultTheme.labelSelected.fg);
  expect(buf2.get(0, 0)?.fg).toBe(defaultTheme.labelShortcut.fg);
});

test('ST-04: a click on the Label focuses its link', () => {
  const { loop, link } = mountLabel();
  expect(loop.getFocused()).not.toBe(link);
  loop.dispatch(mouseDown(1, 1)); // 1-based (1,1) → absolute cell (0,0) = the label's first cell
  expect(loop.getFocused()).toBe(link);
});

test('ST-04: Alt-<hotkey> focuses the Label link from the post-process phase', () => {
  const { loop, link } = mountLabel();
  loop.dispatch(key('n', { alt: true }));
  expect(loop.getFocused()).toBe(link);
});
