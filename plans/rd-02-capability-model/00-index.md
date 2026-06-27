# RD-02 Capability Model & Auto-Config Implementation Plan

> **Feature**: A terminal **capability detection core** for `@blendsdk/tui` — produces an immutable `CapabilityProfile` (plus a per-field reason trace) via layered detection with safe fallback, a full override API, and a bounded runtime-query seam, so every later subsystem auto-configures with zero developer setup.
> **Status**: Planning Complete
> **Created**: 2026-06-27
> **Implements**: RD-02
> **CodeOps Skills Version**: 2.0.0

## Overview

RD-02 is the shared core behind both the shipped runtime adaptation and the
diagnostic probe (RD-03). It recognises the terminal it runs on and resolves a
`CapabilityProfile` through five ordered layers — **(1)** explicit override, **(2)**
bounded live runtime query, **(3)** environment, **(4)** known-terminal table,
**(5)** conservative defaults — recording which layer set each field.

Because the RD-06 input decoder does not exist yet (PL-1), layer 2 is built behind
an injectable `TerminalQuery` **seam**: callers may pass a query stream; when absent
layer 2 is skipped. The strict, length-bounded **response parser** is built and
tested now with stub streams (PL-8), so the timeout, demultiplexing, and
oversized/malformed acceptance criteria (AC-3/4/7) are all verified within RD-02.

This RD ships **no drawing/input behaviour** — it only detects and exposes
capabilities. Acting on them is RD-04/05/06/07.

## Document Index

| #   | Document | Description |
| --- | -------- | ----------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (audit trail) |
| 00  | [Index](00-index.md) | This document — overview and navigation |
| 01  | [Requirements](01-requirements.md) | Feature requirements and scope |
| 02  | [Current State](02-current-state.md) | Greenfield analysis on top of the RD-01 scaffolding |
| 03-01 | [Capability Model & Types](03-01-capability-model-and-types.md) | `CapabilityProfile`, reasons, options, public API shape |
| 03-02 | [Detection Layers](03-02-detection-layers.md) | env / table / defaults, per-field precedence, override merge, cache |
| 03-03 | [Runtime-Query Seam & Parser](03-03-runtime-query-and-security.md) | `TerminalQuery` seam, bounded response parser, timeout, security |
| 07  | [Testing Strategy](07-testing-strategy.md) | Specification test cases (ST-*) and verification |
| 99  | [Execution Plan](99-execution-plan.md) | Phases, sessions, and task checklist |

## Quick Reference

### Usage Examples

```ts
import { resolveCapabilities } from '@blendsdk/tui';

// Zero-config: detect from env + table + safe defaults.
const { profile, reasons } = resolveCapabilities();
profile.colorDepth; // 'truecolor' | '256' | '16' | 'mono'
reasons.colorDepth; // 'override' | 'runtime' | 'env' | 'table' | 'default'

// Power user / test: force fields (deep partial, merged over detection).
resolveCapabilities({ override: { mouse: { sgr: false } } }).profile.mouse.sgr; // false

// Re-resolve after a detected terminal change (otherwise cached per process).
resolveCapabilities({ refresh: true });
```

### Key Decisions

| Decision | Outcome | Ref |
| -------- | ------- | --- |
| Layer-2 runtime query | Injectable `TerminalQuery` seam (no-op default); parser built now | PL-1, PL-8 |
| Probe-dependent fields | Full type now; table/default values; refined in RD-03 | PL-2 |
| Should-haves | Reason trace + per-process cache, both now | PL-3, PL-14 |
| Module layout | `src/engine/capability/` subfolder | PL-4 |
| colorDepth precedence | override > NO_COLOR > FORCE_COLOR > COLORTERM > TERM/table > default | PL-5, PL-12 |
| Return shape | Frozen `{ profile, reasons }` | PL-6, PL-9 |
| Override | `DeepPartial<CapabilityProfile>`, deep-merged | PL-7 |
| Timeout | 200 ms default, `options.timeoutMs` | PL-11 |
| Response cap | 1 KB strict, length-bounded | PL-8 |

## Related Files

**Created by this plan (all under `src/engine/capability/`):**
- `profile.ts` — types: `CapabilityProfile`, `CapabilityReasons`, `CapabilityResolution`, `ResolveOptions`, `DeepPartial`
- `defaults.ts` — conservative layer-5 defaults (PL-13)
- `env.ts` — environment-signal reader (layer 3)
- `table.ts` — known-terminal table (layer 4, PL-10)
- `query.ts` — `TerminalQuery` seam + bounded response parser (PL-1, PL-8)
- `detect.ts` — per-field layered resolution + reason recording
- `index.ts` — public `resolveCapabilities` (override merge, cache, freeze)

**Modified:**
- `src/engine/index.ts` — re-export `resolveCapabilities` and the public types
- Tests under `test/` (per the project test-layout convention)
