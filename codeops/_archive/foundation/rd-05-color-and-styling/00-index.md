# Implementation Plan: RD-05 Color & Styling

> **Document**: 00-index.md
> **Implements**: RD-05
> **Status**: Ready for execution
> **Created**: 2026-06-27
> **CodeOps Skills Version**: 2.0.0
> **Source RD**: [RD-05](../../requirements/RD-05-color-and-styling.md)

## Overview

RD-05 is the **color & styling** layer. It turns app-specified colors into the
correct ANSI for the detected terminal depth (**truecolor → 256 → 16 → mono**),
encodes text attributes, validates color input, and ships the DOS-16 palette +
semantic theme primitives the Turbo Vision look needs. It is a new
`src/engine/color/` subsystem that fills the RD-04 `StyleEncoder` seam — the layer
that fixes the original "colors all wrong over SSH from a Mac" bug by
**downsampling** to what the terminal actually supports instead of assuming 24-bit.

## Documents

| Doc | Purpose |
| --- | ------- |
| [00-ambiguity-register.md](00-ambiguity-register.md) | Zero-Ambiguity Gate audit trail (14 items, all resolved) |
| [01-requirements.md](01-requirements.md) | Requirements, scope, public API surface |
| [02-current-state.md](02-current-state.md) | Current implementation analysis (the seam, the provisional encoder) |
| [03-01-color-encoding.md](03-01-color-encoding.md) | Color parse/validate, redmean downsampling, `encode`/`encodeStyle`/`styleKey`, `InvalidColorError` |
| [03-02-palette-and-theme.md](03-02-palette-and-theme.md) | DOS-16 `PALETTE` + typed `Theme` + default theme |
| [03-03-serializer-integration.md](03-03-serializer-integration.md) | Make `encodeStyle` the `serialize()` default; update the RD-04 impl test |
| [07-testing-strategy.md](07-testing-strategy.md) | Specification test cases (ST-1…ST-17) + verification |
| [99-execution-plan.md](99-execution-plan.md) | Phases, sessions, task checklist |

## Key Decisions (see the register)

- **New `src/engine/color/`** subsystem (AR-1); `Color`/`Attr` types stay in `render/types.ts` (AR-2).
- **Depth-aware `encodeStyle` becomes the `serialize()` default** (AR-3); fg+bg+attrs merge into **one** SGR (AR-4).
- **Redmean weighted distance**, nearest over the full xterm 256 / the 16 ANSI colors, **ties → lowest index** so corners are exact (AR-5, AR-6).
- **`encode()` throws `InvalidColorError`** (extends RD-08 `TuiError`) on malformed input; the injected seam **degrades crash-safe** (AR-7, AR-8).
- **DOS-16 `PALETTE` + semantic `Theme`** migrated from the prototype (AR-9); attribute fallback **deferred** (DEF-1, AR-10); **`styleKey()`** provided (AR-11).

## Dependencies

- **RD-02** (`CapabilityProfile.colorDepth`) — selects the encoding depth.
- **RD-04** (`StyleEncoder` seam, `Color`/`Attr` types, `serialize`) — the consumer.
- **RD-08** (`TuiError`) — base class for `InvalidColorError`.
