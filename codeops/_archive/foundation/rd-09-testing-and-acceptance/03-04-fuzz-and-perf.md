# Fuzz Harness & Byte-Proportionality Benchmark: RD-09

> **Document**: 03-04-fuzz-and-perf.md
> **Parent**: [Index](00-index.md)

## Overview

Two deterministic, in-glob suites:

1. **Fuzz harness** (FR-6, AR-5/AR-11) — feed random/adversarial byte streams to
   `decode`/`flush` driven by an iterated **fixed seed set** via a small in-repo PRNG;
   assert no throw and bounded decoder-state growth. Gate item 11 (adversarial input → no crash).
2. **Byte-proportionality benchmark** (FR-4, AR-3) — assert `serialize` emits output bytes
   proportional to the number of changed cells. Deterministic and machine-independent;
   wall-clock timing is **deferred to RD-10** (DEF-4). Gate item 2.

## Architecture

### Proposed Changes
Both are pure-function tests over already-built engine code, so there is no engine
implementation to write — the deliverable is the harness (PRNG + bounded-growth probe) and
the assertions. They join the unit glob (AR-10).

## Implementation Details

### Seeded PRNG (small, in-repo, deterministic)

`Math.random`/`Date` are banned (reproducibility). Use a tiny deterministic generator
(e.g. mulberry32) seeded from each integer in a checked-in set:

```ts
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEEDS = [1, 42, 1337, 90210, 525600, 0xc0ffee, 0xdeadbeef];
```

### Fuzz run

```ts
for (const seed of SEEDS) {
  const rnd = mulberry32(seed);
  let state = createDecoderState();
  for (let i = 0; i < ITERATIONS; i++) {
    const chunk = randomBytes(rnd, randLen(rnd));      // random bytes 0x00–0xff
    const r = decode(chunk, state, opts);              // MUST NOT throw
    state = r.state;
    assert.ok(stateSize(state) <= BOUND, `seed ${seed}: state unbounded`);
  }
  flush(state, opts);                                  // MUST NOT throw
}
```

- **Adversarial streams**: include partial CSI/OSC starters (`ESC[`, `ESC]` with no terminator), giant runs of `ESC`, oversized paste-like payloads, and lone C0/C1 bytes — to probe bounded buffering.
- **`stateSize(state)`**: measures the decoder's internal pending-buffer length (the bound is the documented paste/sequence cap from RD-06/RD-08). A failing seed is pinned as a corpus regression case (Gap mitigation).
- **No throw** across all seeds/iterations is the core assertion (gate item 11).

### Byte-proportionality benchmark

```ts
// ScreenBuffer has no clone(); set() is set(x, y, char, style). Build `one` as a
// fresh buffer identical to `base` plus the single change (buildBuffer must be
// deterministic), then diff against `base`.
const opts = renderOptionsFor('truecolor');
const base = buildBuffer(80, 24);                       // filled buffer
const full = serialize(base, null, opts).length;       // full repaint
const noChange = serialize(base, base, opts).length;   // identical → ~0 payload
const one = buildBuffer(80, 24);
one.set(10, 5, 'Z', DEFAULT_STYLE);
const single = serialize(one, base, opts).length;      // one cell changed

assert.equal(noChange, /* empty or cursor-only, no cell payload */ EXPECTED_EMPTY);
assert.ok(single < full / 10, 'single-cell diff ≪ full repaint');
assert.ok(single > 0, 'a real change emits bytes');
```

Thresholds are **ratios/relations**, not absolute byte counts or times (AR-3), so the test
is stable across machines.

### Integration Points
- Consumes `createDecoderState`/`decode`/`flush` (fuzz) and `ScreenBuffer`/`serialize` (perf) via `../src/engine/index.js`.
- Both join the unit glob (AR-10); feed gate criteria 11 (fuzz) and 2 (perf).

## Error Handling

| Error Case                              | Handling Strategy                                              | AR Ref |
| --------------------------------------- | ------------------------------------------------------------- | ------ |
| Decoder throws on adversarial input      | Test fails with the offending **seed** printed → fix the decoder | AR-11  |
| Decoder state grows unbounded            | Bound assertion fails → real DoS regression in RD-06/RD-08    | AR-5   |
| Wall-clock timing requested              | Out of scope here — DEF-4, owned by RD-10                      | AR-3, AR-14 |

> **Traceability:** decisions reference `00-ambiguity-register.md`.

## Testing Requirements
- `input-fuzz.spec.test.ts`: no-throw + bounded-growth across the seed set (FR-6).
- `input-fuzz.impl.test.ts`: PRNG determinism (same seed → same stream); a specific pinned adversarial case.
- `render-bytes-damage.spec.test.ts`: the proportionality relations above (FR-4).
