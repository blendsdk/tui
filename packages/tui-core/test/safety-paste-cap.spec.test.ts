/**
 * Specification tests — the paste-cap security boundary (RD-08; AC-7/AC-8, AR-11).
 *
 * Immutable oracle: expectations derive from RD-08 AC-7/AC-8 via ST-24/ST-25 in
 * plan doc 07-testing-strategy — never from reading the implementation. RD-08
 * adds NO new runtime code here (AR-11): the cap is already defined and enforced
 * in the RD-06 decoder; these tests own the RD-08 acceptance framing of that
 * boundary (cap+1 → truncated, and DoS-bounded behavior on a flood).
 */
import { test, expect } from 'vitest';

import { createDecoderState, decode, PASTE_CAP_BYTES } from '../src/engine/input/index.js';
import type { DecoderState } from '../src/engine/input/index.js';

const enc = new TextEncoder();

// ST-24 — a paste of exactly cap+1 ASCII bytes is truncated to exactly the cap.
test('ST-24: a cap+1 byte paste yields truncated:true clipped to PASTE_CAP_BYTES', () => {
  const content = 'a'.repeat(PASTE_CAP_BYTES + 1); // ASCII filler → byte count === char count
  const result = decode(enc.encode(`\x1b[200~${content}\x1b[201~`), createDecoderState());

  const paste = result.events.find((e) => e.type === 'paste');
  expect(paste && paste.type === 'paste').toBeTruthy();
  expect(paste.truncated).toBe(true);
  expect(Buffer.byteLength(paste.text, 'utf8')).toBe(PASTE_CAP_BYTES);
});

// ST-25 — a flood far over the cap stays bounded: one truncated paste, capped text.
test('ST-25: a paste far over the cap stays bounded — one truncated paste, no runaway buffer', () => {
  let state: DecoderState = createDecoderState();
  const events = [];

  // Feed the start marker, then four cap-sized chunks (4× cap total), then the end.
  let result = decode(enc.encode('\x1b[200~'), state);
  state = result.state;
  events.push(...result.events);
  for (let i = 0; i < 4; i += 1) {
    result = decode(enc.encode('a'.repeat(PASTE_CAP_BYTES)), state);
    state = result.state;
    events.push(...result.events);
  }
  result = decode(enc.encode('\x1b[201~'), state);
  state = result.state;
  events.push(...result.events);

  const pastes = events.filter((e) => e.type === 'paste');
  expect(pastes.length).toBe(1);
  const paste = pastes[0];
  expect(paste.type === 'paste').toBeTruthy();
  expect(paste.truncated).toBe(true);
  expect(Buffer.byteLength(paste.text, 'utf8')).toBe(PASTE_CAP_BYTES);
});
