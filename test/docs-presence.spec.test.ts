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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** Repo root — the parent of `test/`. */
const root = fileURLToPath(new URL('..', import.meta.url));
const docs = join(root, 'docs');

test('ST-9: the architecture overview is present', () => {
  assert.ok(
    existsSync(join(docs, 'architecture', 'system-overview.md')),
    'docs/architecture/system-overview.md must exist',
  );
});

test('ST-9: the API reference is present', () => {
  assert.ok(existsSync(join(docs, 'architecture', 'api-design.md')), 'docs/architecture/api-design.md must exist');
});

test('ST-9: at least one ADR is present', () => {
  const adrs = readdirSync(join(docs, 'decisions')).filter((f) => /^ADR-\d+.*\.md$/.test(f));
  assert.ok(adrs.length >= 1, `docs/decisions/ must contain at least one ADR-*.md (found ${adrs.length})`);
});

test('ST-9: the techdocs entry point carries the opt-in marker', () => {
  const index = readFileSync(join(docs, 'index.md'), 'utf8');
  assert.match(index, /techdocs:\s*true/, 'docs/index.md must carry the "techdocs: true" frontmatter marker');
});
