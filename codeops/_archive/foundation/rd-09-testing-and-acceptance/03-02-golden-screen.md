# Golden-Screen Tests (Tier 2): RD-09

> **Document**: 03-02-golden-screen.md
> **Parent**: [Index](00-index.md)

## Overview

Validate the render path end-to-end through a **real terminal emulator** (FR-2): build a
`ScreenBuffer` → `serialize` it (with `encodeStyle`, the default encoder) → feed the bytes
to `@xterm/headless` → read back the emulator grid → assert the resulting cells (char +
colours + width). Asserted across **all four** colour depths (truecolor/256/16/mono),
proving the RD-05 downsample chain produces output a real emulator renders correctly
(gate item 1). New dev dep `@xterm/headless` (pure-JS, AR-12).

## Architecture

### Current Architecture
`serialize` output is asserted as raw ANSI strings (`render-serialize`, `color-serialize`).
That proves the bytes we emit but not that an emulator interprets them into the intended grid.

### Proposed Changes
Add a thin emulator adapter and a spec suite. The adapter is the only place that touches
the `@xterm/headless` API, so an API change is isolated to one helper.

## Implementation Details

### Emulator adapter (`test/golden-screen.impl` helpers, or an inline helper in the spec)

```ts
import { Terminal } from '@xterm/headless';

interface Cell { char: string; fg: number | null; bg: number | null; width: number; }

function feed(term: Terminal, bytes: string): Promise<void> { /* term.write + await flush */ }
function readCell(term: Terminal, col: number, row: number): Cell { /* via term.buffer.active */ }
```

The adapter reads `term.buffer.active.getLine(row).getCell(col)` and normalizes char,
fg/bg (as the emulator resolves them for the profile), and `getWidth()`.

### Profiles & cases (AR-7)

For each depth in `['truecolor', '256', '16', 'mono']`:

| Case | What it asserts |
|------|-----------------|
| Full repaint | A small styled buffer (mixed fg/bg/attrs) renders to the expected grid for that depth — colours match the **detected depth**, not truecolor everywhere |
| Single-cell update | `serialize(next, prev, opts)` applied after the full repaint changes exactly the one target cell; the rest of the grid is unchanged |
| CJK / wide-char row | A row with a wide CJK glyph + a combining sequence occupies the correct columns (width model, gate-adjacent to item 2) |

The "expected grid" is derived from the **render contract** (what char/colour each written
cell should hold for that depth per RD-04/RD-05), not by running `serialize` first.

### Capability profiles

Profiles come from `resolveCapabilities` with explicit overrides so each depth is pinned
deterministically, e.g. `resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'truecolor' } }).profile`, then passed into `serialize`'s `RenderOptions`.

### Integration Points
- Consumes `ScreenBuffer`, `serialize`, `resolveCapabilities` via `../src/engine/index.js`.
- Joins the unit glob (AR-10).
- Feeds gate criteria 1 and 2 (the rendering half); mapped in `docs/acceptance-gate.md`.

## Code Examples

### Single-cell update is minimal
```ts
// ScreenBuffer has no clone(); set() is set(x, y, char, style) — char and style
// are separate positional args (see render-serialize.spec.test.ts). Build `prev`
// and `next` as two independent buffers (buildStyledBuffer must be deterministic
// so the two are identical except for the one changed cell), then diff them.
const prev = buildStyledBuffer();
const next = buildStyledBuffer();
next.set(3, 1, 'X', DEFAULT_STYLE);
serialize(prev, null, opts);                 // establish baseline in the emulator
feed(term, serialize(next, prev, opts));     // diff emits only the one changed cell
assert.equal(readCell(term, 3, 1).char, 'X');
assert.equal(readCell(term, 4, 1).char, /* unchanged */);
```

## Error Handling

| Error Case                              | Handling Strategy                                       | AR Ref |
| --------------------------------------- | ------------------------------------------------------ | ------ |
| Emulator applies non-default attributes  | Reset/clear the terminal per case; assert only written cells | AR-7 |
| `@xterm/headless` API shape differs       | Isolate in the adapter; one place to fix                | AR-12  |
| Grid mismatch vs the render contract      | Spec fails → fix the engine, not the test (unless the contract assumption was wrong) | AR-8 |

> **Traceability:** decisions reference `00-ambiguity-register.md`.

## Testing Requirements
- Spec suite `golden-screen.spec.test.ts`: the 4 depths × {full repaint, single-cell, CJK row}.
- Impl tests `golden-screen.impl.test.ts`: adapter `readCell` normalization edge cases (empty cell, wide-char trailing cell, default colours).
