# Ambiguity Register: RD-05 Color & Styling

> **Status**: ✅ GATE PASSED — all 14 items resolved by explicit user decision
> **Last Updated**: 2026-06-27
> **Parent**: [Index](00-index.md)
> **Source RD**: [RD-05](../../requirements/RD-05-color-and-styling.md)

This register is the audit trail for the RD-05 plan. Every design, scope, naming,
and behavioral decision in the plan documents traces back to a numbered row here.
All rows were resolved by explicit user decision during the make_plan interview
(three clarifying batches + a scope confirmation), each option grounded in the
actual current code.

| #   | Category            | Ambiguity / Gap                                                                                                                      | Options Presented                                                                                       | User Decision                                                                                                                                                | Status      |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Naming & structure  | Where does RD-05 code live? (one-concern-per-dir pattern: capability/input/render/host/safety)                                       | A) New `src/engine/color/` · B) Extend `render/`                                                         | **A** — new `src/engine/color/` subsystem; `serialize()` consumes it via the existing `StyleEncoder` seam                                                     | ✅ Resolved |
| 2   | Data & state        | `Color`/`Ansi16Name`/`Attr`/`AttrMask`/`Style` live in `render/types.ts` (embedded in `Cell`/`Style`, shipped public). Move or keep? | A) Keep in `render/types.ts`; `color/` imports · B) Relocate to `color/`                                 | **A** — keep the type defs in `render/types.ts` (no RD-04 public-type churn); `color/` imports them and owns only encoding/palette/theme logic                | ✅ Resolved |
| 3   | Behavioral          | Should RD-05's depth-aware encoder become `serialize()`'s default? (`serialize.ts:144` defaults to the provisional `defaultEncodeStyle`) | A) Yes — replace the provisional default · B) Opt-in only                                                | **A** — `serialize()` downsamples by default; update the one RD-04 impl test (`render-serialize.impl.test.ts:95`) pinning the provisional 256 over-emit; truecolor spec oracles stay green | ✅ Resolved |
| 4   | Behavioral          | How does the seam encoder compose a cell's fg + bg + attrs?                                                                          | A) Merge into one SGR · B) Concatenate standalone SGRs                                                   | **A** — one merged `\x1b[1;4;48;2;…m` per run (fewer bytes; matches current `defaultEncodeStyle` `serialize.ts:107`); granular `encode()` still returns a standalone SGR per AC-1 | ✅ Resolved |
| 5   | Technical / algo    | Which distance metric drives nearest-256 / nearest-16? (must be deterministic + documented)                                          | A) Redmean weighted · B) Luminance-weighted · C) Plain Euclidean                                         | **A** — redmean weighted distance (low-cost perceptual approximation), compared on squared distance, deterministic                                           | ✅ Resolved |
| 6   | Technical / algo    | 256 candidate set + tie-break (AC-5 needs `#000000`→0, `#ffffff`→15 exact)                                                           | (Determined by AC-5; no viable alternative)                                                              | Full xterm 256 (base 16 + 6×6×6 cube + 24 gray); nearest by redmean; **ties → lowest index** so corner colors are exact. Cube-only was rejected (fails AC-5) | ✅ Resolved |
| 7   | Security & behavior | AC-6 requires `encode()` to throw on malformed colors, but cells store `Color` (the `#${string}` union admits `#zzz`). How to keep the render loop crash-safe? | A) `encode()` throws; seam degrades · B) Also validate at `ScreenBuffer` write                          | **A** — public `encode()` validates + throws (AC-6); the injected `StyleEncoder` is crash-safe (malformed color → no-color, never throws mid-render). No RD-04 buffer churn | ✅ Resolved |
| 8   | Data & state        | What typed error does `encode()` throw (AC-6)?                                                                                       | A) `InvalidColorError extends TuiError` (RD-08) · B) Standalone error / `TypeError`                      | **A** — `InvalidColorError extends TuiError`; adds an RD-05 → RD-08 import edge (RD-08 is implemented); keeps the uniform `TuiError` catch                    | ✅ Resolved |
| 9   | Scope               | What migrates from the prototype `theme.ts` (PALETTE / THEME roles / BOX+BLOCK glyphs)?                                              | A) PALETTE (full DOS-16) + THEME roles + typed `Theme` · B) PALETTE + minimal generic theming API only  | **A** — migrate the full DOS-16 `PALETTE` (completing the 16th color) + the semantic THEME roles as data behind a typed `Theme`; exclude BOX/BLOCK (RD-04 glyphs) and inheritance (Won't-Have) | ✅ Resolved |
| 10  | Scope               | Should-Have attribute fallback (italic→reverse) "gated on capability" — but `CapabilityProfile` (`profile.ts:63`) has no per-attribute field | A) Defer (DEF-1) · B) Include via explicit option · C) Include + add a caps field                        | **A (DEF-1)** — defer; "gated on capability" needs a caps field that doesn't exist, and adding one is an RD-02 change outside RD-05 scope                      | ✅ Resolved |
| 11  | Scope               | Must-Have "expose a stable per-cell style key" — but `serialize()` already merges runs by field compare (`serialize.ts:128`)        | A) Provide `styleKey(fg,bg,attrs)` · B) Skip (rely on field compare)                                     | **A** — provide a cheap stable `styleKey(fg,bg,attrs)` primitive (satisfies the Must-Have; usable for future caching); `serialize()` may keep its field compare | ✅ Resolved |
| 12  | Naming & structure  | Internal file layout of `color/` and the public API surface                                                                         | Proposed layout + surface (scope confirmation)                                                          | **Confirmed** — files `color.ts`/`palette.ts`/`downsample.ts`/`encode.ts`/`theme.ts`/`index.ts`; public surface per `01-requirements.md` §Public API         | ✅ Resolved |
| 13  | Behavioral          | `encode('default', …)` output; where AC-3 attribute encoding is verified                                                            | (Resolved in scope confirmation)                                                                        | `encode('default', …)` → `''` (no SGR; the per-run `SGR_RESET` handles terminal default — consistent with `serialize.ts:107`); attribute composition is internal, AC-3 verified through `encodeStyle` with default colors | ✅ Resolved |
| 14  | Testing             | How are AC-2 (deterministic mapping) and AC-5 (corners) pinned?                                                                      | (Resolved in scope confirmation)                                                                        | Export `nearest256`/`nearest16`; pin them with a fixed RGB→index **vector table** derived from the documented redmean algorithm (AC-2); corners asserted exact (AC-5) | ✅ Resolved |

