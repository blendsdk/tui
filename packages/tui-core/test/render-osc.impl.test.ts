/**
 * Implementation tests — OSC feature edge cases (RD-04, plan doc 03-04).
 *
 * Unsupported-capability degradation, notify-ladder priority when several flags
 * are set, multibyte base64, and the bell. Complements the ST-6/7/10/12 oracles.
 */
import { test, expect } from 'vitest';

import { hyperlink, setClipboard, setTitle, bell, notify } from '../src/engine/render/osc.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { CapabilityProfile, DeepPartial } from '../src/engine/capability/index.js';

function caps(override: DeepPartial<CapabilityProfile> = {}): CapabilityProfile {
  return resolveCapabilities({ env: {}, platform: 'linux', override }).profile;
}

test('hyperlink without support returns sanitized plain text (no escape)', () => {
  const out = hyperlink('click', 'http://x', caps({ osc: { hyperlink8: false } }));
  expect(out).toBe('click');
});

test('setClipboard without support returns empty string', () => {
  expect(setClipboard('hi', caps({ osc: { clipboard52: false } }))).toBe('');
});

test('setTitle without support returns empty string', () => {
  expect(setTitle('My App', caps({ osc: { title: false } }))).toBe('');
});

test('bell is a single BEL byte', () => {
  expect(bell()).toBe('\x07');
  expect(bell().length).toBe(1);
});

test('notify ladder: OSC 99 wins when every flag is set', () => {
  const all = caps({
    osc: { notify99: true, notify9: true, notify777: true, progress9_4: true },
  });
  expect(notify('t', 'b', all).startsWith('\x1b]99;')).toBeTruthy();
});

test('notify ladder: OSC 9 wins over 777 and progress when 99 is off', () => {
  const c = caps({
    osc: { notify99: false, notify9: true, notify777: true, progress9_4: true },
  });
  expect(notify('t', 'b', c).startsWith('\x1b]9;')).toBeTruthy();
});

test('notify ladder: progress 9;4 is used when only it is available', () => {
  const c = caps({
    osc: { notify99: false, notify9: false, notify777: false, progress9_4: true },
  });
  expect(notify('t', 'b', c)).toBe('\x1b]9;4;1;0\x07');
});

test('setClipboard base64-encodes multibyte UTF-8 correctly', () => {
  const out = setClipboard('世界', caps({ osc: { clipboard52: true } }));
  const payload = out.slice('\x1b]52;c;'.length, out.length - 1);
  expect(Buffer.from(payload, 'base64').toString('utf8')).toBe('世界');
});
