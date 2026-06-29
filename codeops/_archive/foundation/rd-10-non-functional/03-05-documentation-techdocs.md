# Documentation (Architecture + API Reference + ADRs): RD-10

> **Document**: 03-05-documentation-techdocs.md
> **Parent**: [Index](00-index.md)

## Overview

Deliver RD-10's documentation requirement — a public API reference, an architecture
overview, and an ADR set — by invoking the **techdocs skill** (AR-5), rather than
hand-authoring. The RD-03 `terminal-matrix.json` and `examples/` already supply the
support-matrix and runnable-examples halves of the docs requirement.

## Implementation Details

### Generate via the techdocs skill (AR-5, FR-12, FR-14)

During execution, run the **techdocs skill** (`make_techdocs`) to produce a VitePress-
compatible `docs/` set covering, at minimum:

- **System overview / architecture** — the foundation-first layering and the
  subsystem map (capability, input, render, color, host, safety) with the single
  public entry point.
- **API reference** — the public surface (`src/engine/index.ts` exports), generated
  from the existing JSDoc the codebase already carries.
- **ADRs** — the consequential decisions already recorded across the RDs' ambiguity
  registers (e.g. zero-native-deps, no-node-pty, `StyleEncoder` seam, ESM-only,
  canonical `sanitize` boundary), captured as architecture decision records.

`docs/acceptance-gate.md` (RD-09) coexists with the generated set.

### Boundaries

- The techdocs skill **owns** the doc structure, generation, and its own quality
  check; this plan only schedules its invocation and verifies the outputs exist.
- If the project has not opted into techdocs auto-updates, the execution step runs it
  explicitly once for RD-10.
- Product/end-user docs are out of scope (techdocs is architecture/developer docs).

### Acceptance evidence

| RD-10 docs requirement | Satisfied by |
|------------------------|--------------|
| Public API reference | techdocs API reference (from JSDoc) |
| Architecture / ADRs | techdocs system overview + ADR set |
| Capability/terminal support matrix | RD-03 `terminal-matrix.json` (mapped) |
| Runnable examples | `examples/capability-probe`, `examples/resize-demo` (mapped) |

### Integration Points
- No engine code. The execution step invokes the techdocs skill and then confirms
  `docs/` contains the generated overview + API reference + ADR files.

## Error Handling

| Error case | Strategy |
|------------|----------|
| techdocs output incomplete | Re-run the techdocs skill; it is idempotent/re-runnable |
| Generated docs drift from code | Generated at execution time from current source/JSDoc; re-run on change |

> **Traceability:** decisions reference `00-ambiguity-register.md` (AR-5).

## Testing Requirements
- `docs-presence.spec.test.ts` (ST-9, PF-009): a small pure-file-read spec asserting
  `docs/` contains the generated architecture overview, the API reference, and at least
  one ADR file — mirroring how `gate.spec` guards the gate doc, so the generated set
  can't silently rot or go uncommitted without `verify` noticing. Joins the unit glob.
- The techdocs skill's own health check runs alongside, during the docs phase verify.
