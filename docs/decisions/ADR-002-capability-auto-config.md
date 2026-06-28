# ADR-002: Capability detection as runtime auto-configuration

> **Date**: 2026-06-28
> **Status**: Accepted
> **Source**: RD-02 (capability model & auto-config), RD-03 (capability probe)

## Context

Terminals vary enormously in colour depth, glyph support, mouse/keyboard
protocols, OSC features, and synchronized-output support. An app cannot hardcode
these, and asking the user to configure them is a poor experience. The engine needs
one authoritative description of "what can this terminal do" that every subsystem
reads.

## Options Considered

### Option A: Per-feature ad-hoc checks at each call site

- **Pros**: Simple to start; no central model.
- **Cons**: Duplicated, inconsistent detection; impossible to test holistically;
  no single source of truth.

### Option B: A resolved, frozen `CapabilityProfile` from layered detection

- **Pros**: One source of truth; layered (env → static table → bounded live query)
  with per-field provenance; deterministic and injectable for tests; doubles as
  zero-config auto-configuration.
- **Cons**: Up-front modelling effort; a live-query layer needs a bounded async path.

## Decision

**Chosen option**: Option B — `resolveCapabilities` / `resolveCapabilitiesAsync`
produce a deeply frozen `CapabilityProfile` that the render and host layers consume.

## Rationale

A single resolved profile makes terminal adaptation a data concern rather than
scattered control flow. Detection is layered and every field records the layer that
set it (`CapabilityReasons`), so behaviour is explainable and testable. Because all
inputs (`env`, `platform`, `TerminalQuery`, `timeoutMs`, `override`) are injectable,
the entire detector is unit-testable without a real terminal, and the same machinery
serves as **runtime auto-configuration** — apps adapt with zero configuration. The
live query is bounded (`timeoutMs`) and its responses are untrusted data.

## Consequences

### Positive

- Zero-config terminal adaptation; one source of truth for capabilities.
- Fully testable detection; explainable per-field provenance.
- The probe harness (RD-03) reuses the same model to survey real terminals.

### Negative

- The async layer-2 path adds a bounded-timeout code path to maintain.

### Risks

- A non-responding terminal must never hang detection — mitigated by the bounded
  `timeoutMs` fallback (verified by the RD-10 detection-budget test).
