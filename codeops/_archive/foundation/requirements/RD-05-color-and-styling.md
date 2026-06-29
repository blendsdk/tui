# RD-05: Color & Styling

> **Document**: RD-05-color-and-styling.md
> **Status**: Draft
> **Created**: 2026-06-27
> **Project**: @blendsdk/tui (Foundation)
> **Depends On**: RD-02
> **CodeOps Skills Version**: 2.0.0

---

## Feature Overview

The color and text-attribute layer. It turns app-specified colors into the correct
ANSI for the detected depth (**truecolor → 256 → 16 → monochrome**), encodes text
attributes (bold, italic, underline, …), and honors `NO_COLOR`. This is the layer that
fixes the original "colors all wrong over SSH from a Mac" bug: instead of assuming
24-bit color, it **downsamples** to what the terminal actually supports. It also
provides the DOS-style 16-color palette primitives the Turbo Vision look needs.

---

## Functional Requirements

### Must Have
- [ ] A `Color` type accepting `#rrggbb`, a named ANSI-16 color, or `default`.
- [ ] **Depth-aware encoding** driven by `caps.colorDepth`:
  - `truecolor` → `38;2;r;g;b` / `48;2;r;g;b`
  - `256` → nearest of the 6×6×6 cube + 24 grays → `38;5;n` / `48;5;n`
  - `16` → nearest of the 16 ANSI colors → `3x`/`4x`/`9x`/`10x`
  - `mono` → no color SGR; rely on attributes only
- [ ] **Nearest-color mapping** must be deterministic and perceptually reasonable (weighted RGB distance), with a documented algorithm.
- [ ] **Text attributes**: bold(1), dim(2), italic(3), underline(4), blink(5), reverse(7), strikethrough(9), plus their resets; combinable as a bitmask.
- [ ] **`NO_COLOR`/mono**: when depth is `mono`, emit no color but still emit attributes so UI remains legible (reverse/bold convey state).
- [ ] **DOS 16-color palette** constants (the Borland palette) and a semantic theme structure (migrated from the prototype `theme.ts`).
- [ ] Run-merging friendliness: expose a stable per-cell style key so the serializer (RD-04) can merge identical adjacent styles.

### Should Have
- [ ] Optional attribute fallback when an attribute is unsupported (e.g. italic → reverse) gated on capability.
- [ ] A small palette-theming API (named semantic roles → colors) as a primitive for the future UI layer (not the UI itself).

### Won't Have (Out of Scope)
- Hierarchical Turbo Vision palette *inheritance* (view-tree color mapping) — UI layer, out of phase.
- Color *rendering* / buffer composition — RD-04.

---

## Technical Requirements

### Encoding pipeline
```
encode(color, role: fg|bg, depth):
  if depth == mono: return ""            # attributes only
  rgb = toRgb(color)
  switch depth:
    truecolor: return SGR(38|48 ;2; r;g;b)
    256:       return SGR(38|48 ;5; nearest256(rgb))
    16:        return SGR(nearest16(rgb) as 30-37/40-47/90-97/100-107)
```

### Nearest-color tables
| Depth | Target space | Method |
|-------|--------------|--------|
| 256 | 16 base + 6×6×6 cube + 24 gray | min weighted-RGB distance; prefer gray ramp for near-grays |
| 16 | 8 normal + 8 bright ANSI | min weighted-RGB distance against a fixed reference RGB table |

### Attribute mask
`bold|dim|italic|underline|blink|reverse|strike` → composed SGR parameter list; resets emitted on style change by the serializer.

---

## Integration Points

### With RD-02
- Reads `caps.colorDepth`; respects `NO_COLOR`/`FORCE_COLOR` already resolved into the profile.

### With RD-04
- The renderer calls this layer to produce the SGR prefix for each style run.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Floor | truecolor-only / down to 16+mono | Downsample truecolor→256→16→mono | Fixes SSH/Mac bug; broad support | AR-12 |
| Mono behavior | drop styling / attributes-only | Attributes-only legibility | `NO_COLOR` users keep usable UI | AR-12 |
| Palette | none / DOS-16 + semantic roles | Provide both as primitives | TV look needs the DOS palette | AR-12 |

---

## Security Considerations

- **Data sensitivity**: none (colors/attributes only).
- **Input validation**: validate `#rrggbb` format and named-color membership; reject malformed color strings rather than emitting partial SGR (a malformed color must not let arbitrary bytes into the SGR stream).
- **Authentication & authorization**: n/a.
- **Injection risks**: color/attribute encoders only ever emit numeric SGR parameters from validated inputs — no passthrough of caller strings.
- **Encryption needs**: none.
- **Rate limiting**: n/a.
- **Infrastructure**: none.

---

## Acceptance Criteria

1. [ ] `encode('#0000a8','bg','truecolor')` returns `\x1b[48;2;0;0;168m`; the same color at `'256'` returns a `48;5;n` whose `n` is the documented nearest cube index; at `'16'` returns `44` or `104` (nearest ANSI blue); at `'mono'` returns `''`.
2. [ ] Nearest-color mapping is deterministic: the same input color + depth always yields the same index (unit-tested against a fixed vector table).
3. [ ] An attribute set `{bold, underline}` encodes to `\x1b[1;4m` and resets correctly when the next cell has no attributes.
4. [ ] With `colorDepth: 'mono'`, no `38`/`48` parameters are ever emitted, but a `reverse` attribute still emits `\x1b[7m` (legibility preserved).
5. [ ] Boundary: pure black `#000000` and pure white `#ffffff` map to ANSI 0/30 and 15/97 respectively at their depths (corner colors are exact, not rounded away).
6. [ ] Negative/security: `encode('#zzz', ...)` and `encode('rgb(1,2,3)', ...)` throw a typed validation error and emit no bytes (malformed colors cannot leak into the SGR stream).
7. [ ] Security requirements verified: color inputs are format-validated; encoders emit only numeric SGR from validated values; tested against malformed inputs.
