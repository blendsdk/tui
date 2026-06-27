/**
 * Implementation tests — live readout internals (RD-03, plan doc 03-03).
 *
 * Edge cases beyond the ST oracle: wheel/focus/multi-modifier formatting, paste
 * byte counting for multibyte text + truncation, and the run loop quitting on `q`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatEventLine, runLiveReadout } from '../examples/capability-probe/live-readout.js';
import type { InputEvent } from '../src/engine/index.js';

test('wheel and focus events format with direction / state', () => {
  assert.equal(formatEventLine({ type: 'wheel', dir: 'up', x: 3, y: 4 }), 'wheel: up @ 3,4');
  assert.equal(formatEventLine({ type: 'focus', focused: true }), 'focus: in');
  assert.equal(formatEventLine({ type: 'focus', focused: false }), 'focus: out');
});

test('multiple modifiers render in ctrl+alt+shift order', () => {
  const line = formatEventLine({ type: 'key', key: 'f1', ctrl: true, alt: true, shift: true });
  assert.equal(line, 'key: ctrl+alt+shift+f1');
});

test('paste counts UTF-8 bytes and marks truncation, never contents', () => {
  assert.equal(formatEventLine({ type: 'paste', text: '你', truncated: false }), 'paste: 3 bytes');
  const truncated = formatEventLine({ type: 'paste', text: 'hi', truncated: true });
  assert.ok(truncated.includes('2 bytes') && truncated.includes('truncated'));
});

test('runLiveReadout stops at the quit key and renders accumulated lines', async () => {
  const events: InputEvent[] = [
    { type: 'key', key: 'a', ctrl: false, alt: false, shift: false },
    { type: 'key', key: 'b', ctrl: false, alt: false, shift: false },
    { type: 'key', key: 'q', ctrl: false, alt: false, shift: false },
    { type: 'key', key: 'c', ctrl: false, alt: false, shift: false },
  ];
  async function* stream(): AsyncGenerator<InputEvent> {
    for (const event of events) yield event;
  }
  const renders: string[][] = [];
  await runLiveReadout({ events: stream(), render: (lines) => renders.push([...lines]) });

  assert.equal(renders.length, 2, 'rendered after a and b, stopped at q (c not processed)');
  assert.deepEqual(renders[renders.length - 1], ['key: a', 'key: b']);
});
