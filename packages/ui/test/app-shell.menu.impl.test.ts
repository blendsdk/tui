/**
 * Implementation tests — RD-05 nested menus (Phase 4). Internals + edge cases not pinned by the
 * spec oracles: tilde parsing, title layout/hit-test, separator/disabled skipping, nested
 * open/close, on-screen popup clamping, click-outside close + focus restore, pre-process
 * consumption (an open menu's nav key never reaches the focused window), and popup-row clicks.
 *
 * Trace: RD-05 03-04 · AR-68/AR-77 · PA-2/PA-9/PF-06/PF-10.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities, defaultTheme } from '@jsvision/core';
import type { KeyEvent, MouseEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext, DispatchEvent } from '../src/view/index.js';
import { createApplication } from '../src/app/index.js';
import {
  MenuBar,
  MenuPopup,
  menuBar,
  subMenu,
  item,
  separator,
  parseTilde,
  layoutTitles,
  titleIndexAt,
} from '../src/menu/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function key(name: string, mods: Partial<KeyEvent> = {}): KeyEvent {
  return { type: 'key', key: name, ctrl: false, alt: false, shift: false, ...mods };
}
function mouseDown(x: number, y: number): MouseEvent {
  return { type: 'mouse', kind: 'down', button: 0, x: x + 1, y: y + 1 };
}

/** A focusable leaf that records the keys its onEvent receives (to prove pre-process consumption). */
class KeyRecorder extends View {
  readonly keys: string[] = [];
  constructor() {
    super();
    this.focusable = true;
  }
  draw(_ctx: DrawContext): void {}
  override onEvent(ev: DispatchEvent): void {
    if (ev.event.type === 'key') this.keys.push(ev.event.key);
  }
}

function popups(overlay: Group): MenuPopup[] {
  return overlay.children.filter((c): c is MenuPopup => c instanceof MenuPopup);
}

function menuApp(viewport = { width: 40, height: 12 }) {
  const bar = menuBar([
    subMenu('~F~ile', [item('~O~k', 'ok'), separator(), subMenu('~M~ore', [item('~D~eep', 'deep')])]),
    subMenu('~E~dit', [item('~C~opy', 'copy')]),
  ]);
  const app = createApplication({ caps, menuBar: bar, viewport });
  const root = app.desktop.parent as Group;
  const overlay = root.children.find((c) => c.layout.position === 'absolute') as Group;
  app.loop.renderRoot.flush();
  return { app, bar, overlay };
}

// --- Tilde parsing (AR-77) ----------------------------------------------------------------------

test('parseTilde: ~F~ile → text "File", hotkey "f" at column 0', () => {
  expect(parseTilde('~F~ile')).toEqual({ text: 'File', hotkey: 'f', hotkeyCol: 0 });
});

test('parseTilde: an embedded ~x~ keeps the prefix and reports the inner column', () => {
  expect(parseTilde('E~x~it')).toEqual({ text: 'Exit', hotkey: 'x', hotkeyCol: 1 });
});

test('parseTilde: a label with no ~X~ pair has no hotkey', () => {
  expect(parseTilde('Plain')).toEqual({ text: 'Plain', hotkey: null, hotkeyCol: -1 });
});

// --- Title layout + hit-test (the bar's click mapping) -------------------------------------------

test('layoutTitles + titleIndexAt: File at x=1, Edit after the gap; x maps back to the index', () => {
  const tops = [subMenu('~F~ile', []), subMenu('~E~dit', [])];
  const [file, edit] = layoutTitles(tops);
  expect(file).toMatchObject({ index: 0, x: 1, width: 4 });
  expect(edit).toMatchObject({ index: 1, x: 7 }); // 1 + 4 + gap(2)
  expect(titleIndexAt(tops, 1)).toBe(0);
  expect(titleIndexAt(tops, 8)).toBe(1);
  expect(titleIndexAt(tops, 5)).toBeNull(); // in the gap between titles
});

// --- Nav skipping + nested open/close -----------------------------------------------------------

