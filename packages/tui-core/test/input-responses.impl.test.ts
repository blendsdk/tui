/**
 * Implementation tests — shared response classifier (RD-06, Session 1.3).
 *
 * Edge/internal coverage of `capability/responses.ts` (PL-2): incomplete
 * sequences return null, both DCS terminators (ESC \ and BEL) are accepted, a
 * non-`?2026` DECRPM is rejected, and a match starting at a non-zero offset is
 * located. These complement the ST-14 spec oracle in `input-demux.spec.test.ts`.
 */
import { test, expect } from 'vitest';

import { matchResponse } from '../src/engine/capability/responses.js';

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Incomplete sequences → null (carried by the caller, never a false match)
// ---------------------------------------------------------------------------

test('responses: a CSI with no final byte yet → null', () => {
  expect(matchResponse(enc.encode('\x1b[?64;1'), 0)).toBe(null);
});

test('responses: a lone ESC → null', () => {
  expect(matchResponse(Uint8Array.from([0x1b]), 0)).toBe(null);
});

test('responses: a DCS with no terminator yet → null', () => {
  expect(matchResponse(enc.encode('\x1bP>|foot(1.0)'), 0)).toBe(null);
});

test('responses: a non-ESC first byte → null', () => {
  expect(matchResponse(enc.encode('a'), 0)).toBe(null);
});

// ---------------------------------------------------------------------------
// DCS terminators: ESC \ (ST) and BEL both close XTVERSION
// ---------------------------------------------------------------------------

test('responses: DCS terminated by ESC \\ → xtversion', () => {
  const bytes = enc.encode('\x1bP>|foot\x1b\\');
  const match = matchResponse(bytes, 0);
  expect(match !== null).toBeTruthy();
  expect(match.kind).toBe('xtversion');
  expect(match.end).toBe(bytes.length);
});

test('responses: DCS terminated by BEL → xtversion', () => {
  const bytes = enc.encode('\x1bP>|foot\x07');
  const match = matchResponse(bytes, 0);
  expect(match !== null).toBeTruthy();
  expect(match.kind).toBe('xtversion');
  expect(match.end).toBe(bytes.length);
});

// ---------------------------------------------------------------------------
// DECRPM: only `?2026` is ours; other modes are not classified
// ---------------------------------------------------------------------------

test('responses: a non-?2026 DECRPM → null (not our query)', () => {
  expect(matchResponse(enc.encode('\x1b[?1049;1$y'), 0)).toBe(null);
});

test('responses: ?2026 DECRPM value 0 → decrpm with no sync hint', () => {
  const match = matchResponse(enc.encode('\x1b[?2026;0$y'), 0);
  expect(match !== null).toBeTruthy();
  expect(match.kind).toBe('decrpm');
  expect(match.hint.sync2026).toBe(undefined);
});

// ---------------------------------------------------------------------------
// Offset matching: matchResponse honours `start`
// ---------------------------------------------------------------------------

test('responses: a match located at a non-zero start index', () => {
  const bytes = enc.encode('ab\x1b[?64;1;2c');
  const match = matchResponse(bytes, 2);
  expect(match !== null).toBeTruthy();
  expect(match.kind).toBe('da1');
  expect(match.end).toBe(bytes.length);
});
