# Accessibility & Degradation: RD-10

> **Document**: 03-03-accessibility-degradation.md
> **Parent**: [Index](00-index.md) · ST-5, ST-6, ST-7

## Overview

Prove, through the real `@xterm/headless` emulator (RD-09 harness), that the UI stays
legible when color is off and when box-drawing glyphs are unavailable, and that a
non-TTY/`dumb` environment degrades without crashing. New golden tests; non-TTY is
**mapped** to RD-08 essentials (AR-11).

## Implementation Details

### a11y golden tests — `test/a11y-golden.spec.test.ts`

Reuses `makeTerm`/`feed`/`readCell` from `test/golden-screen-helpers.ts` (RD-09).

**ST-5 — NO_COLOR / monochrome-legible.** Build a buffer with a "focused" cell styled
via a reversible attribute (e.g. `Attr.reverse`) and a normal cell. Resolve caps at
`colorDepth: 'mono'` (the `NO_COLOR` outcome — `resolveCapabilities` maps `NO_COLOR`→mono;
overriding `colorDepth:'mono'` pins the same render path deterministically). Serialize,
feed, read back:

```ts
const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { colorDepth: 'mono' } }).profile;
const buf = new ScreenBuffer(10, 1, { fg: 'default', bg: 'default' });
buf.set(0, 0, 'A', { fg: 'red', bg: 'default', attrs: Attr.reverse }); // "focused"
buf.set(1, 0, 'B', { fg: 'red', bg: 'default' });                       // normal
await feed(term, serialize(buf, null, { caps }));
const focused = readCell(term, 0, 0), normal = readCell(term, 1, 0);
// mono: neither cell carries colour, but the focused cell is still distinguishable.
assert.equal(focused.fg.mode, 'default'); assert.equal(focused.bg.mode, 'default');
assert.notEqual(reverseState(term, 0, 0), reverseState(term, 1, 0)); // attribute conveys focus
```

The adapter gains a tiny `reverseState(term,col,row)` helper reading the cell's inverse
flag (`@xterm/headless` exposes `isInverse()`), added to `golden-screen-helpers.ts`. The
oracle: **mono emits no colour, yet focus is conveyed by a non-colour attribute** (no
information lost) — RD-10 AC-5.

**ST-6 — Glyph fallback to ASCII.** Resolve caps with `glyphs: { boxDrawing: false }`,
draw a `box(...)`, and assert the rendered corners/edges are ASCII (`+ - |`), not box-
drawing runes — the grid is legible. Oracle: RD-04 glyph fallback contract, RD-10 AC-6.

```ts
const caps = resolveCapabilities({ env: {}, platform: 'linux', override: { glyphs: { boxDrawing: false } } }).profile;
const buf = new ScreenBuffer(6, 3, { fg: 'default', bg: 'default' });
buf.box(0, 0, 6, 3, { fg: 'default', bg: 'default' }, 'single');
await feed(term, serialize(buf, null, { caps }));
assert.ok(['+', '-', '|'].includes(readCell(term, 0, 0).char), 'corner falls back to ASCII');
```

**ST-7 — Non-TTY / dumb degradation (mapped).** Referenced from RD-08
`safety-essentials.spec` / `host-detect-tty.spec`: a non-TTY input fails the essentials
gate with `EssentialsNotMetError` (no crash), and the host degrades. No new test — mapped
in the acceptance map (AR-10).

### Integration Points
- Consumes `ScreenBuffer`, `serialize`, `resolveCapabilities`, `Attr` via `../src/engine/index.js`, and the RD-09 golden helpers.
- Joins the unit glob (runs under `verify`).

## Error Handling

| Error case | Strategy | AR |
|------------|----------|----|
| Mono render emits colour | Spec fails — RD-05 mono regression | AR-11 |
| Focus indistinguishable in mono | Spec fails — a real a11y regression (color-only state) | AR-11 |
| Box renders runes when `boxDrawing:false` | Spec fails — RD-04 glyph-fallback regression | AR-11 |

> **Traceability:** decisions reference `00-ambiguity-register.md`.

## Testing Requirements
- `a11y-golden.spec.test.ts`: ST-5 (NO_COLOR mono + attribute focus), ST-6 (ASCII fallback).
- `golden-screen-helpers.ts`: add `reverseState`/`isInverse` reader (covered by the existing golden impl tests' normalization cases plus one new case).
