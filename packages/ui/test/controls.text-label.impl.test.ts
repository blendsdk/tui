/**
 * Implementation tests — RD-06 `Text` + `Label` edge cases (03-02).
 *
 * Over-long-word hard-break (TV `tstatict.cpp:74`), a hotkey-less label, and focusing a disabled
 * (non-focusable) link being inert. Real `View`/`RenderRoot`/`EventLoop`; buffers read pre-serialize.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, defaultTheme } from '@jsvision/core';
import type { KeyEvent, MouseEvent as CoreMouseEvent } from '@jsvision/core';
import { View, Group, createRenderRoot } from '../src/view/index.js';
import type { DrawContext } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import { Text, Label } from '../src/controls/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

class LinkStub extends View {
  override focusable = true;
  draw(_ctx: DrawContext): void {}
}

function rowText(buf: ReturnType<ReturnType<typeof createRenderRoot>['buffer']>, y: number, width: number): string {
  let s = '';
  for (let x = 0; x < width; x++) s += buf.get(x, y)?.char ?? ' ';
  return s.replace(/\s+$/, '');
}

function mouseDown(x: number, y: number): CoreMouseEvent {
  return { type: 'mouse', kind: 'down', button: 0, x, y };
}

function altKey(k: string): KeyEvent {
  return { type: 'key', key: k, ctrl: false, alt: true, shift: false };
}

test('Text hard-breaks a single word longer than the view width at the width boundary', () => {
  const text = new Text('abcdefghijklmnop'); // 16 chars, width 10
  const rr = createRenderRoot({ width: 10, height: 3 }, { caps });
  rr.mount(text);
  const buf = rr.buffer();
  expect(rowText(buf, 0, 10)).toBe('abcdefghij'); // first 10
  expect(rowText(buf, 1, 10)).toBe('klmnop'); // remainder wraps
});

test('a hotkey-less Label paints entirely in the base role and still focuses on click', () => {
  const link = new LinkStub();
  const label = new Label('Name', link); // no ~X~
  const root = new Group();
  root.layout = { direction: 'col' };
  label.layout = { size: { kind: 'fixed', cells: 1 } };
  link.layout = { size: { kind: 'fixed', cells: 1 } };
  root.add(label);
  root.add(link);
  const loop = createEventLoop({ width: 20, height: 3 }, { caps });
  loop.mount(root);

  const buf = loop.renderRoot.buffer();
  expect(rowText(buf, 0, 20)).toBe('Name');
  // Every painted cell is the base `label` role — no `labelShortcut` accent anywhere.
  for (let x = 0; x < 4; x++) {
    expect(buf.get(x, 0)?.fg).toBe(defaultTheme.label.fg);
  }
  // A click still focuses the link (hotkey-less labels remain clickable).
  loop.dispatch(mouseDown(1, 1));
  expect(loop.getFocused()).toBe(link);
});

test('focusing a disabled link is inert (click and Alt-hotkey do not move focus)', () => {
  const link = new LinkStub();
  link.state.disabled = true; // non-focusable → focus manager refuses it
  const label = new Label('~N~ame', link);
  const root = new Group();
  root.layout = { direction: 'col' };
  label.layout = { size: { kind: 'fixed', cells: 1 } };
  link.layout = { size: { kind: 'fixed', cells: 1 } };
  root.add(label);
  root.add(link);
  const loop = createEventLoop({ width: 20, height: 3 }, { caps });
  loop.mount(root);

  loop.dispatch(mouseDown(1, 1));
  expect(loop.getFocused()).not.toBe(link);
  loop.dispatch(altKey('n'));
  expect(loop.getFocused()).not.toBe(link);
});
