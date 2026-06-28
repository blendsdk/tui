/**
 * Specification tests — pluggable keymap (RD-06, Should-Have, PL-10).
 *
 * Immutable oracle: expectations derive from plan decision PL-10 (functional
 * `createKeymap(bindings) → lookup(KeyEvent)`, chord grammar, fail-fast on an
 * invalid binding) and 07-testing-strategy ST-13 — never from reading the
 * implementation.
 */
import { test, expect } from 'vitest';

import { createKeymap } from '../src/engine/input/keymap.js';
import type { KeyEvent } from '../src/engine/input/events.js';

/** Build a KeyEvent for a chord under test. */
function key(k: string, mods: Partial<Pick<KeyEvent, 'ctrl' | 'alt' | 'shift'>> = {}): KeyEvent {
  return { type: 'key', key: k, ctrl: false, alt: false, shift: false, ...mods };
}

// ---------------------------------------------------------------------------
// ST-13 — chord lookup, unbound miss, invalid-binding fail-fast
// ---------------------------------------------------------------------------

test('ST-13: a bound chord resolves to its name', () => {
  const keymap = createKeymap({ 'ctrl+s': 'save', 'alt+x': 'exit' });
  expect(keymap.lookup(key('s', { ctrl: true }))).toBe('save');
  expect(keymap.lookup(key('x', { alt: true }))).toBe('exit');
});

test('ST-13: an unbound chord returns undefined', () => {
  const keymap = createKeymap({ 'ctrl+s': 'save' });
  expect(keymap.lookup(key('s'))).toBe(undefined); // no ctrl held
  expect(keymap.lookup(key('q', { ctrl: true }))).toBe(undefined);
});

test('ST-13: an invalid binding throws at build time', () => {
  expect(() => createKeymap({ 'ctrl+': 'bad' })).toThrow(); // a binding with no key must throw
  expect(() => createKeymap({ 'hyper+s': 'bad' })).toThrow(); // an unknown modifier must throw
});
