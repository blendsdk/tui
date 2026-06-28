/**
 * Implementation tests — per-OS platform adapter (RD-07, PF-005/PF-010).
 *
 * Probes `platform.ts` directly: the pure `hostSignalSource` map for POSIX and
 * win32, that win32 `resize`/`hangup` attach to the **provided** output stream
 * (PF-010), and the win32 VT-warn-once branch via the injectable predicate +
 * warning sink (PF-005). The win32 paths are exercised from this POSIX-friendly
 * runner by injecting `platform`/`vtAvailable`/`warn` — never touching the real
 * `process` signal set for the process-sourced signals.
 */
import { test, expect } from 'vitest';

import { hostSignalSource, realRuntime } from '../src/engine/host/platform.js';
import { CaptureStream } from './host-doubles.js';

// ---------------------------------------------------------------------------
// hostSignalSource — pure POSIX/win32 maps (PF-005)
// ---------------------------------------------------------------------------

test('hostSignalSource: POSIX maps signals to process sources', () => {
  for (const platform of ['linux', 'darwin'] as const) {
    expect(hostSignalSource(platform, 'resize')).toStrictEqual({ emitter: 'process', name: 'SIGWINCH' });
    expect(hostSignalSource(platform, 'interrupt')).toStrictEqual({ emitter: 'process', name: 'SIGINT' });
    expect(hostSignalSource(platform, 'terminate')).toStrictEqual({ emitter: 'process', name: 'SIGTERM' });
    expect(hostSignalSource(platform, 'hangup')).toStrictEqual({ emitter: 'process', name: 'SIGHUP' });
    expect(hostSignalSource(platform, 'suspend')).toStrictEqual({ emitter: 'process', name: 'SIGTSTP' });
    expect(hostSignalSource(platform, 'continue')).toStrictEqual({ emitter: 'process', name: 'SIGCONT' });
  }
});

test('hostSignalSource: win32 routes resize/hangup to the output and drops suspend/continue', () => {
  expect(hostSignalSource('win32', 'resize')).toStrictEqual({ emitter: 'output', name: 'resize' });
  expect(hostSignalSource('win32', 'interrupt')).toStrictEqual({ emitter: 'process', name: 'SIGINT' });
  expect(hostSignalSource('win32', 'terminate')).toStrictEqual({ emitter: 'process', name: 'SIGBREAK' });
  expect(hostSignalSource('win32', 'hangup')).toStrictEqual({ emitter: 'output', name: 'close' });
  expect(hostSignalSource('win32', 'suspend')).toBe(null);
  expect(hostSignalSource('win32', 'continue')).toBe(null);
});

// ---------------------------------------------------------------------------
// realRuntime — win32 resize/hangup attach to the provided output (PF-010)
// ---------------------------------------------------------------------------

test('realRuntime(win32): resize attaches to the provided output and unsubscribes cleanly', () => {
  const output = new CaptureStream();
  const adapter = realRuntime(output.asOutput(), { platform: 'win32' });

  const unsubscribe = adapter.on('resize', () => {});
  expect(output.listenerCount('resize')).toBe(1);
  unsubscribe();
  expect(output.listenerCount('resize')).toBe(0);
});

test('realRuntime(win32): hangup attaches to the output close event', () => {
  const output = new CaptureStream();
  const adapter = realRuntime(output.asOutput(), { platform: 'win32' });

  const unsubscribe = adapter.on('hangup', () => {});
  expect(output.listenerCount('close')).toBe(1);
  unsubscribe();
  expect(output.listenerCount('close')).toBe(0);
});

test('realRuntime(win32): suspend/continue are inert (no listeners, callable unsubscribe)', () => {
  const output = new CaptureStream();
  const adapter = realRuntime(output.asOutput(), { platform: 'win32' });

  const unsubSuspend = adapter.on('suspend', () => {});
  const unsubContinue = adapter.on('continue', () => {});
  expect(output.listenerCount('resize')).toBe(0);
  expect(() => {
    unsubSuspend();
    unsubContinue();
  }).not.toThrow();
});

// ---------------------------------------------------------------------------
// realRuntime — win32 VT-warn-once via the injectable predicate (PF-005)
// ---------------------------------------------------------------------------

test('realRuntime(win32): warns once when VT processing is unavailable', () => {
  const warnings: string[] = [];
  realRuntime(new CaptureStream().asOutput(), {
    platform: 'win32',
    vtAvailable: () => false,
    warn: (m) => warnings.push(m),
  });
  expect(warnings.length).toBe(1);
  expect(warnings[0]).toMatch(/virtual-terminal/i);
});

test('realRuntime(win32): no warning when VT processing is available', () => {
  const warnings: string[] = [];
  realRuntime(new CaptureStream().asOutput(), {
    platform: 'win32',
    vtAvailable: () => true,
    warn: (m) => warnings.push(m),
  });
  expect(warnings.length).toBe(0);
});

test('realRuntime(POSIX): never runs the VT check, even if the predicate is false', () => {
  const warnings: string[] = [];
  realRuntime(new CaptureStream().asOutput(), {
    platform: 'linux',
    vtAvailable: () => false,
    warn: (m) => warnings.push(m),
  });
  expect(warnings.length).toBe(0);
});
