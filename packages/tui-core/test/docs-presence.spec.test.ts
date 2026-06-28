/**
 * Techdocs output-presence guard (RD-10 FR-12/FR-14, plan doc 03-05; ST-9, PF-009).
 *
 * Specification oracle (ST-9): after the techdocs set is generated, `docs/` must
 * contain the architecture overview, the API reference, and at least one ADR, and
 * the entry point must carry the techdocs opt-in marker. This mirrors how
 * `gate.spec` guards the acceptance-gate doc, so the generated set cannot silently
 * rot or go uncommitted without `verify` noticing. Pure file reads — derived from
 * RD-10 AC (docs) / AR-5, never from the docs' contents.
 */
import { test, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoPath } from './monorepo-root.js';

const docs = repoPath('docs');

test('ST-9: the architecture overview is present', () => {
  expect(existsSync(join(docs, 'architecture', 'system-overview.md'))).toBeTruthy();
});

test('ST-9: the API reference is present', () => {
  expect(existsSync(join(docs, 'architecture', 'api-design.md'))).toBeTruthy();
});

test('ST-9: at least one ADR is present', () => {
  const adrs = readdirSync(join(docs, 'decisions')).filter((f) => /^ADR-\d+.*\.md$/.test(f));
  expect(adrs.length >= 1).toBeTruthy();
});

test('ST-9: the techdocs entry point carries the opt-in marker', () => {
  const index = readFileSync(join(docs, 'index.md'), 'utf8');
  expect(index).toMatch(/techdocs:\s*true/);
});
