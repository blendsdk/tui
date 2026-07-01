/**
 * Specification tests (immutable oracle) — RD-11 containers packaging (ST-15).
 *
 * Source: jsvision-ui/RD-11 AC-14 → ST-15 (containers-scrolling-lists/07-testing-strategy.md). The
 * `scroll/`·`list/`·`dialog/` subsystems live under `src/` with explicit named re-exports from
 * `src/index.ts` (imported here BY NAME from `@jsvision/ui`, the published surface), the package
 * declares zero native runtime deps, and every source file is ≤ 500 lines.
 *
 * This file is authored spec-first and grown per phase: Phase 0 asserts the `Commands` additions +
 * the new-subsystem file-size discipline + the dependency surface; the component-symbol imports
 * (`ScrollBar`/`Scroller`/`ListView`/`ListBox`/`Dialog` + button helpers) are added at G.1 as each
 * phase lands its symbols.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  Commands,
  ScrollBar,
  Scroller,
  ListView,
  ListBox,
  Dialog,
  okButton,
  cancelButton,
  yesButton,
  noButton,
  okCancelButtons,
  yesNoButtons,
} from '@jsvision/ui';

const here = dirname(fileURLToPath(import.meta.url));

/** Recursively list every `.ts` source file under a directory. */
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

// ST-15 / AC-14 — every RD-11 public symbol is importable from `@jsvision/ui` (the published surface):
// the container components (classes) + the standard-button helpers (factory functions).
test('ST-15: ScrollBar/Scroller/ListView/ListBox/Dialog are exported classes', () => {
  for (const cls of [ScrollBar, Scroller, ListView, ListBox, Dialog]) {
    expect(typeof cls).toBe('function'); // a constructable class
  }
  // Dialog extends the app-shell Window; ListBox extends ListView (the documented hierarchy).
  expect(Object.getPrototypeOf(ListBox.prototype)).toBe(ListView.prototype);
});

test('ST-15: the standard-button helpers are exported factory functions', () => {
  for (const fn of [okButton, cancelButton, yesButton, noButton]) {
    const btn = fn();
    expect(btn).toBeTruthy(); // returns a Button instance
  }
  const [ok, cancel] = okCancelButtons();
  const [yes, no] = yesNoButtons();
  for (const btn of [ok, cancel, yes, no]) expect(btn).toBeTruthy();
});

// ST-15 / AC-14 / PA-12 — the four standard terminating commands are on the `Commands` set, values
// equal to their keys (the existing convention).
test('ST-15: Commands exposes ok/cancel/yes/no', () => {
  expect(Commands.ok).toBe('ok');
  expect(Commands.cancel).toBe('cancel');
  expect(Commands.yes).toBe('yes');
  expect(Commands.no).toBe('no');
});

// ST-15 / PA-9 — every file in the new container subsystems is ≤ 500 lines (architecture boundary).
test('ST-15: each new subsystem source file is ≤ 500 lines', () => {
  for (const sub of ['scroll', 'list', 'dialog']) {
    const dir = join(here, '..', 'src', sub);
    if (!existsSync(dir)) continue; // grows per phase — a not-yet-created subsystem is skipped
    for (const file of tsFiles(dir)) {
      const lines = readFileSync(file, 'utf8').split('\n').length;
      expect(lines, file).toBeLessThanOrEqual(500);
    }
  }
});

// ST-15 / AC-14 — the package declares no third-party/native runtime dependency (only the workspace
// JS engine `@jsvision/core`); the `check:deps` gate enforces the native-dep ban in CI.
test('ST-15: @jsvision/ui declares only the workspace @jsvision/core runtime dependency', () => {
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  expect(Object.keys(pkg.dependencies ?? {})).toEqual(['@jsvision/core']);
});
