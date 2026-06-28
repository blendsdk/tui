/**
 * Specification tests — security: no env value logged (RD-02, ST-20).
 *
 * Immutable oracle: derived from AC-8 ("no env value is logged at default
 * level") and the security posture in plan doc 03-03. Resolution must not emit
 * any environment value through `console.*`. If this fails after implementation,
 * the implementation is logging something it must not.
 *
 * Traceability: AC-8 / ST-20.
 */
import { test, expect } from 'vitest';

import { resolveCapabilities, resolveCapabilitiesAsync } from '../src/engine/capability/index.js';
import type { TerminalQuery } from '../src/engine/capability/profile.js';

/** Sentinel env values; none of these substrings may appear in any log output. */
const SENTINELS = {
  COLORTERM: 'SENTINEL-colorterm-9f1c',
  TERM_PROGRAM: 'SENTINEL-program-4b7a',
  LANG: 'en_US.UTF-8-SENTINEL-2d3e',
  TMUX: '/tmp/SENTINEL-tmux-6c8d',
} as const;

const POPULATED_ENV: NodeJS.ProcessEnv = {
  TERM: 'xterm-256color',
  COLORTERM: SENTINELS.COLORTERM,
  TERM_PROGRAM: SENTINELS.TERM_PROGRAM,
  LANG: SENTINELS.LANG,
  TMUX: SENTINELS.TMUX,
};

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

/** Run `body` while capturing every `console.*` argument as a string. */
async function captureConsole(body: () => void | Promise<void>): Promise<string> {
  const captured: string[] = [];
  const originals = CONSOLE_METHODS.map((name) => [name, console[name]] as const);

  for (const name of CONSOLE_METHODS) {
    console[name] = (...args: unknown[]): void => {
      captured.push(args.map((a) => String(a)).join(' '));
    };
  }

  try {
    await body();
  } finally {
    for (const [name, fn] of originals) {
      console[name] = fn;
    }
  }

  return captured.join('\n');
}

/** A stub query that replies with a DA response (exercises the layer-2 path). */
function daStub(): TerminalQuery {
  return {
    write() {
      /* discarded */
    },
    async *read(): AsyncIterable<Uint8Array> {
      yield new TextEncoder().encode('\x1b[?64;1;2c');
    },
  };
}

// ST-20 (AC-8): the synchronous resolve logs no env value.
test('ST-20: synchronous resolve logs no environment value', async () => {
  const output = await captureConsole(() => {
    resolveCapabilities({ env: POPULATED_ENV, platform: 'linux' });
  });

  for (const value of Object.values(SENTINELS)) {
    expect(!output.includes(value)).toBeTruthy();
  }
});

// ST-20 (AC-8): the async resolve (incl. the layer-2 query path) logs no env value.
test('ST-20: async resolve (with query) logs no environment value', async () => {
  const output = await captureConsole(async () => {
    await resolveCapabilitiesAsync({
      env: POPULATED_ENV,
      platform: 'linux',
      query: daStub(),
      timeoutMs: 100,
    });
  });

  for (const value of Object.values(SENTINELS)) {
    expect(!output.includes(value)).toBeTruthy();
  }
});
