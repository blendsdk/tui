# Current State Analysis: RD-06 Input System

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Summary

The input subsystem does **not** exist under `src/engine/`. There is no decoder, no
event model, and no `src/engine/input/` folder. RD-06 builds it fresh on top of the
RD-01 scaffolding and the RD-02 capability core, reusing two existing assets: the
archived prototype's `parseInput` (as a reference for behaviour, not code) and
RD-02's query-response grammar matchers (extracted and shared, PL-2).

## Reference asset 1 — archived prototype `parseInput`

`_archive/prototype-2026-06-27/src/app/input.ts` already decodes a narrow slice:

- **SGR mouse press** via a single regex `\x1b\[<(\d+);(\d+);(\d+)([Mm])` (`input.ts:46`),
  converting to **0-based** buffer coords (`x - 1`, `y - 1`).
- A handful of keys (`\x03`, `\r`/`\n`, space, `ESC`, `ESC[A`, `ESC[B`) and a 2-char
  `ESC<letter>` Alt combo (`input.ts:76-103`).

**Gaps vs RD-06 (why it is reference-only, not migrated):**
- Operates on JS `string`, not bytes → not chunk-boundary-safe (PL-1 changes this).
- No buffering/carry: assumes each chunk is one whole event → fails AC-2.
- Mouse: press only, no release/drag/move, regex-based not grammar-based.
- No wheel/scroll, no bracketed paste, no focus, no F-keys/nav, no `CSI 1;<mod>` combos.
- Converts to 0-based coords; RD-06 keeps **1-based** as the terminal reports (PL-11, AC-3).
- No query-response demultiplexing.

Per the project's clean-slate rule (archived prototype is inspiration only), RD-06
re-implements the decoder; `parseInput`'s SGR regex and key cases inform the grammar
but are not imported.

## Reference asset 2 — RD-02 query-response parser (to be shared, PL-2)

`src/engine/capability/query.ts` already parses terminal query responses:

- `matchGrammar` (`query.ts:172`) → `matchCsi` (`query.ts:192`) / `matchDcs` (`query.ts:241`).
- Recognises Primary/Secondary DA (`?…c` / `>…c`), the `?2026` DECRPM (`…$y`), and the
  XTVERSION DCS (`ESC P … ST`).
- Byte-level (`Uint8Array`), bounded by `RESPONSE_BUFFER_CAP = 1024` (`query.ts:23`).

RD-06's `decode()` must classify these same grammars to route them as `QueryResponse`
(AC-6). Rather than duplicate them (PL-2 option B, rejected for DRY), the matchers are
**extracted** into `src/engine/capability/responses.ts`; `query.ts` is refactored to
import them with **no behaviour change**. The existing `test/capability-query.spec.test.ts`
and `test/capability-parser.impl.test.ts` are the immutable safety net proving the
refactor preserves behaviour.

### Constraint: RD-02 spec tests are immutable

`query.ts`'s spec tests (`capability-query.spec.test.ts`, ST-13…ST-16 of RD-02) are
oracles. The PL-2 refactor must keep them green untouched; if one fails, the refactor
is wrong, not the test.

## Existing seam this RD fulfils

`src/engine/capability/profile.ts:107` defines `TerminalQuery { write, read }` — the
seam RD-02 left for "RD-06's input decoder later." RD-06 ships the decoder; wiring the
**real** stdin stream into that seam (raw mode, mode-enable sequences) is RD-07, not
this RD. RD-06 provides the pure decoder the host will drive.

## Toolchain / conventions (inherited)

- ESM-only, zero runtime deps; NodeNext `.js` import specifiers on `.ts` sources.
- Tests under `test/` only (never colocated); `node:test` + `node:assert/strict` via `tsx`.
- `*.spec.test.ts` = immutable oracle from requirements; `*.impl.test.ts` = edge cases.
- Verify: `npm run verify` (typecheck + test + build); `npm run lint`; `npm run check:deps`.
- Target 200–500 lines/file; public symbols carry JSDoc.

## Impact assessment

| Area | Change | Risk |
| ---- | ------ | ---- |
| `src/engine/input/**` | New subsystem (7 files) | Low — greenfield |
| `src/engine/capability/responses.ts` | New shared classifier (extracted) | Low — covered by RD-02 tests |
| `src/engine/capability/query.ts` | Refactor to import the classifier | **Medium** — must keep RD-02 spec tests green |
| `src/engine/index.ts` | Re-export input public API | Low — additive |
| `README.md` | New "Input decoding" section | None |

The only non-greenfield touch is the `query.ts` refactor (PL-2); it is fenced by
RD-02's immutable spec tests.
