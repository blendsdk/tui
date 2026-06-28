# Architecture Decision Records

This log tracks the significant architecture and design decisions made for
`jsvision`. Each decision is documented with context, options considered, and
rationale. Most were originally captured in the per-RD ambiguity registers under
`plans/*/00-ambiguity-register.md`; the ADRs here distil the cross-cutting ones.

## Decision Log

| #                                                | Date       | Decision                                               | Status      |
| ------------------------------------------------ | ---------- | ------------------------------------------------------ | ----------- |
| [ADR-001](ADR-001-esm-zero-dependency.md)        | 2026-06-28 | ESM-only, zero runtime dependencies                    | ✅ Accepted |
| [ADR-002](ADR-002-capability-auto-config.md)     | 2026-06-28 | Capability detection as runtime auto-configuration     | ✅ Accepted |
| [ADR-003](ADR-003-pure-core-injectable-seams.md) | 2026-06-28 | Pure core behind injectable seams                      | ✅ Accepted |
| [ADR-004](ADR-004-no-node-pty.md)                | 2026-06-28 | No node-pty; restore proven via the RuntimeAdapter     | ✅ Accepted |
| [ADR-005](ADR-005-sanitize-boundary.md)          | 2026-06-28 | A single canonical sanitize injection boundary         | ✅ Accepted |
| [ADR-006](ADR-006-informational-perf-bench.md)   | 2026-06-28 | Informational perf bench + skippable ceiling           | ✅ Accepted |
| [ADR-007](ADR-007-monorepo-restructure.md)       | 2026-06-28 | Monorepo (yarn + Turborepo), vitest, lockstep versions | ✅ Accepted |
| [ADR-008](ADR-008-layout-engine.md)              | 2026-06-28 | Layout engine — build cell-native vs Yoga/Taffy        | 🔬 Proposed |

## How to Read ADRs

Each ADR follows a standard format:

- **Context**: What situation or problem triggered this decision?
- **Decision**: What was decided?
- **Rationale**: Why was this chosen over alternatives?
- **Consequences**: What are the trade-offs and implications?

## When to Create an ADR

Create a new ADR when choosing a technology/pattern, deciding between valid
approaches, or making a decision that is hard to reverse or that future developers
will question.
