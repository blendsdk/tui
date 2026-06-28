/**
 * Specification tests — DOS-16 palette & semantic theme (RD-05).
 *
 * Immutable oracle: expectations derive from RD-05 Must-Have (DOS-16 palette +
 * semantic theme) and AR-9 via ST-15/ST-16 in plan doc 07-testing-strategy —
 * never from reading the implementation. Hex values are the documented Borland
 * palette (03-02), including the `brightMagenta` the prototype omitted.
 */
import { test, expect } from 'vitest';

import { PALETTE, defaultTheme, encode } from '../src/engine/color/index.js';

// ST-15 — the full DOS-16 palette at the documented hex; every value is a valid color.
test('ST-15: PALETTE holds the 16 DOS colors at the documented hex', () => {
  expect(PALETTE).toStrictEqual({
    black: '#000000',
    blue: '#0000aa',
    green: '#00aa00',
    cyan: '#00aaaa',
    red: '#aa0000',
    magenta: '#aa00aa',
    brown: '#aa5500',
    lightGray: '#aaaaaa',
    darkGray: '#555555',
    brightBlue: '#5555ff',
    brightGreen: '#55ff55',
    brightCyan: '#55ffff',
    brightRed: '#ff5555',
    brightMagenta: '#ff55ff',
    yellow: '#ffff55',
    white: '#ffffff',
  });
  expect(Object.keys(PALETTE).length).toBe(16);
  // Every palette value is a valid color (encodes without throwing).
  for (const value of Object.values(PALETTE)) {
    expect(() => encode(value, 'fg', 'truecolor')).not.toThrow();
  }
});

// ST-16 — the default theme exposes the migrated semantic roles wired to colors.
test('ST-16: defaultTheme exposes the semantic roles', () => {
  for (const role of [
    'desktop',
    'menuBar',
    'menuSelected',
    'window',
    'dialog',
    'button',
    'buttonFocused',
    'statusBar',
    'shadow',
  ] as const) {
    expect(role in defaultTheme).toBeTruthy();
  }
  expect(defaultTheme.desktop.pattern).toBe('░');
  expect(defaultTheme.desktop.fg).toBe(PALETTE.lightGray);
  expect(defaultTheme.menuBar.bg).toBe(PALETTE.lightGray);
});
