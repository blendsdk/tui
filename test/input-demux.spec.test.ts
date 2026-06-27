/**
 * Specification tests — query-response demultiplexer & shared classifier (RD-06).
 *
 * Immutable oracle: expectations derive from RD-06's acceptance criteria and the
 * plan decisions (07-testing-strategy ST-14, ST-6, ST-12; PL-2, PL-9), never from
 * reading the implementation. If a test here fails after implementation, the
 * implementation is wrong, not the test.
 *
 * This file covers the structural query-response demux (AC-6) and the shared
 * grammar classifier (`capability/responses.ts`) that both RD-02's query parser
 * and RD-06's decoder use (PL-2). Phase 3 adds ST-6 (decoder demux) and ST-12
 * (focus) here; Phase 1 ships ST-14 (the shared classifier).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchResponse } from '../src/engine/capability/responses.js';
import { createDecoderState, decode } from '../src/engine/input/decoder.js';
import type { FocusEvent } from '../src/engine/input/events.js';

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// ST-14 — shared classifier recognises every query-response grammar (PL-2)
// ---------------------------------------------------------------------------

// ST-14a: a primary DA reply (`ESC [ ? … c`) classifies as 'da1', fully consumed.
test("ST-14: matchResponse classifies primary DA as 'da1'", () => {
  const bytes = enc.encode('\x1b[?64;1;2c');
  const match = matchResponse(bytes, 0);
  assert.ok(match !== null, 'primary DA must match');
  assert.equal(match.kind, 'da1');
  assert.equal(match.end, bytes.length);
});

// ST-14b: a secondary DA reply (`ESC [ > … c`) classifies as 'da2'.
test("ST-14: matchResponse classifies secondary DA as 'da2'", () => {
  const bytes = enc.encode('\x1b[>0;276;0c');
  const match = matchResponse(bytes, 0);
  assert.ok(match !== null, 'secondary DA must match');
  assert.equal(match.kind, 'da2');
  assert.equal(match.end, bytes.length);
});

// ST-14c: a `?2026` DECRPM reply classifies as 'decrpm' and carries the sync hint.
test("ST-14: matchResponse classifies ?2026 DECRPM as 'decrpm' with sync hint", () => {
  const bytes = enc.encode('\x1b[?2026;1$y');
  const match = matchResponse(bytes, 0);
  assert.ok(match !== null, 'DECRPM must match');
  assert.equal(match.kind, 'decrpm');
  assert.equal(match.end, bytes.length);
  assert.equal(match.hint.sync2026, true);
});

// ST-14d: an XTVERSION DCS reply (`ESC P … ESC \`) classifies as 'xtversion'.
test("ST-14: matchResponse classifies XTVERSION DCS as 'xtversion'", () => {
  const bytes = enc.encode('\x1bP>|foot(1.0)\x1b\\');
  const match = matchResponse(bytes, 0);
  assert.ok(match !== null, 'XTVERSION DCS must match');
  assert.equal(match.kind, 'xtversion');
  assert.equal(match.end, bytes.length);
});

// ST-14e: non-grammar bytes are not a response → null (so the decoder treats
// them as input, never as a query reply).
test('ST-14: matchResponse returns null for non-response bytes', () => {
  const bytes = enc.encode('hello');
  assert.equal(matchResponse(bytes, 0), null);
});

// ---------------------------------------------------------------------------
// ST-6 — query-response demux: a reply reaches `queries`, never `events` (AC-6)
// ---------------------------------------------------------------------------

test('ST-6: a DA reply yields one query response and zero events', () => {
  const r = decode(enc.encode('\x1b[?64;1;2c'), createDecoderState());

  assert.equal(r.queries.length, 1, 'exactly one query response');
  assert.equal(r.queries[0].kind, 'da1');
  assert.equal(r.events.length, 0, 'zero app events — the reply cannot leak as a keystroke');
});

// ---------------------------------------------------------------------------
// ST-12 — focus in/out (Should-Have, PL-7)
// ---------------------------------------------------------------------------

test('ST-12: ESC[I → focus in, ESC[O → focus out', () => {
  const inResult = decode(enc.encode('\x1b[I'), createDecoderState());
  assert.equal(inResult.events.length, 1);
  const focusIn = inResult.events[0] as FocusEvent;
  assert.equal(focusIn.type, 'focus');
  assert.equal(focusIn.focused, true);

  const outResult = decode(enc.encode('\x1b[O'), createDecoderState());
  assert.equal(outResult.events.length, 1);
  const focusOut = outResult.events[0] as FocusEvent;
  assert.equal(focusOut.type, 'focus');
  assert.equal(focusOut.focused, false);
});
