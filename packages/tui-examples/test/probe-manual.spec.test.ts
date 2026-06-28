/**
 * Specification tests — manual probes (RD-03, plan doc 03-03).
 *
 * Oracle source: 07-testing-strategy.md ST-12 / ST-12b (RD AC-3, AR-8, AR-15).
 * The manual loop must record EVERY probe and never stop early when one is "no";
 * confirmation keys map y→true, n→false, s→null. Expectations derive from the
 * spec, not the implementation.
 */
import { test, expect } from 'vitest';

import { runManualProbes, classifyConfirmation } from '../capability-probe/manual-probes.js';
import type { ProbeDescriptor } from '../capability-probe/taxonomy.js';
import { resolveCapabilities } from '@blendsdk/tui-core';

const CAPS = resolveCapabilities({ env: {}, platform: 'linux' }).profile;

const PROBES: readonly ProbeDescriptor[] = [
  { id: 'attr.bold', group: 'attributes', label: 'bold', method: 'manual' },
  { id: 'attr.italic', group: 'attributes', label: 'italic', method: 'manual' },
  { id: 'osc.bell', group: 'osc', label: 'bell', method: 'manual' },
];

// ST-12: one "no" does not stop the loop; every probe is recorded.
test('ST-12: a "no" answer does not stop the loop; every probe is recorded', async () => {
  const answers: Array<'y' | 'n' | 's'> = ['y', 'n', 'y'];
  let i = 0;
  const results = await runManualProbes({
    render: () => {},
    emit: () => {},
    nextKey: () => Promise.resolve(answers[i++]),
    probes: PROBES,
    caps: CAPS,
  });

  expect(Object.keys(results).sort()).toStrictEqual(['attr.bold', 'attr.italic', 'osc.bell'].sort());
  expect(results['attr.bold'].supported).toBe(true);
  expect(results['attr.italic'].supported).toBe(false);
  expect(results['osc.bell'].supported).toBe(true);
});

// ST-12b: confirmation key mapping.
test('ST-12b: classifyConfirmation maps y/n/s to true/false/null (method manual)', () => {
  expect(classifyConfirmation('y')).toStrictEqual({ supported: true, method: 'manual' });
  expect(classifyConfirmation('n')).toStrictEqual({ supported: false, method: 'manual' });
  expect(classifyConfirmation('s')).toStrictEqual({ supported: null, method: 'manual' });
});
