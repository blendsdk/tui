# ADR-005: A single canonical sanitize injection boundary

> **Date**: 2026-06-28
> **Status**: Accepted
> **Source**: RD-08 (essentials gate, logging, errors & security)

## Context

Untrusted text — user input, file contents, network data an app chooses to display —
can contain control bytes and escape sequences. If such bytes reach the terminal as
live cells, they can move the cursor, change modes, or inject sequences (a terminal
injection attack). The engine needs a guaranteed point where this can never happen.

## Options Considered

### Option A: Sanitize at each draw call site, ad-hoc

- **Pros**: Localized.
- **Cons**: Easy to forget one path; inconsistent rules; no single guarantee.

### Option B: One canonical `sanitize` boundary that all text crosses

- **Pros**: A single, audited choke point; `ScreenBuffer.text` (and any text→cell
  path) routes through it, so control bytes never become cells; one place to reason
  about and test the rules.
- **Cons**: Must ensure every text→cell path actually goes through it.

## Decision

**Chosen option**: Option B — `sanitize` (exported from `safety/`) is the single
canonical injection boundary; all untrusted text becomes cells only after passing
through it.

## Rationale

Concentrating the rule in one function makes the security property auditable and
testable in isolation: control bytes are stripped before they can be serialized into
escape sequences (RD-04 AC-8). Because `ScreenBuffer.text` sanitizes its input, an
app cannot accidentally bypass the boundary by drawing untrusted strings. Capability
responses are handled with the same untrusted-data posture (bounded, parsed as data
only).

## Consequences

### Positive

- A single, audited injection choke point; testable in isolation.
- Apps get injection safety by default when drawing text.

### Negative

- Every new text→cell path must be routed through `sanitize` (enforced by review).

### Risks

- A future direct cell-write API could bypass the boundary — such APIs must document
  that they take pre-sanitized input or sanitize internally.
