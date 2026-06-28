/**
 * Implementation tests — live readout internals (RD-03, plan doc 03-03).
 *
 * Edge cases beyond the ST oracle: wheel/focus/multi-modifier formatting, paste
 * byte counting for multibyte text + truncation, and the run loop quitting on `q`.
 */
import { test, expect } from 'vitest';

import { formatEventLine, runLiveReadout } from '../capability-probe/live-readout.js';
import type { InputEvent } from '@blendsdk/tui-core';

test('wheel and focus events format with direction / state', () => {
  expect(formatEventLine({ type: 'wheel', dir: 'up', x: 3, y: 4 })).toBe('wheel: up @ 3,4');
  expect(formatEventLine({ type: 'focus', focused: true })).toBe('focus: in');
  expect(formatEventLine({ type: 'focus', focused: false })).toBe('focus: out');
});

test('multiple modifiers render in ctrl+alt+shift order', () => {
  const line = formatEventLine({ type: 'key', key: 'f1', ctrl: true, alt: true, shift: true });
  expect(line).toBe('key: ctrl+alt+shift+f1');
});

test('paste counts UTF-8 bytes and marks truncation, never contents', () => {
  expect(formatEventLine({ type: 'paste', text: '你', truncated: false })).toBe('paste: 3 bytes');
  const truncated = formatEventLine({ type: 'paste', text: 'hi', truncated: true });
  expect(truncated.includes('2 bytes') && truncated.includes('truncated')).toBeTruthy();
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

  expect(renders.length).toBe(2);
  expect(renders[renders.length - 1]).toStrictEqual(['key: a', 'key: b']);
});
