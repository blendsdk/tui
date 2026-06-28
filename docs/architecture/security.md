# Security Architecture

> **Last Updated**: 2026-06-28
> **See also**: the project's security coding standards (CLAUDE.md) for implementation-level rules.

## Threat Model

`@jsvision/core` is a client-side terminal library with **no network surface, no
persistence, and no telemetry**. The assets it protects are the integrity of the
terminal session and the host process. The principal threats are untrusted bytes —
text drawn to the screen and bytes read back from the terminal — being interpreted
as control sequences.

| Asset                      | Threat                                                          | Mitigation                                                                         | Status         |
| -------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------- |
| Terminal session integrity | Untrusted text injects escape sequences at render time          | Canonical `sanitize` boundary strips control bytes before they become cells        | ✅ Implemented |
| Detection robustness       | A malicious/slow terminal floods or stalls the capability query | Bounded response buffer (`RESPONSE_BUFFER_CAP`) + single bounded `timeoutMs`       | ✅ Implemented |
| Process stability          | Bad cell data / malformed colour crashes the render loop        | Render-path encoder degrades crash-safe; typed `TuiError` model                    | ✅ Implemented |
| Secret leakage             | Secrets/PII written to logs or capability dumps                 | `redactEvent` / screen-safe logger redact before output; nothing logged by default | ✅ Implemented |
| Supply chain               | A malicious/native transitive dependency                        | Zero runtime dependencies; `check:deps` guard; `npm audit` in CI                   | ✅ Implemented |

## Authentication & Authorization

Not applicable — the library has no users, accounts, sessions, or network
endpoints. It runs entirely in the host process with the privileges of the
invoking program.

## Data Protection

- **In transit / at rest**: none — the library neither transmits nor stores data.
- **PII handling**: the library handles no PII. The logger and `redactEvent`
  actively strip anything that looks like a secret/PII before any sink write.
- **Secrets**: none are read, embedded, or logged.

## Input Validation & Injection Prevention

The **canonical injection boundary** is `sanitize` (see
[ADR-005](/decisions/ADR-005-sanitize-boundary)). All text that becomes screen
cells passes through it (e.g. `ScreenBuffer.text`), so control bytes in untrusted
input can never reach the terminal as live escape sequences at serialize time.

Capability-query responses are treated as **untrusted data**: only exact,
fully-terminated grammar matches become capabilities; the response buffer is
length-bounded and discarded on overflow; everything else is forwarded as
passthrough input, never executed.

## Infrastructure & Supply-Chain Security

- **Zero runtime dependencies** ([ADR-001](/decisions/ADR-001-esm-zero-dependency)) —
  the runtime attack surface is the Node standard library only. Enforced by
  `npm run check:deps` (fails on any native runtime dep).
- **Dependency audit** — `npm audit --audit-level=high` runs in CI; the dev
  dependency surface is kept minimal (the RD-10 tree-shake check uses `esbuild`, a
  dev-only prebuilt binary with no compile step).
- **Provenance** — npm publish provenance is **deferred** until the first real
  release with CI OIDC (RD-10 DEF-1).
