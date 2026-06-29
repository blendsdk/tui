# 02: Current State Analysis

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## What exists

### RD-02 capability profile (the driver) — shipped
`src/engine/capability/profile.ts` defines the immutable `CapabilityProfile` RD-04
reads to drive every adaptive behavior:

- `colorDepth: 'mono' | '16' | '256' | 'truecolor'` — drives the `StyleEncoder` (PL-1).
- `sync2026: boolean` — drives synchronized-output wrapping (M5, AC-3).
- `glyphs: { boxDrawing, halfBlocks }` — drives glyph fallback (M6, PL-9, AC-4).
- `unicode: { utf8, widthMode: 'wcwidth'|'ambiguous-wide', emoji }` — drives width
  (M2, PL-10, AC-2) and the non-UTF-8 fallback (PL-9).
- `osc: { hyperlink8, clipboard52, title, notify9, notify777, notify99, progress9_4 }`
  — drives OSC features + the `notify()` ladder (M8, PL-11, AC-5).

`resolveCapabilities()` returns a deep-frozen `{ profile, reasons }`. RD-04 reads
`profile` only; it never mutates or re-resolves.

### RD-06 input decoder — shipped
`src/engine/input/` is independent of RD-04 (input vs output). No shared code beyond
the eventual sanitizer being an output concern. The `render/sanitize.ts` module (PL-2,
PL-16) is **new**; it does not touch RD-06.

### The prototype (reference only, NOT migrated wholesale)
`_archive/prototype-2026-06-27/src/tui/`:

| File | What it proves | What RD-04 changes |
| ---- | -------------- | ------------------ |
| `buffer.ts` | Object `ScreenBuffer` with `set/get/fillRect/text/box/shadow/rows` | Add `width` + `attrs` to `Cell`; width-correct `text()`; `Color` type (PL-7, PL-17) |
| `serialize.ts` | Run-merged, absolute-positioned, flicker-free paint | **Full-frame → damage diff** vs a previous frame (PL-5); sync wrap; `StyleEncoder` seam (PL-1) |
| `ansi.ts` | Cursor moves, SGR, alt-screen, sync constants vocabulary | Re-derive a clean `render/ansi.ts` (cursorTo, SGR reset, `?2026`); drop hardcoded 24-bit `fg`/`bg` (now the encoder's job) |
| `color.ts` | `#rrggbb` → rgb | Used by the minimal default truecolor encoder only; full encoding is RD-05 |
| `theme.ts` | `BOX` single/double glyphs (`┌─┐│` / `╔═╗║`), half-block shadow glyphs | `BOX` glyph set informs `glyphs.ts`; the DOS palette/theme is **RD-05**, out of scope |

Per the project's clean-slate rule (`CLAUDE.md`), the prototype is inspiration; RD-04
writes fresh, idiomatic modules under `src/engine/render/` rather than copying files.

## What's missing (this RD builds it)

1. The cell/buffer model with width + attributes (`render/{types,buffer,width}.ts`).
2. The pure damage-diff serializer + sync wrap + `StyleEncoder` seam (`render/{ansi,serialize}.ts`).
3. Capability-driven glyph fallback (`render/glyphs.ts`).
4. The provisional shared sanitizer + OSC features + cursor (`render/{sanitize,osc,cursor}.ts`).
5. The public surface (`render/index.ts`) + `src/engine/index.ts` re-exports + README.

## Impact & risk

| Area | Change | Risk | Mitigation |
| ---- | ------ | ---- | ---------- |
| `src/engine/render/**` | New subsystem (greenfield) | Low | Spec-first; isolated from shipped code |
| `src/engine/index.ts` | Add re-exports | Low | Additive only; RD-02/RD-06 exports untouched |
| `render/sanitize.ts` | New security boundary, **provisional** (RD-08 owns later) | Medium | Real (not stubbed) control-stripping; full security ST coverage (ST-8/14); documented as provisional |
| `StyleEncoder` seam | Minimal default now; RD-05 supersedes | Medium | Seam is injectable; default is documented as truecolor/mono-only; RD-05 adds depths with no API change |
| Character width table | Hand-maintained Unicode ranges | Medium | Cover AC-2 (`世`) + common CJK/emoji; documented ranges; impl tests at boundaries |

## Constraints (from `CLAUDE.md`)

- ESM-only, NodeNext `.js` import specifiers on `.ts` sources; zero runtime deps.
- Foundation-first single public entry point; target 200–500 lines per file.
- Tests under `test/` only; `*.spec.test.ts` immutable oracle vs `*.impl.test.ts`.
- Public symbols carry JSDoc; verify before commit; no raw git in plan docs.
