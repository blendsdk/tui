# API Stability & Supply Chain: RD-10

> **Document**: 03-04-api-stability-supply-chain.md
> **Parent**: [Index](00-index.md) · ST-8

## Overview

Document the public-API governance (SemVer + deprecation policy + changelog) and map
the supply-chain guarantees to existing enforcement. Provenance and a license guard are
deferred (DEF-1, DEF-2).

## Implementation Details

### CHANGELOG.md (Keep-a-Changelog) — AR-7

A new root `CHANGELOG.md` in Keep-a-Changelog format, manually maintained (no tooling
dep). Seed it with an `Unreleased` section and a `0.1.0` entry summarizing the foundation
(RD-01…RD-10). Future entries are added per change; releases move `Unreleased` items
under a dated version heading.

```markdown
# Changelog
All notable changes to @blendsdk/tui are documented here (Keep a Changelog; SemVer).

## [Unreleased]

## [0.1.0] — 2026-06-28
### Added
- Foundation: capability detection (RD-02), input decoder (RD-06), rendering engine
  (RD-04), color & styling (RD-05), host & lifecycle (RD-07), safety (RD-08),
  capability probe (RD-03), four-tier test strategy + acceptance gate (RD-09),
  and the non-functional baseline (RD-10).
```

### README "Versioning & stability" section — AR-7

A new README section documenting:
- **SemVer**: pre-1.0 the public API may change between minor versions (consistent with
  the existing heavy-development notice); post-1.0, breaking changes only on majors.
- **Public surface**: the exports of `src/engine/index.ts` are the contract; everything
  else (internal modules) is not part of the public API.
- **Deprecation policy**: a symbol is marked `@deprecated` (JSDoc) for at least one minor
  before removal in the next major; removals are recorded in `CHANGELOG.md`.

### Supply chain — mapped + deferred

| Item | Status | Where |
|------|--------|-------|
| `npm audit` no high/critical | **Mapped** | CI `audit` step (`.github/workflows/ci.yml`) |
| Zero native runtime deps | **Mapped** | `npm run check:deps` |
| Pure-JS / MIT runtime deps | **N/A today** (zero runtime deps); guard **deferred** | DEF-2 |
| npm provenance on publish | **Deferred** | DEF-1 — document the `npm publish --provenance` intent for the first release; cannot generate provenance without a real publish + CI OIDC |

### Consistency check — `test/api-stability.spec.test.ts` (ST-8, optional-light)

A small doc-presence spec (pure file reads, joins the unit glob): assert `CHANGELOG.md`
exists with an `## [Unreleased]` heading and a `0.1.0` entry, and that README contains a
"Versioning & stability" section. Keeps the governance artifacts from silently rotting,
mirroring how `gate.spec` guards the gate doc.

### Integration Points
- No engine code. Pure docs + one doc-presence spec.

## Error Handling

| Error case | Strategy | AR |
|------------|----------|----|
| CHANGELOG / policy section missing | `api-stability.spec` fails | AR-7 |
| A runtime dep added later | DEF-2 license guard revisited before it ships | AR-6 |
| Publish without provenance | DEF-1: provenance wired at first real release | AR-13 |

> **Traceability:** decisions reference `00-ambiguity-register.md`.

## Testing Requirements
- `api-stability.spec.test.ts`: ST-8 (CHANGELOG + README policy presence/headings).
