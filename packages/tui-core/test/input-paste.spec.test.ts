/**
 * Specification tests — bracketed paste (RD-06, AC-5).
 *
 * Immutable oracle: expectations derive from RD-06's acceptance criterion AC-5
 * (a bracketed paste is delivered as a single PasteEvent, never as keystrokes)
 * and plan doc 03-03 / 07-testing-strategy ST-5 — never from reading the
 * implementation.
 */
import { test, expect } from 'vitest';

import { createDecoderState, decode } from '../src/engine/input/decoder.js';
import type { PasteEvent } from '../src/engine/input/events.js';

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// ST-5 — a bracketed paste decodes to exactly one PasteEvent, zero KeyEvents
// ---------------------------------------------------------------------------

test('ST-5: ESC[200~hello ESC[201~ → one PasteEvent, no key events', () => {
  const r = decode(enc.encode('\x1b[200~hello\x1b[201~'), createDecoderState());

  expect(r.events.length).toBe(1);
  const paste = r.events[0] as PasteEvent;
  expect(paste.type).toBe('paste');
  expect(paste.text).toBe('hello');
  expect(paste.truncated).toBe(false);

  // No key events leaked from the pasted content.
  const keys = r.events.filter((e) => e.type === 'key');
  expect(keys.length).toBe(0);
});
