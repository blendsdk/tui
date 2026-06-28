/**
 * Implementation tests — manual-probe internals (RD-03, plan doc 03-03).
 *
 * Edge cases beyond the ST oracle: deterministic test-pattern output (glyphs +
 * truecolor swatch SGR), program-constant OSC sequences emitted via the loop, and
 * all-skip accumulation. Real ScreenBuffer + serialize (no mocks).
 */
import { test, expect } from 'vitest';

import { renderProbePattern, runManualProbes } from '../capability-probe/manual-probes.js';
import type { ProbeDescriptor } from '../capability-probe/taxonomy.js';
import { ScreenBuffer, serialize, resolveCapabilities } from '@blendsdk/tui-core';

const TRUECOLOR = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile;

function descriptor(id: string): ProbeDescriptor {
  return { id, group: 'osc', label: id, method: 'manual' };
}
function buildBuffer(id: string): ScreenBuffer {
  const buffer = new ScreenBuffer(60, 8, { fg: 'default', bg: 'default' });
  renderProbePattern(buffer, descriptor(id), TRUECOLOR);
  return buffer;
}

test('the box-drawing pattern stores real box-drawing glyphs in the buffer', () => {
  // Assert the buffer cells directly — the serialize default encoder applies glyph
  // fallback per caps, which is a render-time concern, not the renderer's output.
  const buffer = buildBuffer('glyph.boxDrawing');
  expect(buffer.get(0, 2)?.char).toBe('┌');
});

test('the truecolor swatch emits a truecolor background SGR', () => {
  const out = serialize(buildBuffer('color.swatch.truecolor'), null, { caps: TRUECOLOR });
  expect(out.includes('48;2;255;0;0')).toBeTruthy();
});

test('the CJK pattern stores the wide sample glyph in the buffer', () => {
  const buffer = buildBuffer('unicode.cjkWidth');
  expect(buffer.get(0, 2)?.char).toBe('你');
});

test('fire-and-forget OSC probes emit program-constant sequences', async () => {
  const emitted: string[] = [];
  await runManualProbes({
    render: () => {},
    emit: (sequence) => emitted.push(sequence),
    nextKey: () => Promise.resolve('y'),
    probes: [descriptor('osc.bell'), descriptor('osc.title')],
    caps: TRUECOLOR,
  });
  expect(emitted.includes('\x07')).toBeTruthy();
  expect(emitted.includes('\x1b]0;capability-probe\x07')).toBeTruthy();
});

test('a purely visual probe emits no escape sequence', async () => {
  const emitted: string[] = [];
  await runManualProbes({
    render: () => {},
    emit: (sequence) => emitted.push(sequence),
    nextKey: () => Promise.resolve('y'),
    probes: [{ id: 'attr.bold', group: 'attributes', label: 'bold', method: 'manual' }],
    caps: TRUECOLOR,
  });
  expect(emitted.length).toBe(0);
});

test('all-skip answers record every probe as null', async () => {
  const probes = [descriptor('osc.bell'), descriptor('osc.title'), descriptor('osc.notify9')];
  const results = await runManualProbes({
    render: () => {},
    emit: () => {},
    nextKey: () => Promise.resolve('s'),
    probes,
    caps: TRUECOLOR,
  });
  for (const probe of probes) {
    expect(results[probe.id]).toStrictEqual({ supported: null, method: 'manual' });
  }
});
