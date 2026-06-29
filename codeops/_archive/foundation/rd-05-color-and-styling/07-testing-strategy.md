# Testing Strategy: RD-05 Color & Styling

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

- **Unit:** every public function in `color/` — all depths × roles for `encode`,
  the redmean vector table for `nearest256`/`nearest16`, attribute composition,
  mono legibility, validation throw + crash-safe degrade, `styleKey`, `PALETTE`,
  `defaultTheme`.
- **Integration:** `serialize()`'s default now downsamples (256/16) while the
  truecolor RD-04 oracle stays green.
- **Security (mandatory):** malformed colors throw and emit no bytes; encoders emit
  only numeric SGR from validated values.

Run via `npm run verify` (`tsx --test "test/**/*.{spec,impl}.test.ts"`).

## 🚨 Specification Test Cases (immutable oracles)

> Derived EXCLUSIVELY from RD-05 AC-1…AC-7, the component specs (`03-0X`), and the
> Ambiguity Register. Expectations come from the SPEC + the documented redmean
> algorithm (AR-5/AR-6) — never from reading the implementation. The vector indices
> are hand-derivable from the documented formula + candidate set.

### Encoding & validation (`color-encode.spec.test.ts`)

| #     | Input / Scenario | Expected Output / Behavior | Source |
| ----- | ---------------- | -------------------------- | ------ |
| ST-1  | `encode('#0000a8','bg','truecolor')` | `'\x1b[48;2;0;0;168m'` | AC-1 |
| ST-2  | `encode('#0000a8','bg','256')` | `'\x1b[48;5;19m'` (cube `(0,0,175)` = index 19) | AC-1 / AR-6 |
| ST-3  | `encode('#0000a8','bg','16')` | `'\x1b[44m'` (nearest16 = blue, idx 4 → bg 40+4) | AC-1 / AR-6 |
| ST-4  | `encode('#0000a8','bg','mono')` | `''` | AC-1 |
| ST-5  | `nearest256` / `nearest16` over the fixed vector table: `#000000`→(0,0), `#ffffff`→(15,15), `#ff0000`→(9,9), `#0000a8`→(19,4) | each pair exactly as listed (deterministic) | AC-2 / AR-5, AR-14 |
| ST-6  | `encodeStyle('default','default', Attr.bold\|Attr.underline, caps)` (any depth) | `'\x1b[1;4m'` | AC-3 / AR-4 |
| ST-7  | `encodeStyle('default','default', Attr.none, caps)` | `''` (no stray SGR; reset is the serializer's job) | AC-3 / AR-13 |
| ST-8  | `encodeStyle('#ff0000','#0000ff', Attr.reverse, caps{mono})` | `'\x1b[7m'` — reverse emitted, **no** `38`/`48` | AC-4 / AR-3 |
| ST-9  | Corners: `nearest256('#000000')`=0, `nearest256('#ffffff')`=15, `nearest16('#000000')`=0, `nearest16('#ffffff')`=15; `encode('#000000','fg','16')`=`'\x1b[30m'`, `encode('#ffffff','fg','16')`=`'\x1b[97m'` | exactly as listed (corners exact, not rounded away) | AC-5 / AR-6 |
| ST-10 | `encode('#zzz','fg','truecolor')` | throws `InvalidColorError`; `err instanceof TuiError`; no value returned | AC-6 / AR-7, AR-8 |
| ST-11 | `encode('rgb(1,2,3)','fg','truecolor')` | throws `InvalidColorError` | AC-6 / AR-7 |
| ST-12 | `encodeStyle('#zzz','default', Attr.none, caps)` (render path) | does **not** throw; emits no color SGR (degrades) | AC-7 / AR-7 |
| ST-13 | `encode('#0000a8','fg','256')` output | matches `/^\x1b\[[0-9;]*m$/` (only numeric SGR — no caller string leaks) | AC-7 |
| ST-14 | `styleKey('#fff','#000',Attr.bold)` vs the same args vs a differing arg | equal inputs → equal key; any differing fg/bg/attrs → differing key | Must (AR-11) |

### Palette & theme (`color-palette-theme.spec.test.ts`)

| #     | Input / Scenario | Expected Output / Behavior | Source |
| ----- | ---------------- | -------------------------- | ------ |
| ST-15 | `PALETTE` | has all 16 DOS keys at the documented hex (incl. `brightMagenta:'#ff55ff'`); every value parses via `toRgb` without throwing | Must (AR-9) |
| ST-16 | `defaultTheme` | exposes the declared roles (`desktop`/`menuBar`/`window`/`button`/…) wired to palette colors; `desktop.pattern==='░'` | Must (AR-9) |

### Serializer integration (`color-serialize.spec.test.ts`)

| #     | Input / Scenario | Expected Output / Behavior | Source |
| ----- | ---------------- | -------------------------- | ------ |
| ST-17 | `serialize()` of a brightRed-fg cell at `caps{colorDepth:'256'}` vs `caps{colorDepth:'truecolor'}` | `'38;5;9'` present (downsampled) at 256; `'38;2;255;0;0'` present at truecolor (RD-04 oracle preserved) | AC-1 / AR-3 |

> **AUTHORING RULE:** the vector indices (ST-2/5/9/17) are derived from the redmean
> formula + full-256 candidate set + lowest-index tie-break documented in AR-5/AR-6,
> NOT from running the code. If a vector fails after implementation, the
> implementation is wrong.

## Implementation Tests (edge cases, internals)

| File | Description | Priority |
| ---- | ----------- | -------- |
| `color-encode.impl.test.ts` | `#rgb` short-form expansion; every `Attr` bit → code; fg vs bg role codes across 30–37/40–47/90–97/100–107; gray-ramp mapping (e.g. `#808080`→256:244); `default`→`''`; redmean tie-break direction | High |
| `color-palette-theme.impl.test.ts` | each `PALETTE` value round-trips through `encode` at each depth without throwing; `Theme`/`ThemeRole` immutability (`as const`) | Med |
| `color-serialize.impl.test.ts` | the updated RD-04 256-depth expectation lives in `render-serialize.impl.test.ts`; this file adds a 16-depth `serialize()` downsample check + a malformed-color-in-cell crash-safety check | High |

## Security Tests (mandatory)

- ST-10/ST-11: malformed colors throw `InvalidColorError` and emit no bytes.
- ST-12: the render-path encoder degrades (never throws) on a malformed cell color.
- ST-13: `encode` output is exclusively numeric SGR (`/^\x1b\[[0-9;]*m$/`) — no
  passthrough of caller strings.

## Verification Checklist

- [ ] ST-1…ST-17 defined with concrete input/output pairs, each traced to AC / AR.
- [ ] Spec tests written + verified RED before implementation.
- [ ] All spec tests green after implementation.
- [ ] Impl tests for edge cases written.
- [ ] RD-04 truecolor/mono oracles stay green; only `render-serialize.impl.test.ts:95` updated (AR-3).
- [ ] RD-02/RD-06/RD-07/RD-08 suites unaffected.
- [ ] `npm run lint`, `npm run check:deps`, `npm audit` clean.
