# 03-02: Damage-Diff Serializer

> **Document**: 03-02-diff-serializer.md
> **Parent**: [Index](00-index.md)
> **Decisions**: PL-1, PL-5, PL-6, PL-9, PL-13, PL-14

The pure serializer that turns a frame into the minimal ANSI to paint it. Files:
`src/engine/render/ansi.ts`, `src/engine/render/serialize.ts`.

## ANSI vocabulary (ansi.ts)

A clean re-derivation of the prototype's control sequences (no hardcoded color):

```ts
export const CSI = '\x1b[';
export const SGR_RESET = `${CSI}0m`;
export const SYNC_BEGIN = `${CSI}?2026h`; // begin synchronized update
export const SYNC_END = `${CSI}?2026l`;   // end synchronized update
export function cursorTo(row: number, col: number): string; // 1-based, `CSI row;col H`
```

## The seam (PL-1, PL-14)

```ts
/** Encodes a cell style to an SGR sequence for the detected depth. RD-05 fills this. */
export type StyleEncoder = (fg: Color, bg: Color, attrs: AttrMask, caps: CapabilityProfile) => string;

/** Options for serialize() — capabilities + the injectable encoder (PL-14). */
export interface RenderOptions {
  readonly caps: CapabilityProfile;
  /** Defaults to the built-in minimal truecolor/mono encoder (PL-1). */
  readonly encodeStyle?: StyleEncoder;
}
```

### Minimal default encoder (PL-1, shipped in RD-04)
`defaultEncodeStyle(fg, bg, attrs, caps)`:
- `caps.colorDepth === 'mono'` → emit **no color** SGR (attributes only).
- otherwise (`truecolor`/`256`/`16`) → emit **24-bit truecolor** (`38;2;r;g;b` /
  `48;2;r;g;b`) from `#rrggbb`/named/`default`. (256/16 downsampling is RD-05's job;
  the default over-emits truecolor, which every non-mono terminal in scope renders.)
- Always prefixes `SGR_RESET` semantics via the serializer's per-run reset.
- `'default'` color → omit that channel (terminal default).

> The default is deliberately minimal and documented as such: it satisfies AC-1
> (a styled changed cell) without duplicating RD-05's nearest-color tables. RD-05
> injects the real depth-aware encoder via `RenderOptions.encodeStyle`.

## Pure serialize (serialize.ts, PL-5, PL-6)

```ts
/**
 * Build the in-place ANSI frame that turns `previous` into `current` (damage diff).
 * @param current The frame to display.
 * @param previous The last displayed frame, or null for a full first paint.
 * @param options Capabilities + optional style encoder (PL-14).
 * @returns One coalesced ANSI string (empty when nothing changed) (PL-6).
 */
export function serialize(
  current: ScreenBuffer,
  previous: ScreenBuffer | null,
  options: RenderOptions,
): string;
```

### Algorithm (damage diff, AC-1/AC-6)
1. **Dimension check (PL-13):** if `previous` is null or its `width`/`height` differ
   from `current`, treat **every** cell as changed (full repaint) — the diff baseline
   is invalid.
2. For each row `y`:
   - Walk cells left→right. A cell is **changed** when it differs from the previous
     frame's cell at the same position (char, fg, bg, attrs, width).
   - Group maximal runs of **changed, same-style** cells. For each run:
     - emit `cursorTo(y+1, runStartCol+1)` (absolute move to the run start);
     - emit `encodeStyle(fg, bg, attrs, caps)` then `SGR_RESET`-bounded run glyphs;
     - emit each cell's glyph, substituted via the glyph layer (03-03) for `caps`;
       a `width:0` continuation cell emits **nothing** (its lead already advanced).
   - Unchanged cells emit nothing; an unchanged gap between two runs is skipped with a
     fresh `cursorTo` for the next run (no erase, flicker-free, M4).
3. **Reset** after each run/row so styles never bleed across runs.
4. **Sync wrap (M5, AC-3):** if `caps.sync2026`, prepend `SYNC_BEGIN` and append
   `SYNC_END`. When there is **no** cell output (AC-6), the body is empty; the function
   returns `''` (sync wrappers are only added around real output, so two identical
   frames cost zero bytes — see AC-6 note below).
5. Return the single concatenated string (one coalesced `write`, S1/PL-6).

### AC-6 (zero-cost unchanged frame)
Two identical consecutive frames produce **no** changed cells → no `cursorTo`, no glyphs.
The function returns `''` (no sync wrappers around empty output). An unchanged screen
costs nothing.

### AC-1 (bytes ∝ damage)
One changed cell in an 80×24 buffer emits exactly: one `cursorTo` (≤ ~7 bytes), one style
SGR + reset, one glyph. Total payload < 32 bytes; all other cells emit nothing.

### Style runs (PL-1)
A "run" breaks when fg, bg, or attrs change, or a cell is unchanged, or the row ends —
mirroring the prototype's run-merge but gated on **damage** (changed cells only) rather
than the whole row. The per-run `encodeStyle` + reset keeps emitted bytes minimal.

## Purity (PL-5)
`serialize()` is a pure function of `(current, previous, options)`: no I/O, no internal
state, no logging. The "previous frame" lives with the RD-07 host, which calls
`serialize(next, prevHeld, opts)` then keeps `next` as the new previous. This makes
frames reproducible from fixtures (the ST oracles) exactly like `decode()`.
