# RD-04 Rendering Engine — Implementation Plan

> **Implements**: RD-04
> **CodeOps Skills Version**: 2.0.0
> **Status**: 📋 Plan Created — ready for exec_plan
> **Created**: 2026-06-27
> **Source RD**: [RD-04](../../requirements/RD-04-rendering-engine.md)
> **Depends on**: RD-01 (scaffolding), RD-02 (capability profile)

The output engine: a width-correct cell buffer apps draw into, a damage-diffing
serializer that emits **only changed cells**, synchronized output to prevent
tearing, capability-driven glyph fallback, and the OSC feature surface
(hyperlinks, clipboard, title, bell, `notify()`) — every behavior driven by
RD-02's capability profile.

## Document Index

| Doc | Purpose |
| --- | ------- |
| [00-ambiguity-register.md](00-ambiguity-register.md) | Zero-Ambiguity Gate — 17 resolved `PL-*` decisions (✅ GATE PASSED) |
| [01-requirements.md](01-requirements.md) | Scope, requirements, acceptance criteria mapped to ST-* |
| [02-current-state.md](02-current-state.md) | Prototype to evolve, RD-02 integration, impact/risk |
| [03-01-cell-and-buffer-model.md](03-01-cell-and-buffer-model.md) | `Color`/`AttrMask`/`Cell` types, `ScreenBuffer`, character width |
| [03-02-diff-serializer.md](03-02-diff-serializer.md) | Pure damage-diff `serialize()`, run-merge, sync output, `StyleEncoder` seam |
| [03-03-glyph-fallback.md](03-03-glyph-fallback.md) | Capability-driven ASCII glyph substitution |
| [03-04-osc-sanitizer-cursor.md](03-04-osc-sanitizer-cursor.md) | `sanitize()`, OSC features, `notify()` ladder, cursor control |
| [07-testing-strategy.md](07-testing-strategy.md) | ST-1…ST-14 spec cases + impl coverage + verification gate |
| [99-execution-plan.md](99-execution-plan.md) | 4 phases · 12 sessions · Master Progress Checklist |

## Key Decisions (see the register for the full audit trail)

| Decision | Choice | PL |
| -------- | ------ | -- |
| Color before RD-05 | `StyleEncoder` seam + minimal truecolor/mono default | PL-1, PL-14 |
| Sanitize before RD-08 | Shared real `sanitize()` now; RD-08 owns later | PL-2, PL-16 |
| Cell backing | Per-cell objects (migrate prototype); typed-array deferred | PL-3, DEF-2 |
| Module layout | `src/engine/render/` | PL-4 |
| Diff state | Pure `serialize(current, previous, options)` | PL-5 |
| Output | `string` (one coalesced frame) | PL-6 |
| `Color` type | String union (`#rrggbb` \| named-16 \| `default`) | PL-7 |
| Cursor | Show/hide/move now; shape deferred | PL-8, DEF-1 |

## Public API (re-exported from `src/engine/index.ts` on completion)

```ts
// buffer & model
ScreenBuffer, type Cell, type Color, type Style, type AttrMask, Attr, charWidth
// serialize
serialize  // (current, previous, options) => string
// osc / cursor / text
sanitize, hyperlink, setClipboard, setTitle, bell, notify, cursor
// options & types
type RenderOptions, type StyleEncoder, type Sanitizer
```

## Related Files

- Evolves: `_archive/prototype-2026-06-27/src/tui/{buffer,serialize,ansi,color,theme}.ts` (reference only — not migrated wholesale; clean-slate per project policy).
- Reads: `src/engine/capability/profile.ts` (`CapabilityProfile`: `colorDepth`, `sync2026`, `glyphs`, `osc`, `unicode`).
- Modifies: `src/engine/index.ts` (public re-exports), `README.md` (new section).
