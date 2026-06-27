# Detection Layers: RD-02

> **Document**: 03-02-detection-layers.md
> **Parent**: [Index](00-index.md)

## Overview

Defines layers 3 (env), 4 (table), 5 (defaults), the per-field precedence, the
override merge (layer 1), the reason recording, and the per-process cache. Layer 2
(runtime query) is specified in [03-03](03-03-runtime-query-and-security.md); this
document treats it as an already-parsed partial profile slotted into the precedence.

## `src/engine/capability/defaults.ts` (layer 5, PL-13)

Conservative defaults used when no higher layer determines a field:

```ts
export const CONSERVATIVE_DEFAULTS: CapabilityProfile = {
  colorDepth: '16',
  mouse: { sgr: false, drag: false, wheel: false },
  unicode: { utf8: false, widthMode: 'wcwidth', emoji: 'unknown' },
  osc: { hyperlink8: false, clipboard52: false, title: false,
         notify9: false, notify777: false, notify99: false, progress9_4: false },
  sync2026: false,
  altScreen: false,
  bracketedPaste: false,
  keyboard: { kittyFlags: false, modifyOtherKeys: false },
  glyphs: { boxDrawing: false, halfBlocks: false },
  platform: 'linux', // overridden by options.platform/process.platform during resolve
  multiplexer: false,
};
```

## `src/engine/capability/env.ts` (layer 3)

Pure function `readEnv(env): { profile: DeepPartial<CapabilityProfile>; signals }`.
Reads only these non-sensitive vars (AC-8 — never logs them):

| Var(s) | Effect |
| ------ | ------ |
| `NO_COLOR` (present, any value, PL-12) | `colorDepth = 'mono'` (highest env precedence) |
| `FORCE_COLOR=0\|1\|2\|3` | `colorDepth = mono\|16\|256\|truecolor` (below NO_COLOR) |
| `COLORTERM=truecolor\|24bit` | `colorDepth = 'truecolor'` |
| `TERM` contains `256color` | `colorDepth = '256'` |
| `TERM=xterm`/other known | `colorDepth = '16'` |
| `LANG`/`LC_ALL`/`LC_CTYPE` contains `UTF-8` (ci) | `unicode.utf8 = true` |
| `$TMUX` set or `TERM` starts `screen`/`tmux` | `multiplexer = true` + conservative caps |

**colorDepth env sub-precedence (PL-5):** `NO_COLOR` → `FORCE_COLOR` → `COLORTERM` →
`TERM`. The whole env layer sits below override (layer 1) and runtime (layer 2) in
the general precedence, **except** `NO_COLOR`, which AC-1 says wins "regardless of
other signals" — modelled by giving `NO_COLOR`/`FORCE_COLOR` precedence over a
runtime/table colorDepth as well. (Override still wins over everything — AC-5.)

## `src/engine/capability/table.ts` (layer 4, PL-10)

`lookupTable(env): DeepPartial<CapabilityProfile>` keyed in order by `TERM_PROGRAM`,
then `WT_SESSION` (Windows Terminal), then `$TERM`. Seeds the terminals RD-02 lists:
iTerm2, Apple Terminal, gnome-terminal/VTE, Konsole, xterm, Windows Terminal, VS
Code, Kitty, Alacritty, foot, tmux/screen. Each entry encodes the **known** caps for
that terminal (e.g. iTerm2: truecolor, mouse sgr/drag/wheel, osc hyperlink/clipboard/
title/notify, sync2026; Kitty: kittyFlags true). Unknown terminals contribute nothing
(fall through to defaults).

> Table values are conservative-but-known; probe-dependent nuances (emoji width,
> some OSC) stay at `unknown`/`false` here and are refined by RD-03 (PL-2).

## `src/engine/capability/detect.ts` (per-field resolution + reasons)

```
resolveField(field):
  if override has field          -> value, reason 'override'   (layer 1)
  if runtime parsed has field    -> value, reason 'runtime'    (layer 2)
  if env determines field        -> value, reason 'env'        (layer 3)
  if table has field             -> value, reason 'table'      (layer 4)
  else                           -> default, reason 'default'  (layer 5)
```

- `colorDepth` uses the PL-5 precedence (override > NO_COLOR > FORCE_COLOR > runtime
  > COLORTERM > TERM/table > default); reason is the winning layer.
- `platform` is `options.platform ?? process.platform`, reason `'env'` (or `'override'`).
- Each top-level field group records one `ReasonLayer` (PL-3).

## `src/engine/capability/index.ts` (public `resolveCapabilities`, PL-6/7/9/14)

```
resolveCapabilities(options?):
  if cache exists and not options.refresh and options has no per-call inputs -> return cache
  env   = options.env ?? process.env
  parsed = layer-2 parsed partial (from query seam, may be empty)  // 03-03
  base  = compose layers per field via detect.ts
  merged = deepMerge(base, options.override)   // layer 1, DeepPartial (PL-7)
  result = { profile: deepFreeze(merged.profile), reasons: deepFreeze(merged.reasons) }  // PL-9
  cache = result (only when resolved from ambient process.env with no per-call override)  // PL-14
  return result
```

- **Cache (PL-14):** caches the ambient resolution (no override / injected env). A
  call with `override`, injected `env`, or `refresh:true` bypasses and does not poison
  the cache. `refresh:true` forces a fresh ambient resolution and replaces the cache.
- **deepMerge:** merges a `DeepPartial` over a full profile, leaf-by-leaf (ST-9).

## Error Handling

| Error Case | Strategy | Ref |
| ---------- | -------- | --- |
| Conflicting color signals | PL-5 precedence resolves deterministically | AC-1, AC-2 |
| Unknown terminal / empty env | Fall through to conservative defaults, reason `'default'` | AC-6 |
| Malformed env value (e.g. `FORCE_COLOR=9`) | Ignore the invalid value; fall to next signal | AC-2 |

## Testing Requirements
- Env precedence: ST-1…ST-7 (colorDepth matrix incl. NO_COLOR/FORCE_COLOR).
- Override deep-merge: ST-8, ST-9. Defaults: ST-10. Reasons: ST-11. Frozen: ST-12.
- Table: ST-18 (iTerm2). Multiplexer: ST-19. Cache: ST-17.
