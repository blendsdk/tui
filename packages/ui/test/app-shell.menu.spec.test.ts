/**
 * Specification tests (immutable oracles) — RD-05 nested menus (Phase 4).
 *
 * Source: RD-05 AC-16…AC-18 → ST-16, ST-17, ST-18 (codeops/features/jsvision-ui/plans/app-shell/
 * 03-04-menus.md). Real MenuBar/MenuPopup over the app overlay (no mocks); keys/clicks drive the
 * loop. A post-process spy view records emitted commands. Expectations derive from the acceptance
 * criteria + the documented navigation state machine, never the implementation.
 *
 * Trace: RD-05 03-04 · AR-68/AR-77 · ST-16, ST-17, ST-18.
 */
import { test, expect } from 'vitest';
import { resolveCapabilities } from '@jsvision/core';
import type { KeyEvent, MouseEvent } from '@jsvision/core';
import { View, Group } from '../src/view/index.js';
import type { DrawContext, DispatchEvent } from '../src/view/index.js';
import { createApplication } from '../src/app/index.js';
import { MenuPopup, menuBar, subMenu, item, separator } from '../src/menu/index.js';
import { Commands } from '../src/status/index.js';

const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function key(name: string, mods: Partial<KeyEvent> = {}): KeyEvent {
  return { type: 'key', key: name, ctrl: false, alt: false, shift: false, ...mods };
}
function mouseDown(x: number, y: number): MouseEvent {
  return { type: 'mouse', kind: 'down', button: 0, x: x + 1, y: y + 1 };
}

/** A post-process spy that records the command names routed to it. */
class CommandSpy extends View {
  readonly commands: string[] = [];
  constructor() {
    super();
    this.postProcess = true;
    this.state.visible = false;
  }
  draw(_ctx: DrawContext): void {}
  override onEvent(ev: DispatchEvent): void {
    if (ev.event.type === 'command') this.commands.push(ev.event.command);
  }
}

/** Build a composed app with a File/Edit menu bar + a command spy. */
function menuApp() {
  const bar = menuBar([
    subMenu('~F~ile', [
      item('~O~k', 'ok'),
      separator(),
      subMenu('~M~ore', [item('~D~eep', 'deep')]),
      item('E~x~it', Commands.quit),
    ]),
    subMenu('~E~dit', [item('~C~opy', 'copy')]),
  ]);
  const app = createApplication({ caps, menuBar: bar, viewport: { width: 40, height: 12 } });
  const spy = new CommandSpy();
  app.desktop.add(spy);
  app.loop.renderRoot.flush();
  const root = app.desktop.parent as Group;
  const overlay = root.children.find((c) => c.layout.position === 'absolute') as Group;
  return { app, overlay, spy };
}

function popupCount(overlay: Group): number {
  return overlay.children.filter((c) => c instanceof MenuPopup).length;
}

// ST-16 / AC-16 — builders build the bar; F10, a title click, and Alt+F each open the File popup.
test('ST-16: F10 / title click / Alt+F each open the File popup in the overlay', () => {
  const { app, overlay } = menuApp();
  expect(app.loop.renderRoot).toBeDefined(); // bar composed

  app.loop.dispatch(key('f10')); // open the first top-level (File)
  expect(overlay.state.visible).toBe(true);
  expect(popupCount(overlay)).toBe(1);

  app.loop.dispatch(key('escape')); // close
  expect(overlay.state.visible).toBe(false);
  expect(popupCount(overlay)).toBe(0);

  app.loop.dispatch(key('f', { alt: true })); // Alt+F opens File directly
  expect(popupCount(overlay)).toBe(1);

  app.loop.dispatch(key('escape'));
  app.loop.dispatch(mouseDown(1, 0)); // click the "File" title on the top row
  expect(popupCount(overlay)).toBe(1);
});

// ST-17 / AC-17 — nested navigation: ↓ skips a separator; a sub opens a nested popup; Esc closes one
// level; ←/→ switch top-level; Enter activates + closes.
test('ST-17: nested navigation (skip separator, sub-popup, Esc one level, ←→ switch, Enter)', () => {
  const { app, overlay, spy } = menuApp();
  app.loop.dispatch(key('f10')); // File open, highlight "Ok"
  app.loop.dispatch(key('down')); // skip the separator → highlight "More" (a submenu)
  app.loop.dispatch(key('enter')); // open the nested "More" popup
  expect(popupCount(overlay)).toBe(2); // File + More

  app.loop.dispatch(key('escape')); // close one level → back to File only
  expect(popupCount(overlay)).toBe(1);

  app.loop.dispatch(key('up')); // move highlight off the "More" submenu → back to "Ok"
  app.loop.dispatch(key('right')); // a non-sub highlight ⇒ switch top-level File → Edit
  app.loop.dispatch(key('enter')); // activate Edit's only item "Copy"
  expect(spy.commands).toContain('copy');
  expect(overlay.state.visible).toBe(false); // activation closes the whole menu
});

// ST-18 / AC-18 — activation emits via the loop; a disabled command greys + is non-activatable;
// re-enabling restores it.
test('ST-18: activation emits the command; disabled is non-activatable; re-enabling restores it', () => {
  const { app, overlay, spy } = menuApp();
  app.loop.enableCommand('ok', false); // disable the "Ok" command

  app.loop.dispatch(key('f10')); // File open, highlight "Ok"
  app.loop.dispatch(key('enter')); // "Ok" is disabled → no-op (no emit, menu stays open)
  expect(spy.commands).not.toContain('ok');
  expect(overlay.state.visible).toBe(true);

  app.loop.enableCommand('ok', true); // re-enable
  app.loop.dispatch(key('enter')); // now activatable
  expect(spy.commands).toContain('ok');
  expect(overlay.state.visible).toBe(false);
});
