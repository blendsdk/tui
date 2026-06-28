/**
 * Byte-proportionality benchmark (RD-09 FR-4, plan doc 03-04; gate item 2).
 *
 * Specification oracle (ST-20, ST-21): `serialize` is a damage diff, so its output
 * byte count must be proportional to the number of changed cells. No change emits
 * nothing; a single-cell change emits far fewer bytes than a full repaint. These
 * are ratios/relations, not absolute counts or times, so the test is deterministic
 * and machine-independent (AR-3). Wall-clock timing is deferred to RD-10 (DEF-4).
 *
 * The `.js` extension in the import specifier is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
import { test, expect } from 'vitest';
import { ScreenBuffer, serialize, resolveCapabilities } from '../src/engine/index.js';
import type { RenderOptions, Style } from '../src/engine/index.js';

const OPTS: RenderOptions = {
  caps: resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile,
};
const STYLE: Style = { fg: 'default', bg: 'default' };

/** A deterministic filled 80×24 buffer (every cell holds 'a'). */
function filledBuffer(): ScreenBuffer {
  return new ScreenBuffer(80, 24, { fg: 'default', bg: 'default', char: 'a' });
}

test('ST-20: serializing an unchanged buffer emits no bytes', () => {
  const base = filledBuffer();
  expect(serialize(base, base, OPTS).length).toBe(0);
});

test('ST-21: a single-cell change emits far fewer bytes than a full repaint', () => {
  const base = filledBuffer();
  const one = filledBuffer();
  one.set(10, 5, 'Z', STYLE); // exactly one changed cell

  const full = serialize(base, null, OPTS).length; // full first paint
  const single = serialize(one, base, OPTS).length; // minimal diff

  expect(single > 0).toBeTruthy();
  expect(single < full / 10).toBeTruthy();
});

/**
 * Bytes for a single-cell update at the same in-bounds coordinate on a buffer of
 * the given size. `serialize` addresses the changed run by coordinate and never
 * reads buffer dimensions for it (`serialize.ts:95` — `cursorTo(y+1, runStart+1)`),
 * so the emitted byte count is independent of screen area.
 */
function singleCellDiffBytes(w: number, h: number): number {
  const base = new ScreenBuffer(w, h, { fg: 'default', bg: 'default', char: 'a' });
  const next = new ScreenBuffer(w, h, { fg: 'default', bg: 'default', char: 'a' });
  next.set(3, 3, 'Z', STYLE); // (3,3) is valid in both 8×8 and 200×50
  return serialize(next, base, OPTS).length;
}

// RD10-ST-2 (RD-10 AC-2 / FR-2): output ∝ damage, not screen size. The same
// single-cell update emits a byte-IDENTICAL payload on an 8×8 and a 200×50 buffer
// — exact equality is the stronger, constant-free oracle (PF-003). The label is
// namespaced to avoid colliding with this file's RD-09 ST-20/ST-21 (PF-004).
test('RD10-ST-2: a single-cell update emits identical bytes regardless of screen area', () => {
  expect(singleCellDiffBytes(8, 8)).toBe(singleCellDiffBytes(200, 50));
});
