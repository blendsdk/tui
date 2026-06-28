# Development Workflow

> **Last Updated**: 2026-06-28

## Coding Conventions

Conventions are defined in the project's `CLAUDE.md` and the global CodeOps coding
standards. Highlights specific to this codebase:

- **ESM-only, zero runtime dependencies** — pure-JS only; the `check:deps` guard
  fails any native runtime dep ([ADR-001](/decisions/ADR-001-esm-zero-dependency)).
- **Foundation-first layering** with a single public entry point
  (`src/engine/index.ts`); every subsystem re-exports its public symbols there.
  Target 200–500 lines per file.
- **NodeNext import specifiers** use the `.js` extension even for `.ts` sources
  (e.g. `from './version.js'`).
- **Public/exported symbols carry JSDoc** (purpose, params, returns, side effects).
- **Tests live in `test/` only** — never colocated with source.

## Branch Strategy

Main branch is `master`. Work on feature branches; commit scope is the area touched
(`scaffold`, `render`, `color`, `host`, `safety`, `tests`, `docs`, …). Run
`npm run verify` before every commit.

## Testing Strategy

Tests are plain `node:test` run through `tsx` — no third-party test framework. They
follow a strict split (see the project's testing standards):

- **`*.spec.test.ts`** — specification tests. An **immutable oracle** derived from
  requirements/acceptance criteria, never from reading the implementation. If a spec
  test fails after a change, the implementation is wrong, not the test.
- **`*.impl.test.ts`** — implementation/edge-case tests (internals, error paths).
- **`*.e2e.test.ts`** — end-to-end (run explicitly or via `npm run gate`).

```bash
npm test                                    # unit tiers (spec + impl)
npx tsx --test test/host-tier3.e2e.test.ts  # RD-09 Tier-3: restore on every exit path
npm run gate                                # full go/no-go gate
```

The four test tiers (RD-09): a data-driven input corpus, golden-screen via
`@xterm/headless` across all colour depths, the no-PTY Tier-3 restore e2e, and
seeded decoder fuzz + byte-proportionality. RD-10 adds the perf-budget ceiling,
the esbuild tree-shake check, the a11y/degradation golden tests, and the
detection-budget test.

## Spec-First Task Ordering

The project follows CodeOps spec-first ordering: write spec tests → confirm red →
implement → confirm green → add impl tests → full verify. A `*.spec.test.ts` is an
immutable oracle; do not weaken it to match broken code.

## Common Patterns

### Pure transform + injectable seam

Rendering, decoding, and colour encoding are pure functions; side effects live
behind a seam (`RuntimeAdapter`, `TerminalQuery`, `StyleEncoder`). When adding
behaviour, prefer a pure function plus a seam over reaching for a Node API directly
([ADR-003](/decisions/ADR-003-pure-core-injectable-seams)).

### Capability-driven rendering

Draw real Unicode/colour into the buffer; let `serialize` + the `StyleEncoder` and
glyph fallback downgrade output to the detected capability. There is no second
buffer for "ASCII mode" — the same frame renders correctly on a capable or a minimal
terminal.

### Untrusted text → `sanitize`

Any text derived from untrusted input must reach cells only through `sanitize`
(`ScreenBuffer.text` already does this). Never write raw untrusted bytes to the
terminal ([ADR-005](/decisions/ADR-005-sanitize-boundary)).

## Pre-Commit Checklist

| Check                          | Command              |
| ------------------------------ | -------------------- |
| Verify (build + test)          | `npm run verify`     |
| Lint + format                  | `npm run lint`       |
| Dependency policy              | `npm run check:deps` |
| Acceptance gate (for releases) | `npm run gate`       |
