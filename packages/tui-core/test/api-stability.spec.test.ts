/**
 * API-stability governance doc-presence (RD-10 FR-8, plan doc 03-04; ST-8).
 *
 * Specification oracle (ST-8): the public-API governance artifacts must exist and
 * carry their key headings, so they cannot silently rot or go uncommitted —
 * mirroring how `gate.spec` guards the acceptance-gate doc. Pure file reads:
 *  - `CHANGELOG.md` is Keep-a-Changelog with an `## [Unreleased]` section and a
 *    `## [0.1.0]` entry.
 *  - `README.md` has a "Versioning & stability" section (SemVer + public surface
 *    + deprecation policy).
 *
 * Derived from RD-10 AC-8 / AR-7, never from the files' contents.
 */
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { repoPath } from './monorepo-root.js';

/** Read a monorepo-root file as UTF-8 text. */
function readRoot(name: string): string {
  return readFileSync(repoPath(name), 'utf8');
}

// ST-8a: CHANGELOG.md exists in Keep-a-Changelog form with Unreleased + 0.1.0.
test('ST-8: CHANGELOG.md has an Unreleased section and a 0.1.0 entry', () => {
  const changelog = readRoot('CHANGELOG.md');
  expect(changelog).toMatch(/##\s*\[Unreleased\]/);
  expect(changelog).toMatch(/##\s*\[0\.1\.0\]/);
});

// ST-8b: README documents the versioning & stability policy.
test('ST-8: README has a "Versioning & stability" section', () => {
  const readme = readRoot('README.md');
  expect(readme).toMatch(/##\s*Versioning\s*&\s*stability/i);
});
