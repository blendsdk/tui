/**
 * Specification tests (immutable oracles) — RD-06 `Button` (03-03).
 *
 * Source: jsvision-ui RD-06 AC-3 → ST-05/ST-06 (essential-controls/07-testing-strategy.md).
 * TV source: `tbutton.cpp:66-275` (drawState shadow `▄`/`█`/`▀`, state→role, activate) +
 * `tvtext1.cpp` glyphs. Real `View`/`RenderRoot`/`EventLoop` over fixed `caps`; buffers read
 * pre-serialize. The label is centered with NO `[ ]` brackets — TV's `markers` are `showMarkers`-only
 * (monochrome), off on a color palette (`tbutton.cpp:154-158`). The shadow oracle asserts the TV
 * block-glyph shadow (PF-007) in the `buttonShadow` role — TV `cShadow = getColor(8)` resolves
 * `cpButton[8]=0x0F` → cpGrayDialog slot 15 → `cpAppColor[0x2E]=0x70` = black-on-lightGray, the dialog
 * background with black ink (NOT the window drop-shadow). Expectations derive from the TV geometry +
 * theme roles, never from the implementation.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, defaultTheme } from '@jsvision/core';
import type { KeyEvent, MouseEvent as CoreMouseEvent } from '@jsvision/core';
import { View, Group, createRenderRoot } from '../src/view/index.js';
import type { DrawContext, DispatchEvent } from '../src/view/index.js';
import { createEventLoop } from '../src/event/index.js';
import { Button } from '../src/controls/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function key(k: string, mods: Partial<Pick<KeyEvent, 'alt' | 'ctrl' | 'shift'>> = {}): KeyEvent {
  return { type: 'key', key: k, ctrl: false, alt: false, shift: false, ...mods };
}
function mouse(kind: 'down' | 'up', x: number, y: number): CoreMouseEvent {
  return { type: 'mouse', kind, button: 0, x, y };
}

/** A post-process view that records every command name dispatched on the tick. */
class CommandSpy extends View {
  override postProcess = true;
  readonly commands: string[] = [];
  draw(_ctx: DrawContext): void {}
  override onEvent(ev: DispatchEvent): void {
    if (ev.event.type === 'command') this.commands.push(ev.event.command);
  }
}

// ST-05 / AC-3 — an OK button draws the TV block-glyph shadow and picks its face role per state.
// Geometry (width 8, height 2): TV drawState → s=7, T=0; l = (s - 2 - 1)/2 = 2, indent i=1, so "OK"
// centers at cols 3..4. NO brackets (showMarkers off). Shadow: `▄`@col 7 row 0, `▀` across cols 2..7
// on the bottom row, all in the `buttonShadow` role (0x70 black-on-lightGray).
test('ST-05: Button draws a centered OK (no brackets) with the ▄/█/▀ block-glyph shadow + accent', () => {
  const btn = new Button('~O~K', { default: true });
  const rr = createRenderRoot({ width: 8, height: 2 }, { caps });
  rr.mount(btn);
  const buf = rr.buffer();

  // Centered title, no `[ ]` markers (color palette): cols 1 and 6 are plain face padding.
  expect(buf.get(3, 0)?.char).toBe('O');
  expect(buf.get(4, 0)?.char).toBe('K');
  expect(buf.get(1, 0)?.char).toBe(' ');
  expect(buf.get(6, 0)?.char).toBe(' ');
  // Hotkey 'O' accented in buttonShortcut; the rest in buttonDefault (default + unfocused).
  expect(buf.get(3, 0)?.fg).toBe(defaultTheme.buttonShortcut.fg);
  expect(buf.get(4, 0)?.fg).toBe(defaultTheme.buttonDefault.fg);

  // TV block-glyph shadow in the `buttonShadow` role: right column `▄` (top), bottom row `▀` across.
  expect(buf.get(7, 0)?.char).toBe('▄');
  expect(buf.get(7, 0)?.fg).toBe(defaultTheme.buttonShadow.fg);
  expect(buf.get(7, 0)?.bg).toBe(defaultTheme.buttonShadow.bg);
  expect(buf.get(2, 1)?.char).toBe('▀');
  expect(buf.get(7, 1)?.char).toBe('▀');
});

test('ST-05: Button face role is buttonFocused when focused', () => {
  const btn = new Button('~O~K', { default: true });
  const rr = createRenderRoot({ width: 8, height: 2 }, { caps });
  rr.mount(btn);
  btn.state.focused = true;
  btn.invalidate();
  rr.flush();
  expect(rr.buffer().get(4, 0)?.fg).toBe(defaultTheme.buttonFocused.fg);
});

test('ST-05: Button face role is buttonDisabled when disabled', () => {
  const btn = new Button('~O~K', { disabled: true });
  const rr = createRenderRoot({ width: 8, height: 2 }, { caps });
  rr.mount(btn);
  expect(rr.buffer().get(4, 0)?.fg).toBe(defaultTheme.buttonDisabled.fg);
});

// ST-06 / AC-3 — activation paths: click, Space (focused), Alt-O, Enter (default); disabled inert.
function mountButton(opts: { default?: boolean; disabled?: boolean } = {}): {
  loop: ReturnType<typeof createEventLoop>;
  btn: Button;
  spy: CommandSpy;
  clicks: () => number;
} {
  let clicks = 0;
  const btn = new Button('~O~K', { command: 'ok', onClick: () => (clicks += 1), ...opts });
  const spy = new CommandSpy();
  const root = new Group();
  root.layout = { direction: 'col' };
  btn.layout = { size: { kind: 'fixed', cells: 2 } };
  spy.layout = { size: { kind: 'fixed', cells: 1 } };
  root.add(btn);
  root.add(spy);
  const loop = createEventLoop({ width: 8, height: 3 }, { caps });
  loop.mount(root);
  return { loop, btn, spy, clicks: () => clicks };
}

test('ST-06: a click (down+up inside) activates — emits command + calls onClick', () => {
  const { loop, spy, clicks } = mountButton();
  loop.dispatch(mouse('down', 2, 1)); // 1-based → face cell (1,0)
  loop.dispatch(mouse('up', 2, 1));
  expect(spy.commands).toEqual(['ok']);
  expect(clicks()).toBe(1);
});

test('ST-06: Space activates the focused button', () => {
  const { loop, btn, spy, clicks } = mountButton();
  loop.focusView(btn);
  loop.dispatch(key('space'));
  expect(spy.commands).toEqual(['ok']);
  expect(clicks()).toBe(1);
});

test('ST-06: Alt-<hotkey> activates the button from the post-process phase', () => {
  const { loop, spy, clicks } = mountButton();
  loop.dispatch(key('o', { alt: true }));
  expect(spy.commands).toEqual(['ok']);
  expect(clicks()).toBe(1);
});

test('ST-06: a default button activates on Enter when unconsumed', () => {
  const { loop, spy, clicks } = mountButton({ default: true });
  loop.dispatch(key('enter'));
  expect(spy.commands).toEqual(['ok']);
  expect(clicks()).toBe(1);
});

test('ST-06: a disabled button never activates (no emit, no onClick)', () => {
  const { loop, btn, spy, clicks } = mountButton({ disabled: true });
  loop.dispatch(mouse('down', 2, 1));
  loop.dispatch(mouse('up', 2, 1));
  loop.dispatch(key('enter'));
  loop.dispatch(key('o', { alt: true }));
  expect(spy.commands).toEqual([]);
  expect(clicks()).toBe(0);
  expect(btn.state.disabled).toBe(true); // greyed + non-focusable
});
