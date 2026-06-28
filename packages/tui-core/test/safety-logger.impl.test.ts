/**
 * Implementation tests — logger internals (RD-08; AR-10, AR-14).
 *
 * Real-file append semantics + `close()` idempotence (a real temp file, no
 * mocks), and the `auto` sink selection across its three branches (path → file,
 * no-path-stderr-safe → stderr, no-path-stderr-is-UI → none). The fd-write
 * branches use the injectable `LoggerFs` seam to observe writes deterministically
 * without capturing the process's real stderr.
 */
import { test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createLogger } from '../src/engine/safety/index.js';
import type { LoggerFs } from '../src/engine/safety/index.js';

test('the file sink appends structured lines; close() is idempotent', () => {
  const p = path.join(os.tmpdir(), `blendtui-log-${process.pid}-${process.hrtime.bigint()}.log`);
  try {
    const log = createLogger({ enabled: true, sink: 'file', path: p });
    log.info('host', 'first');
    log.warn('gate', 'second', { cap: 'mouse' });
    log.close();
    log.close(); // idempotent — must not throw

    const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe('info host first');
    expect(lines[1]).toBe('warn gate second {"cap":"mouse"}');

    // Append mode: a second logger adds without truncating.
    const log2 = createLogger({ enabled: true, sink: 'file', path: p });
    log2.error('x', 'third');
    log2.close();
    expect(fs.readFileSync(p, 'utf8').trim().split('\n').length).toBe(3);
  } finally {
    fs.rmSync(p, { force: true });
  }
});

/** A capturing fs seam: records every write target+payload; no real I/O. */
function capturingFs(): { fs: LoggerFs; writes: Array<{ fd: number; data: string }> } {
  const writes: Array<{ fd: number; data: string }> = [];
  return {
    writes,
    fs: {
      openSync: () => 10,
      fstatSync: (fd) => ({ dev: 1, ino: fd === 10 ? 50 : 60 }), // file vs UI differ → no collision
      writeSync: (fd, data) => {
        writes.push({ fd, data });
        return data.length;
      },
      closeSync: () => undefined,
    },
  };
}

test('auto sink: a configured path selects the file sink', () => {
  const { fs: seam, writes } = capturingFs();
  const log = createLogger({ enabled: true, sink: 'auto', path: '/tmp/auto.log', uiFd: 1, fs: seam });
  log.info('t', 'msg');
  log.close();
  expect(writes.length).toBe(1);
  expect(writes[0].fd).toBe(10);
});

test('auto sink: no path but stderr is not the UI selects stderr (fd 2)', () => {
  const { fs: seam, writes } = capturingFs();
  const log = createLogger({ enabled: true, sink: 'auto', uiFd: 1, env: {}, fs: seam });
  log.info('t', 'msg');
  expect(writes.length).toBe(1);
  expect(writes[0].fd).toBe(2);
});

test('auto sink: no path and stderr IS the UI selects no sink (records dropped)', () => {
  const { fs: seam, writes } = capturingFs();
  const log = createLogger({ enabled: true, sink: 'auto', uiFd: 2, env: {}, fs: seam });
  log.info('t', 'msg');
  expect(log.enabled).toBe(true);
  expect(writes.length).toBe(0);
  expect(log.entries()).toStrictEqual([]);
});
