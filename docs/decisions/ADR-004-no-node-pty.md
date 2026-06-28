# ADR-004: No node-pty; restore proven via the RuntimeAdapter

> **Date**: 2026-06-28
> **Status**: Accepted
> **Source**: RD-07 (host & lifecycle), RD-09 (testing & acceptance)

## Context

The host's most important guarantee is that the terminal is **restored on every
exit path** — normal return, thrown error, and `SIGINT`/`SIGTERM`/`SIGHUP`. The
obvious way to test this is to drive the program under a real pseudo-terminal via
`node-pty`. But `node-pty` is a **native** dependency requiring node-gyp builds,
which conflicts with the zero-native-dependency stance ([ADR-001](/decisions/ADR-001-esm-zero-dependency)).

## Options Considered

### Option A: Test restore with a real PTY via `node-pty`

- **Pros**: Exercises the genuine TTY path end-to-end.
- **Cons**: Native dependency (node-gyp), cross-platform install fragility; violates
  the zero-native-dep policy even as a dev dep on all CI cells.

### Option B: Inject a `RuntimeAdapter`; verify restore with a fake + real-signal e2e

- **Pros**: No native dep; the restore logic is unit-tested against a fake adapter;
  a Tier-3 e2e spawns real child processes (`node --import tsx`) and delivers real
  signals to confirm restore without a PTY.
- **Cons**: The fake adapter must faithfully model the real TTY contract.

## Decision

**Chosen option**: Option B — the host runs behind an injectable `RuntimeAdapter`,
and restore-on-every-exit is proven by unit tests with a fake adapter plus the RD-09
Tier-3 e2e using real OS signals — no `node-pty`.

## Rationale

The restore guarantee is logic ("on any exit, run the teardown sequence exactly
once"), and logic is best tested deterministically against a fake. The remaining
risk — that signals actually trigger teardown — is covered by spawning real
children and sending real `SIGTERM`/`SIGHUP`. This keeps the dependency surface
pure (ADR-001) while still proving the behaviour that matters.

## Consequences

### Positive

- No native dependency anywhere in the toolchain; clean installs.
- Restore logic is deterministically unit-tested; signals are covered by e2e.

### Negative

- The fake `RuntimeAdapter` must be kept faithful to the real TTY semantics.

### Risks

- A real-PTY resize/`SIGWINCH` corner is deferred (RD-09 DEF-3) — manually
  confirmed, automated PTY coverage left for later.
