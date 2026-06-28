/**
 * Implementation tests — essentials gate internals (RD-08; AR-2, AR-8).
 *
 * Multiple simultaneous degradations and their deterministic order, the one-
 * notice-per-degradation logging order, `missing` content on a non-TTY, and the
 * structural typing of `HostFacts` (a started-host-like object is accepted).
 * Complements the ST-1…ST-8 spec oracle.
 */
import { test, expect } from 'vitest';

import { evaluateEssentials, essentialsMet, assertEssentials, createLogger } from '../src/engine/safety/index.js';
import { resolveCapabilities } from '../src/engine/capability/index.js';
import type { DeepPartial, CapabilityProfile } from '../src/engine/capability/index.js';

function caps(override: DeepPartial<CapabilityProfile>): CapabilityProfile {
  return resolveCapabilities({ override }).profile;
}

const ALL_DEGRADED = caps({ mouse: { sgr: false }, colorDepth: 'mono', altScreen: false });

test('all three non-essentials degrade together in mouse→color→altScreen order', () => {
  const report = evaluateEssentials(ALL_DEGRADED, { isTTY: true });
  expect(report.met).toBe(true);
  expect(report.degradations.map((d) => d.cap)).toStrictEqual(['mouse', 'color', 'altScreen']);
  expect(report.degradations.map((d) => d.mode)).toStrictEqual(['keyboard-only', 'monochrome', 'inline']);
});

test('assertEssentials logs one gate notice per degradation, in order', () => {
  const ring = createLogger({ sink: 'ring' });
  assertEssentials(ALL_DEGRADED, { isTTY: true }, { logger: ring });
  const entries = ring.entries();
  expect(entries.length).toBe(3);
  expect(entries.every((e) => e.component === 'gate')).toBeTruthy();
  expect(entries.map((e) => e.fields?.cap)).toStrictEqual(['mouse', 'color', 'altScreen']);
});

test('a non-TTY reports exactly the interactive-TTY essential as missing', () => {
  const report = evaluateEssentials(ALL_DEGRADED, { isTTY: false });
  expect(report.met).toBe(false);
  expect(report.missing.length).toBe(1);
  expect(report.missing[0]).toMatch(/interactive TTY/);
});

test('assertEssentials throws on a non-TTY even when degradations are present', () => {
  expect(() => assertEssentials(ALL_DEGRADED, { isTTY: false })).toThrow();
});

test('HostFacts is structural: a started-host-like object is accepted', () => {
  // A richer object (extra members) is structurally compatible with HostFacts.
  const hostLike = {
    isTTY: true,
    start: async () => undefined,
    stop: async () => undefined,
    render: () => undefined,
  };
  expect(essentialsMet(caps({ mouse: { sgr: true }, colorDepth: 'truecolor', altScreen: true }), hostLike)).toBe(true);
});