### Resolution Notes

**AR-3:** `render-serialize.impl.test.ts:95-96` currently asserts the provisional
encoder over-emits truecolor (`38;2;255;0;0`) even at `colorDepth:'256'`. RD-05
supersedes that behavior, so this **impl** test is updated to expect the
downsampled `38;5;n`. The RD-04 truecolor **spec** oracles
(`render-serialize.spec.test.ts:115-131`) run at `truecolor` depth and stay green
unchanged.

**AR-5/AR-6:** Redmean squared distance for colors `(r1,g1,b1)`,`(r2,g2,b2)`:
`rmean=(r1+r2)/2`, `d² = (2 + rmean/256)·dr² + 4·dg² + (2 + (255-rmean)/256)·db²`.
Nearest = min `d²` over the candidate set; **ties resolve to the lowest index**.
The 256 reference uses the same ANSI-16 reference RGB as nearest-16 for indices
0–15, the 6×6×6 cube (levels `0,95,135,175,215,255`) for 16–231, and the gray
ramp (`8 + 10·k`, k=0..23) for 232–255.

**AR-8:** `InvalidColorError extends TuiError` (imported from `../safety/errors.js`).
This is the first non-RD-02 dependency for RD-05; recorded so `01-requirements.md`
lists RD-08 alongside RD-02 in dependencies.

**AR-10 (DEF-1):** Attribute fallback (italic→reverse, etc.) is deferred. Revisit
once an RD-02 capability field models per-attribute support, or implement via an
explicit encoder option in a later phase.

### Deferrals

- **DEF-1** — attribute fallback gated on capability (AR-10). Out of RD-05 scope.
