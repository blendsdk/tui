# Current State: RD-02 Capability Model & Auto-Config

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

RD-01 produced a clean ESM/TypeScript scaffold: `src/engine/index.ts` exports only
`VERSION`. There is **no capability detection code** — RD-02 is greenfield on top of
the scaffolding. The archived Ink prototype (`_archive/prototype-2026-06-27/`)
contains `src/tui/ansi.ts`, `color.ts`, and `app/input.ts`, which touch ANSI/color
concepts and may inform the env/color heuristics, but per **PL-1 (RD-01)** they are
**inspiration only**, not migrated.

Key facts grounding the plan:
- Toolchain (from `CLAUDE.md`): TypeScript ESM NodeNext, `node:test` via `tsx`,
  ESLint + Prettier, `npm run verify` = typecheck + test + build.
- **Tests live in `test/`** only (project convention), named `*.spec.test.ts` /
  `*.impl.test.ts`; they import source via `../src/engine/...`.
- Zero runtime dependencies; the `check:deps` guard forbids native deps. RD-02 adds
  **no** runtime dependencies (pure-JS detection over `process.env`/`process.platform`).
- Single public entry point: new public symbols are re-exported from `src/engine/index.ts`.

### Relevant Files

| File / Dir | Purpose (current) | Changes Needed |
| ---------- | ----------------- | -------------- |
| `src/engine/index.ts` | Exports `VERSION` | Add re-exports of `resolveCapabilities` + public types |
| `src/engine/` | Only `index.ts`, `version.ts` | Add `capability/` subfolder (PL-4) |
| `test/` | RD-01 packaging/toolchain tests | Add capability spec/impl tests |
| `_archive/.../src/tui/{ansi,color}.ts` | Prototype color/ANSI helpers | Reference only (PL-1); not imported |

### Code Analysis

The scaffold imposes the constraints RD-02 must honor: ESM with `.js` import
specifiers, `strict` + `noUnusedLocals`/`noUnusedParameters`, files 200–500 lines,
JSDoc on public symbols, and the foundation-first single-entry rule. The
capability module is therefore split into focused files (PL-4) rather than one large
file. Nothing in the current tree depends on capability detection, so adding it is
additive and low-risk.

## Gaps Identified

### Gap 1: No capability model or detection
**Current:** none. **Required:** immutable `CapabilityProfile` + reasons via layered
detection (RD-02). **Fix:** build `src/engine/capability/**`.

### Gap 2: No runtime-query path (and no RD-06 yet)
**Current:** none; RD-06 input decoder absent. **Required:** bounded, demultiplexed
runtime query (AC-3/4/7). **Fix:** `TerminalQuery` seam + bounded parser now (PL-1/PL-8);
RD-06 wires the real stream later.

### Gap 3: Public API not exposed
**Current:** only `VERSION` exported. **Required:** `resolveCapabilities` + types from
the single entry point. **Fix:** re-export from `src/engine/index.ts`.

## Dependencies

### Internal
- **RD-01** (scaffolding) — done. Provides the package, build, test, lint toolchain.
- **RD-06** (input system) — **not yet built**; provides the real layer-2 stream. RD-02
  defines the seam so it can integrate without rework (PL-1).

### External (dev only)
- None added. Detection is pure-JS over Node built-ins; **zero new runtime deps** (AC-4 of RD-01 stays green).

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Layer-2 seam diverges from RD-06's real decoder | Medium | Medium | Keep the seam minimal (a byte-stream in, parsed responses + passthrough out); RD-06 implements that contract |
| `CapabilityProfile` type churns when RD-03 adds probe detail | Low | Medium | PL-2: define the full type now; RD-03 only changes *values/reasons*, not the shape |
| Untrusted query responses cause unbounded read / crash | Medium | High | PL-8: strict grammar + 1 KB length bound; AC-7 spec test with a 64 KB no-terminator stream |
| Env precedence subtly wrong (NO_COLOR vs FORCE_COLOR) | Medium | High | PL-5 fixes the order; ST-4/5/6/7 lock it down |
| Cross-platform env differences (Windows `WT_SESSION`) | Low | Medium | Table keyed by `WT_SESSION`/`TERM_PROGRAM`/`TERM`; detection is pure env reads |