test('↓ skips a separator; Esc on the only level closes the whole menu', () => {
  const { app, overlay } = menuApp();
  app.loop.dispatch(key('f10')); // File, highlight Ok (row 0)
  const file = popups(overlay)[0];
  expect(file.highlight).toBe(0);
  app.loop.dispatch(key('down')); // row 1 is the separator → skip to "More" (row 2)
  expect(file.highlight).toBe(2);

  app.loop.dispatch(key('escape')); // single level → close everything
  expect(overlay.state.visible).toBe(false);
  expect(popups(overlay).length).toBe(0);
});

test('a disabled command is skipped by ↓ but may sit under the initial highlight', () => {
  const { app, overlay } = menuApp();
  app.loop.enableCommand('ok', false); // disable the first item
  app.loop.dispatch(key('f10'));
  const file = popups(overlay)[0];
  expect(file.highlight).toBe(0); // initial highlight still lands on the (disabled) first item
  app.loop.dispatch(key('down')); // skip the disabled Ok AND the separator → "More" (row 2)
  expect(file.highlight).toBe(2);
});

// --- On-screen clamping (PA-2) ------------------------------------------------------------------

test('a top-level menu near the right edge clamps its popup fully on-screen', () => {
  const { app, overlay } = menuApp({ width: 10, height: 12 }); // Edit title sits near the right edge
  app.loop.dispatch(key('e', { alt: true })); // open Edit directly
  const popup = popups(overlay)[0];
  const rect = popup.layout.rect;
  expect(rect).toBeDefined();
  if (rect !== undefined) {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(10); // clamped within the 10-col viewport
  }
});

// --- Click-outside close + focus restore (PF-06 / PA-2) -----------------------------------------

test('an outside mouse-down closes the menu and restores the prior focus', () => {
  const { app, overlay } = menuApp();
  const focusTarget = new KeyRecorder();
  app.desktop.add(focusTarget);
  app.loop.focusView(focusTarget);
  expect(app.loop.getFocused()).toBe(focusTarget);

  app.loop.dispatch(key('f10')); // open (saves focusTarget)
  expect(overlay.state.visible).toBe(true);

  app.loop.dispatch(mouseDown(20, 8)); // click empty desktop → the catcher closes the menu
  expect(overlay.state.visible).toBe(false);
  expect(popups(overlay).length).toBe(0);
  expect(app.loop.getFocused()).toBe(focusTarget); // focus restored
});

// --- Pre-process consumption (an open menu's nav keys never reach the focused window) ------------

test('while a menu is open, ↓/Enter are consumed and never reach the focused view', () => {
  const { app, overlay } = menuApp();
  const focusTarget = new KeyRecorder();
  app.desktop.add(focusTarget);
  app.loop.focusView(focusTarget);

  app.loop.dispatch(key('f10'));
  app.loop.dispatch(key('down')); // nav — consumed by the bar
  app.loop.dispatch(key('up')); // nav — consumed by the bar
  expect(focusTarget.keys).not.toContain('down');
  expect(focusTarget.keys).not.toContain('up');

  // With the menu closed, a plain key DOES reach the focused view.
  app.loop.dispatch(key('escape')); // close
  expect(overlay.state.visible).toBe(false);
  app.loop.dispatch(key('a'));
  expect(focusTarget.keys).toContain('a');
});

// --- Popup-row click (mouse activation) ----------------------------------------------------------

test('clicking an enabled popup row activates its command and closes the menu', () => {
  const { app, overlay } = menuApp();
  const commands: string[] = [];
  const spy = new (class extends View {
    constructor() {
      super();
      this.postProcess = true;
      this.state.visible = false;
    }
    draw(_ctx: DrawContext): void {}
    override onEvent(ev: DispatchEvent): void {
      if (ev.event.type === 'command') commands.push(ev.event.command);
    }
  })();
  app.desktop.add(spy);

  app.loop.dispatch(key('f10')); // open File
  const file = popups(overlay)[0];
  const rect = file.layout.rect;
  expect(rect).toBeDefined();
  if (rect !== undefined) {
    app.loop.dispatch(mouseDown(rect.x + 1, rect.y + 1)); // click the first item row ("Ok")
  }
  expect(commands).toContain('ok');
  expect(overlay.state.visible).toBe(false);
});

// --- attach wires the controller -----------------------------------------------------------------

test('a MenuBar is inert until attached; createApplication attaches it', () => {
  const bare = new MenuBar();
  expect(bare.controller).toBeNull(); // unattached
  const { bar } = menuApp();
  expect(bar.controller).not.toBeNull(); // createApplication attached it
});

