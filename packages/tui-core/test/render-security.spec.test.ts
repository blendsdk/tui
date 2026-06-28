/**
 * Specification tests — output sanitization, the security boundary (RD-04,
 * AC-7/AC-8).
 *
 * Immutable oracle: expectations derive from RD-04's security acceptance
 * criteria and ST-7, ST-8, ST-14 in plan doc 07-testing-strategy (PL-2, PL-16,
 * the RD-08 sanitizer rule table) — never from reading the implementation.
 *
 * ST-8 uses an equality oracle: a call with the malicious string must produce
 * exactly the same output as the same call with the already-control-stripped
 * string. If sanitization is missing or partial, the two diverge.
 */
import { test, expect } from 'vitest';

import { sanitize } from '../src/engine/safety/sanitize.js';
import { notify, setTitle, hyperlink, setClipboard } from '../src/engine/render/osc.js';
import { serialize } from '../src/engine/render/serialize.js';
import { ScreenBuffer } from '../src/engine/render/buffer.js';
import type { Style } from '../src/engine/render/types.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { CapabilityProfile, DeepPartial } from '../src/engine/capability/index.js';

/** Untrusted text carrying an embedded OSC-injection attempt. */
const MALICIOUS = 'a\x1b]0;x\x07b';
/** The same text with ESC/BEL already removed (sanitize is identity on it). */
const BENIGN = 'a]0;xb';

const STYLE: Style = { fg: 'default', bg: 'default' };

function caps(override: DeepPartial<CapabilityProfile> = {}): CapabilityProfile {
  return resolveCapabilities({ env: {}, platform: 'linux', override }).profile;
}
function count(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

const TITLE_CAPS = caps({ osc: { title: true } });
const LINK_CAPS = caps({ unicode: { utf8: true }, osc: { hyperlink8: true } });
const CLIP_CAPS = caps({ osc: { clipboard52: true } });
const ITERM_CAPS = caps({
  osc: { notify9: true, notify99: false, notify777: false, progress9_4: false },
});

// ---------------------------------------------------------------------------
// ST-14 — sanitizer unit (AC-8)
// ---------------------------------------------------------------------------

test('ST-14: sanitize strips ESC and BEL from an injection attempt', () => {
  const out = sanitize(MALICIOUS);
  expect(!out.includes('\x1b')).toBeTruthy();
  expect(!out.includes('\x07')).toBeTruthy();
});

test('ST-14: sanitize preserves tab and newline in plain UTF-8', () => {
  expect(sanitize('héllo\tworld\n世')).toBe('héllo\tworld\n世');
});

test('ST-14: each control form is individually stripped', () => {
  expect(sanitize('\x1b')).toBe('');
  expect(sanitize('\x07')).toBe('');
  expect(sanitize('\x9c')).toBe('');
  expect(sanitize('a\x1b\\b')).toBe('ab');
  expect(sanitize('\x01')).toBe('');
  expect(sanitize('\x85')).toBe('');
});

// ---------------------------------------------------------------------------
// ST-8 — all text paths sanitized (AC-8)
// ---------------------------------------------------------------------------

/** Paint a string through the buffer + serializer text path. */
function paint(s: string): string {
  const buf = new ScreenBuffer(20, 1, { fg: 'default', bg: 'default' });
  buf.text(0, 0, s, STYLE);
  return serialize(buf, null, { caps: caps() });
}

test('ST-8: buffer text() path strips control bytes before serialize', () => {
  expect(paint(MALICIOUS)).toBe(paint(BENIGN));
  const out = paint(MALICIOUS);
  expect(!out.includes('\x07')).toBeTruthy();
  expect(!out.includes('\x1b]')).toBeTruthy();
});

test('ST-8: notify() body path strips control bytes', () => {
  expect(notify('t', MALICIOUS, ITERM_CAPS)).toBe(notify('t', BENIGN, ITERM_CAPS));
});

test('ST-8: setTitle() path strips control bytes', () => {
  expect(setTitle(MALICIOUS, TITLE_CAPS)).toBe(setTitle(BENIGN, TITLE_CAPS));
});

test('ST-8: hyperlink() text path strips control bytes', () => {
  expect(hyperlink(MALICIOUS, 'http://example.com', LINK_CAPS)).toBe(
    hyperlink(BENIGN, 'http://example.com', LINK_CAPS),
  );
});

test('ST-8: setClipboard() path strips control bytes before base64', () => {
  expect(setClipboard(MALICIOUS, CLIP_CAPS)).toBe(setClipboard(BENIGN, CLIP_CAPS));
});

// ---------------------------------------------------------------------------
// ST-7 — notify injection neutralized (AC-7)
// ---------------------------------------------------------------------------

test('ST-7: an injected sequence in the notify body cannot open a second OSC', () => {
  const out = notify('t', 'evil\x1b]0;pwned\x07', ITERM_CAPS);
  expect(count(out, '\x1b]')).toBe(1);
  expect(count(out, '\x07')).toBe(1);
});
