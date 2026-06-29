# Current State: RD-05 Color & Styling

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

RD-01, RD-02, RD-04, RD-06, RD-07, and RD-08 are Implemented. RD-05 consumes RD-02
+ RD-04 + RD-08 surfaces and **replaces** the provisional color encoder RD-04
shipped. No color subsystem exists yet; color logic today lives inline in the
RD-04 serializer as a deliberately minimal placeholder.

### What Exists

- **`src/engine/render/types.ts`** — the color/attribute data model: `Color`
  (`#${string} | Ansi16Name | 'default'`, `types.ts:33`), `Ansi16Name`
  (`types.ts:14`), the `Attr` bit constants (`types.ts:42`), `AttrMask`
  (`types.ts:36`), and `Style` (`types.ts:54`). The module JSDoc already states
  encoding `Color` + `AttrMask` to SGR "is the `StyleEncoder` seam's job (03-02 /
  RD-05), not the cell's." These types **stay** (AR-2).
- **`src/engine/render/serialize.ts`** — the `StyleEncoder` seam
  (`serialize.ts:28`), `RenderOptions` (`serialize.ts:31`), and the **provisional**
  `defaultEncodeStyle` (`serialize.ts:107`) which `serialize()` defaults to
  (`serialize.ts:144`). The provisional encoder:
  - emits attribute SGR codes always (`ATTR_SGR`, `serialize.ts:69`),
  - over-emits **24-bit truecolor** for any non-`default` color unless `mono`
    (`serialize.ts:112-117`) — it does **not** downsample to 256/16,
  - has an internal `ANSI16_RGB` reference table (`serialize.ts:49`) and a
    `colorToRgb` parser (`serialize.ts:80`) that returns `null` (never throws) on
    malformed input.
  RD-05 supersedes `defaultEncodeStyle`'s body with the depth-aware `encodeStyle`
  and moves the color tables/parsing into `color/` (AR-3).
- **`src/engine/render/ansi.ts`** — `CSI` (`ansi.ts:11`), `SGR_RESET`
  (`ansi.ts:14`) used to bound each run. RD-05's encoders emit `${CSI}…m`.
- **`src/engine/safety/errors.ts`** — `TuiError` base (RD-08); `InvalidColorError`
  extends it (AR-8).
- **`src/engine/capability/profile.ts`** — `ColorDepth`
  (`'mono'|'16'|'256'|'truecolor'`, `profile.ts:17`) and
  `CapabilityProfile.colorDepth` (`profile.ts:64`). **No per-attribute support
  field** — confirms AR-10 (DEF-1).
- **`_archive/prototype-2026-06-27/src/tui/theme.ts`** — the reference `PALETTE`
  (15 DOS colors; the 16th, a bright magenta, is added in RD-05), the semantic
  `THEME` roles, and BOX/BLOCK glyphs (excluded — RD-04 concern). `color.ts` there
  has only `hexToRgb` (truecolor; no downsampling — RD-05's nearest mapping is new).

### Relevant Files

| File | Purpose | Changes Needed |
| ---- | ------- | -------------- |
| `src/engine/render/types.ts` | `Color`/`Ansi16Name`/`Attr`/`Style` | **None** — `color/` imports them (AR-2) |
| `src/engine/render/serialize.ts` | seam + provisional encoder + `serialize` | Replace `defaultEncodeStyle` body with a call into `color/`'s `encodeStyle`; remove the inline `ANSI16_RGB`/`colorToRgb`/`ATTR_SGR` (moved to `color/`) |
| `src/engine/render/index.ts` | render re-exports | **None** (encoder stays seam-injected; `defaultEncodeStyle` export retained, now depth-aware) |
| `src/engine/safety/errors.ts` | `TuiError` base | **None** — read only (extend) |
| `src/engine/capability/profile.ts` | `ColorDepth` | **None** — read only |
| `src/engine/color/*` | RD-05 subsystem | **New** — `color.ts`, `palette.ts`, `downsample.ts`, `encode.ts`, `theme.ts`, `index.ts` |
| `src/engine/index.ts` | public entry point | **Add** an RD-05 `color/` re-export block |
| `test/render-serialize.impl.test.ts` | RD-04 impl test | Update line 95 (256-depth now downsamples, AR-3) |

## Gaps Identified

### Gap 1: No depth-aware downsampling
**Current:** the encoder over-emits truecolor at every non-mono depth
(`serialize.ts:112`). **Required:** nearest-256 and nearest-16 mapping driven by
`caps.colorDepth` (AR-3, AR-5, AR-6).

### Gap 2: No color validation
**Current:** `colorToRgb` returns `null` silently on malformed input
(`serialize.ts:97`). **Required:** `encode()` throws `InvalidColorError`; the seam
degrades crash-safe (AR-7, AR-8).

### Gap 3: No palette / theme primitives
**Current:** none in the built package (only in the archived prototype).
**Required:** DOS-16 `PALETTE` + typed `Theme` + default theme (AR-9).

### Gap 4: No exposed style key
**Current:** `serialize()` merges runs by inline field comparison
(`serialize.ts:128`). **Required:** an exposed `styleKey()` primitive (AR-11).

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Replacing `defaultEncodeStyle` breaks an RD-04 oracle | Med | High | The truecolor spec oracles (`render-serialize.spec.test.ts:115-131`) run at `truecolor` depth → output unchanged. Only the one 256-depth **impl** test (`:95`) updates, deliberately (AR-3). |
| A malformed color crashes the host render loop | Low | High | The injected `encodeStyle` is crash-safe (malformed → no-color); only the direct `encode()` API throws (AR-7). |
| Nearest-color results drift from the documented algorithm | Low | Med | The redmean formula + candidate set + tie-break are documented (AR-5/AR-6); a fixed RGB→index vector table pins them (AC-2/ST-5). |
| Malformed color leaks arbitrary bytes into the SGR stream | Low | High | Encoders emit only numeric SGR params from validated values; `encode()` validates first (AC-7/ST-13). |

## Dependencies

### Internal
- RD-02 `CapabilityProfile.colorDepth` / `ColorDepth`.
- RD-04 `Color`/`Ansi16Name`/`Attr`/`AttrMask`, the `StyleEncoder` seam, `serialize`.
- RD-08 `TuiError`.

### External
- None. Node built-ins only; zero runtime dependencies (the `check:deps` guard applies).
