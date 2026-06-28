/**
 * Specification tests — the screen-safe logger (RD-08).
 *
 * Immutable oracle: expectations derive from RD-08 AC-5/AC-7 and the AR-10/AR-14
 * decisions via ST-19…ST-23 in plan doc 07-testing-strategy — never from reading
 * the implementation. The logger is disabled by default (zero bytes on a normal
 * run) and refuses, at construction, any sink that resolves to the UI stream.
 */
import { test, expect } from 'vitest';

import { createLogger, LoggerConfigError } from '../src/engine/safety/index.js';
import type { LoggerFs } from '../src/engine/safety/index.js';

// ST-19 — disabled by default: no enablement flag → no-op, zero records (AC-5).
test('ST-19: a logger with no BLENDTUI_DEBUG is disabled and writes nothing', () => {
  const log = createLogger({ env: {} });
  log.debug('input', 'a keystroke happened');
  expect(log.enabled).toBe(false);
  expect(log.entries()).toStrictEqual([]);
});

// ST-20 — BLENDTUI_DEBUG=1 + ring sink: enabled, structured records captured.
test('ST-20: an enabled ring logger captures structured records', () => {
  const log = createLogger({ env: { BLENDTUI_DEBUG: '1' }, sink: 'ring' });
  log.debug('input', 'one');
  log.info('gate', 'two');
  log.warn('host', 'three');
  expect(log.enabled).toBe(true);
  const records = log.entries();
  expect(records.length).toBe(3);
  expect(records.map((r) => ({ level: r.level, component: r.component, msg: r.msg }))).toStrictEqual([
    { level: 'debug', component: 'input', msg: 'one' },
    { level: 'info', component: 'gate', msg: 'two' },
    { level: 'warn', component: 'host', msg: 'three' },
  ]);
});

// ST-21 — the ring is bounded: capacity 2, three records → oldest dropped.
test('ST-21: the ring sink drops the oldest record beyond its capacity', () => {
  const log = createLogger({ sink: 'ring', size: 2 });
  log.info('t', 'one');
  log.info('t', 'two');
  log.info('t', 'three');
  const msgs = log.entries().map((r) => r.msg);
  expect(msgs).toStrictEqual(['two', 'three']);
});

// ST-22 — a file sink resolving to the UI stream throws LoggerConfigError (AC-7).
test('ST-22: a file sink colliding with the UI stream throws LoggerConfigError', () => {
  // Collision: the opened path and uiFd report the same {dev,ino} with ino !== 0.
  const collidingFs: LoggerFs = {
    openSync: () => 10,
    fstatSync: () => ({ dev: 1, ino: 42 }),
    writeSync: () => 0,
    closeSync: () => undefined,
  };
  expect(() => createLogger({ enabled: true, sink: 'file', path: '/tmp/ui.log', uiFd: 1, fs: collidingFs })).toThrow(
    LoggerConfigError,
  );
});

test('ST-22 companion: a distinct file, or ino===0, does NOT collide', () => {
  // Distinct inode → allowed.
  const distinctFs: LoggerFs = {
    openSync: () => 10,
    fstatSync: (fd) => (fd === 1 ? { dev: 1, ino: 99 } : { dev: 1, ino: 42 }),
    writeSync: () => 0,
    closeSync: () => undefined,
  };
  expect(() =>
    createLogger({ enabled: true, sink: 'file', path: '/tmp/a.log', uiFd: 1, fs: distinctFs }).close(),
  ).not.toThrow();

  // Same {dev,ino} but ino === 0 (unstable inodes) → best-effort allow.
  const zeroInoFs: LoggerFs = {
    openSync: () => 10,
    fstatSync: () => ({ dev: 1, ino: 0 }),
    writeSync: () => 0,
    closeSync: () => undefined,
  };
  expect(() =>
    createLogger({ enabled: true, sink: 'file', path: '/tmp/b.log', uiFd: 1, fs: zeroInoFs }).close(),
  ).not.toThrow();
});

// ST-23 — level filtering: a debug below the 'warn' threshold is dropped.
test('ST-23: records below the configured level are dropped', () => {
  const log = createLogger({ enabled: true, level: 'warn', sink: 'ring' });
  log.debug('t', 'dropped');
  log.warn('t', 'kept');
  const records = log.entries();
  expect(records.length).toBe(1);
  expect(records[0].level).toBe('warn');
  expect(records[0].msg).toBe('kept');
});
