# ADR-003: Pure core behind injectable seams

> **Date**: 2026-06-28
> **Status**: Accepted
> **Source**: RD-04 (rendering), RD-05 (color), RD-07 (host)

## Context

A terminal engine is inherently side-effecting — it reads bytes from and writes
escape sequences to a live TTY. But side-effecting code wired directly to
`process.stdin`/`stdout` is hard to test and couples every subsystem to the host
environment.

## Options Considered

### Option A: Subsystems talk to Node streams/TTY directly

- **Pros**: Less indirection; fewer interfaces.
- **Cons**: Untestable without a real terminal; rendering/decoding entangled with
  I/O; no way to substitute behaviour.

### Option B: Pure functional core + a few well-named injectable seams

- **Pros**: Rendering (`serialize`), decoding (`decode`), and colour (`encodeStyle`)
  are pure transforms; the only I/O lives behind a `RuntimeAdapter`; capabilities
  use a `TerminalQuery` seam; the encoder is a `StyleEncoder` seam. Everything is
  unit-testable with fakes.
- **Cons**: A handful of interfaces to define and thread through.

## Decision

**Chosen option**: Option B — keep the core pure and isolate all side effects and
substitutable behaviour behind three seams: `RuntimeAdapter` (host I/O),
`TerminalQuery` (capability queries), and `StyleEncoder` (colour encoding).

## Rationale

Purity makes the bulk of the engine testable as plain functions: golden-screen
tests drive a headless emulator, decoding is fuzzed, and byte-proportionality is
asserted deterministically. The seams concentrate the untestable parts into small,
mockable surfaces — the host's restore guarantee is proven with a fake adapter
(see [ADR-004](/decisions/ADR-004-no-node-pty)), and `serialize` defaults to the
RD-05 `encodeStyle` but accepts any encoder.

## Consequences

### Positive

- High test coverage without a real TTY; deterministic specs.
- Subsystems are decoupled and independently evolvable.

### Negative

- Slightly more interface surface to define and document.

### Risks

- Seam interfaces must stay minimal so they do not leak host concerns into the pure
  core — kept in check by code review against the public surface.