// --- TV-faithful box shape & size (TMenuBox::getRect / frameLine) --------------------------------

/** One composed buffer row of a popup, as a string (popup is in the full-viewport overlay = absolute). */
function popupRow(app: ReturnType<typeof menuApp>['app'], popup: MenuPopup, row: number): string {
  const r = popup.layout.rect ?? { x: 0, y: 0, width: 0, height: 0 };
  const buf = app.loop.renderRoot.buffer();
  let s = '';
  for (let x = 0; x < r.width; x += 1) s += buf.get(r.x + x, r.y + row)?.char ?? ' ';
  return s;
}

test('popup width follows TV getRect: name + 6, +key+2 for a shortcut, floored at 10', () => {
  // "Tools" (5) + 6 + "Ctrl+K" (6) + 2 = 19; a bare item floors at 10.
  const bar = menuBar([subMenu('~T~', [item('~T~ools', 'tools', 'Ctrl+K'), item('~A~', 'a')])]);
  const app = createApplication({ caps, menuBar: bar, viewport: { width: 40, height: 12 } });
  const root = app.desktop.parent as Group;
  const overlay = root.children.find((c) => c.layout.position === 'absolute') as Group;
  app.loop.renderRoot.flush();
  app.loop.dispatch(key('t', { alt: true }));
  const popup = popups(overlay)[0];
  expect(popup.layout.rect?.width).toBe(19); // widest item drives the box
  expect(popup.layout.rect?.height).toBe(2 + 2); // items + top/bottom border
});

test('popup draws the TV box: gutter + inset single-line frame, padded text, ├─┤ separator, ► sub, right-aligned key', () => {
  const { app, overlay } = menuApp();
  app.loop.dispatch(key('f10')); // open File: Ok / separator / More(sub)
  const file = popups(overlay)[0];
  const w = file.layout.rect?.width ?? 0;

  const top = popupRow(app, file, 0);
  expect(top[0]).toBe(' '); // blank gutter column (TV inset)
  expect(top[1]).toBe('┌'); // border one column in
  expect(top[w - 2]).toBe('┐');
  expect(top[w - 1]).toBe(' '); // right gutter

  const ok = popupRow(app, file, 1); // first item row
  expect(ok[1]).toBe('│'); // side border
  expect(ok.slice(3)).toContain('Ok'); // text padded to col 3 (gutter+border+pad)

  const sep = popupRow(app, file, 2); // separator joins the borders with tees
  expect(sep[1]).toBe('├');
  expect(sep[w - 2]).toBe('┤');

  const more = popupRow(app, file, 3); // a submenu row shows the ► cascade marker near the right border
  expect(more).toContain('►');
  expect(more[w - 4]).toBe('►');
});

test('the menu box casts a TV drop-shadow over what is behind it (sfShadow)', () => {
  const { app, overlay } = menuApp({ width: 40, height: 12 });
  app.loop.dispatch(key('f10')); // open File
  const file = popups(overlay)[0];
  expect(file.castsShadow).toBe(true);
  const r = file.layout.rect ?? { x: 0, y: 0, width: 0, height: 0 };
  // One column right of the box, one row down from its top edge, is darkened to the shadow role.
  const cell = app.loop.renderRoot.buffer().get(r.x + r.width, r.y + 1);
  expect(cell?.bg).toBe(defaultTheme.shadow.bg);
});

test('an item key shortcut is drawn right-aligned (TV size.x-3-len)', () => {
  const bar = menuBar([subMenu('~F~', [item('E~x~it', 'quit', 'Alt-X')])]);
  const app = createApplication({ caps, menuBar: bar, viewport: { width: 40, height: 12 } });
  const root = app.desktop.parent as Group;
  const overlay = root.children.find((c) => c.layout.position === 'absolute') as Group;
  app.loop.renderRoot.flush();
  app.loop.dispatch(key('f', { alt: true }));
  const popup = popups(overlay)[0];
  const w = popup.layout.rect?.width ?? 0;
  const rowText = popupRow(app, popup, 1);
  // "Alt-X" ends at col w-4 (right border at w-2, one pad at w-3).
  expect(rowText.slice(w - 3 - 'Alt-X'.length, w - 3)).toBe('Alt-X');
});
