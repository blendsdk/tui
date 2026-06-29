# Probes: Auto, Manual, and Live Input/Mouse Readout

> **Document**: 03-03-probes.md
> **Parent**: [Index](00-index.md)

## Overview

The three probe engines that populate `report.results`: the **auto-probe** phase
(query/response, runs first), the **manual-probe** phase (render test patterns, collect
y/n/s), and the **live input/mouse readout** (observe decoded events). All share a
**taxonomy registry** (`taxonomy.ts`) so the probe set is data, not scattered literals.

## Probe taxonomy (`taxonomy.ts`) — pure data

```ts
export type ProbeGroup =
  | 'color' | 'attributes' | 'glyphs' | 'unicode' | 'output'
  | 'osc' | 'keyboard' | 'mouse' | 'host' | 'images';

/** One probe descriptor; the registry is the single source of capability ids. */
export interface ProbeDescriptor {
  readonly id: string;            // e.g. 'color.truecolor', 'osc.notify9'
  readonly group: ProbeGroup;
  readonly label: string;         // human label for the table + prompts
  readonly method: 'auto' | 'manual';
}

/** The complete, ordered probe set covering the RD taxonomy (AR-14). */
export const PROBES: readonly ProbeDescriptor[];
```

`PROBES` enumerates every RD taxonomy item (color truecolor/256/16, the 7 attributes,
box/half-block/shade glyphs, unicode wide/combining/emoji, `?2026`/scroll-region/cursor-
shape, OSC hyperlink8/clipboard52/title/notify9/notify777/notify99/progress9_4/bell,
keyboard kitty/modifyOtherKeys/bracketed-paste, mouse click/drag/release/wheel/focus/SGR-
ext, host alt-screen/raw/resize/suspend, images sixel/kitty). Every `id` that appears in
a result MUST come from this registry — no ad-hoc strings (AR-14).

## Auto-probes (`auto-probes.ts`) [AR-9]

Runs first, inside alt-screen, before any manual keypress reading.

```ts
/**
 * Run the automatic query-based probes via a TerminalQuery and record results.
 * Reuses RD-02 runQueries for the DA/?2026 responses, plus targeted cursor-position
 * reports for unicode-width sanity. Always settles under the bounded timeout; a
 * silent terminal yields supported:false (or null where indeterminable), never hangs,
 * never throws (AR-15).
 *
 * @param deps { query: TerminalQuery, caps: CapabilityProfile, timeoutMs }
 * @returns Partial<Record<string, ProbeResult>> for the auto-method ids.
 */
export async function runAutoProbes(deps: {
  query: TerminalQuery;
  caps: CapabilityProfile;
  timeoutMs?: number;
}): Promise<Record<string, ProbeResult>>;
```

Auto items and their evidence: color depth (COLORTERM + DA), `?2026` (DECRQM via
`runQueries`), DA/version (XTVERSION), keyboard protocol (CSI-u query response), unicode
width (print a wide char, request cursor position, expect column advance of 2), mouse
(from caps/DA). Each recorded `{ supported, method:'auto', note }`.

## Manual probes (`manual-probes.ts`) [AR-8, AR-16]

Renders a labeled test pattern per probe to the alt-screen `ScreenBuffer`, then reads a
single allowlisted key (y/n/s) to record the result; Enter advances.

```ts
/** Render one manual probe's test pattern into a buffer (pure: pattern is deterministic). */
export function renderProbePattern(buffer: ScreenBuffer, probe: ProbeDescriptor, caps: CapabilityProfile): void;

/** Map an operator key to a result. y→true, n→false, s→null. [AR-8] */
export function classifyConfirmation(key: 'y' | 'n' | 's'): ProbeResult;

/**
 * Drive the manual probe loop: for each manual probe, render its pattern, await a
 * confirmation key (via the injected key source), record the result. Fire-and-forget
 * OSC probes (notify 9/777/99/9;4, bell, hyperlink8, clipboard52, title, alt-screen)
 * emit a program-constant sequence then ask "did you see it?" (AR-16, AR-17).
 *
 * @param deps { render, nextKey, probes } — nextKey is injectable for tests.
 */
export async function runManualProbes(deps: {
  render: (b: ScreenBuffer) => void;
  nextKey: () => Promise<'y' | 'n' | 's'>;
  probes: readonly ProbeDescriptor[];
  caps: CapabilityProfile;
}): Promise<Record<string, ProbeResult>>;
```

Test patterns: color swatches via `encode`/`PALETTE` (RD-05); attribute samples via
`Attr` masks; glyph rows (box-drawing/half-block/shade with ASCII fallback line);
unicode alignment grids (CJK two-cell, combining, emoji). OSC patterns use the existing
`hyperlink`/`setClipboard`/`setTitle`/`bell`/`notify` helpers — all program constants,
**never** embedding untrusted text (AR-17).

## Live input/mouse readout (`live-readout.ts`) [AR-8]

```ts
/** Format one decoded event into a single readout line (pure; testable). */
export function formatEventLine(event: InputEvent): string;

/**
 * Run the live readout: render decoded events as lines until the operator presses q.
 * Keyboard, mouse (1-based coords), wheel, focus, and paste are shown. Paste shows
 * BYTE LENGTH ONLY, never contents (AR-17). Uses redactEvent (RD-08) as the redaction
 * boundary before formatting.
 *
 * @param deps { events: AsyncIterable<InputEvent>, render, isQuit } injectable for tests.
 */
export async function runLiveReadout(deps: {
  events: AsyncIterable<InputEvent>;
  render: (lines: readonly string[]) => void;
  isQuit: (e: InputEvent) => boolean; // default: key 'q'
}): Promise<void>;
```

`formatEventLine` examples (the spec oracle, ST-25/26/27):
- `KeyEvent {name:'up'}` → `key: up`
- `KeyEvent {name:'a', ctrl:true}` → `key: ctrl+a`
- `MouseEvent {action:'press', button:'left', x:5, y:3}` (0-based) → `mouse: press left @ 6,4` (1-based, AC-2)
- `WheelEvent {direction:'up'}` → `wheel: up`
- `PasteEvent {data:'hello'}` → `paste: 5 bytes` (length only, AR-17)

(Exact event field names are taken from RD-06's `InputEvent` union when writing the spec
tests — derived from the input subsystem's public types, not from the formatter's code.)

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| Silent terminal during auto-probe | Bounded timeout → `supported:false`/`null`; never hang | AR-15 |
| Unsupported capability (manual "no") | Record `supported:false`, continue to next probe | AR-15 |
| Non-allowlisted key during confirmation | Ignored; only y/n/s/Enter act | AR-8 |
| Paste contents | Replaced by byte length before formatting (redaction) | AR-17 |
| OSC pattern with dynamic text | Not allowed — patterns are program constants | AR-17 |

> **Traceability:** Each row references the Ambiguity Register. See `00-ambiguity-register.md`.

## Testing Requirements

- Spec: auto-probe classification via a scripted fake `TerminalQuery` (ST-16/17/18); `formatEventLine` oracle for key/mouse/wheel/paste (ST-25/26/27); `classifyConfirmation` mapping; never-stop accumulation (ST-12).
- Impl: each test-pattern renderer produces the expected deterministic glyphs/SGR; manual loop records every probe even when some are "no"; readout ends on `q`.
- All interactive drivers use injected fakes (fake `TerminalQuery`, scripted key source, scripted event iterable) — real objects, no framework mocks.
