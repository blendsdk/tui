/**
 * Implementation tests — bracketed paste internals (RD-06, Session 3.3).
 *
 * Edge coverage of the paste assembly in `decoder.ts` + `paste.ts`: a paste
 * split across many chunks, a paste whose content looks like escape sequences
 * (kept literal, never decoded as keys), and an empty paste. Complements the
 * ST-5 spec oracle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDecoderState, decode } from '../src/engine/input/decoder.js';
import type { DecoderState, InputEvent, PasteEvent } from '../src/engine/input/events.js';

const enc = new TextEncoder();

/** Feed each chunk through decode(), threading state, and collect all events. */
function feed(chunks: string[]): InputEvent[] {
  let state: DecoderState = createDecoderState();
  const events: InputEvent[] = [];
  for (const chunk of chunks) {
    const r = decode(enc.encode(chunk), state);
    events.push(...r.events);
    state = r.state;
  }
  return events;
}

test('paste: content split across many chunks assembles into one event', () => {
  const events = feed(['\x1b[200~ab', 'cd', 'ef\x1b[201~']);
  assert.equal(events.length, 1);
  const paste = events[0] as PasteEvent;
  assert.equal(paste.type, 'paste');
  assert.equal(paste.text, 'abcdef');
  assert.equal(paste.truncated, false);
});

test('paste: a partial end marker split across chunks still closes correctly', () => {
  // The end marker ESC[201~ is split between two chunks.
  const events = feed(['\x1b[200~hi\x1b[20', '1~']);
  assert.equal(events.length, 1);
  assert.equal((events[0] as PasteEvent).text, 'hi');
});

test('paste: content that looks like escape sequences stays literal (no keys)', () => {
  const events = feed(['\x1b[200~\x1b[A\x1b[<0;1;1M\x1b[201~']);
  assert.equal(events.length, 1, 'only the paste event — no key/mouse leaked');
  const paste = events[0] as PasteEvent;
  assert.equal(paste.type, 'paste');
  assert.equal(paste.text, '\x1b[A\x1b[<0;1;1M');
});

test('paste: an empty paste yields one event with empty text', () => {
  const events = feed(['\x1b[200~\x1b[201~']);
  assert.equal(events.length, 1);
  const paste = events[0] as PasteEvent;
  assert.equal(paste.text, '');
  assert.equal(paste.truncated, false);
});
