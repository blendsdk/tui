/**
 * Probe taxonomy registry (RD-03, plan doc 03-03).
 *
 * The single source of capability ids covering the full RD taxonomy (AR-14):
 * every result id used anywhere in the harness comes from {@link PROBES}, never an
 * ad-hoc string. `runAutoProbes` populates the `auto` entries, `runManualProbes`
 * the `manual` ones, and the report builder fills any id left unpopulated with
 * `supported: null` so the report records everything (never-stop, AR-15).
 */

/** Capability group, used to organise the human-readable table. */
export type ProbeGroup =
  'color' | 'attributes' | 'glyphs' | 'unicode' | 'output' | 'osc' | 'keyboard' | 'mouse' | 'host' | 'images';

/** A single probe descriptor. */
export interface ProbeDescriptor {
  /** Stable capability id (e.g. `'color.swatch.truecolor'`). */
  readonly id: string;
  /** The group this probe belongs to. */
  readonly group: ProbeGroup;
  /** Human label for the table and prompts. */
  readonly label: string;
  /** How this probe is obtained. */
  readonly method: 'auto' | 'manual';
}

/**
 * The complete, ordered probe set. Auto entries mirror what RD-02 can resolve;
 * manual entries are operator-confirmed; image entries are Skip-class (attempted
 * and recorded only, AR-14).
 */
export const PROBES: readonly ProbeDescriptor[] = [
  // Color — auto depth detection + manual swatch confirmation.
  { id: 'color.truecolor', group: 'color', label: 'truecolor (auto: COLORTERM)', method: 'auto' },
  { id: 'color.256', group: 'color', label: '256-color (auto)', method: 'auto' },
  { id: 'color.swatch.truecolor', group: 'color', label: 'truecolor swatches render', method: 'manual' },
  { id: 'color.swatch.256', group: 'color', label: '256-color swatches render', method: 'manual' },
  { id: 'color.swatch.16', group: 'color', label: '16-color swatches render', method: 'manual' },

  // Attributes — all manual.
  { id: 'attr.bold', group: 'attributes', label: 'bold', method: 'manual' },
  { id: 'attr.dim', group: 'attributes', label: 'dim', method: 'manual' },
  { id: 'attr.italic', group: 'attributes', label: 'italic', method: 'manual' },
  { id: 'attr.underline', group: 'attributes', label: 'underline', method: 'manual' },
  { id: 'attr.reverse', group: 'attributes', label: 'reverse', method: 'manual' },
  { id: 'attr.strikethrough', group: 'attributes', label: 'strikethrough', method: 'manual' },
  { id: 'attr.blink', group: 'attributes', label: 'blink', method: 'manual' },

  // Glyphs — manual legibility.
  { id: 'glyph.boxDrawing', group: 'glyphs', label: 'box-drawing characters', method: 'manual' },
  { id: 'glyph.halfBlocks', group: 'glyphs', label: 'half-block characters', method: 'manual' },
  { id: 'glyph.shade', group: 'glyphs', label: 'shade characters', method: 'manual' },

  // Unicode — auto utf8 + manual alignment.
  { id: 'unicode.utf8', group: 'unicode', label: 'UTF-8 (auto)', method: 'auto' },
  { id: 'unicode.cjkWidth', group: 'unicode', label: 'wide CJK occupies 2 cells', method: 'manual' },
  { id: 'unicode.combining', group: 'unicode', label: 'combining marks align', method: 'manual' },
  { id: 'unicode.emoji', group: 'unicode', label: 'emoji/ZWJ align', method: 'manual' },

  // Output — auto sync + manual scroll/cursor.
  { id: 'output.sync2026', group: 'output', label: 'synchronized output ?2026 (auto)', method: 'auto' },
  { id: 'output.altScreen', group: 'output', label: 'alternate screen (auto)', method: 'auto' },
  { id: 'output.scrollRegion', group: 'output', label: 'scroll region', method: 'manual' },
  { id: 'output.cursorShape', group: 'output', label: 'cursor shape change', method: 'manual' },

  // OSC — manual fire-and-forget.
  { id: 'osc.hyperlink8', group: 'osc', label: 'OSC 8 hyperlink', method: 'manual' },
  { id: 'osc.clipboard52', group: 'osc', label: 'OSC 52 clipboard', method: 'manual' },
  { id: 'osc.title', group: 'osc', label: 'window title set', method: 'manual' },
  { id: 'osc.notify9', group: 'osc', label: 'notification OSC 9', method: 'manual' },
  { id: 'osc.notify777', group: 'osc', label: 'notification OSC 777', method: 'manual' },
  { id: 'osc.notify99', group: 'osc', label: 'notification OSC 99', method: 'manual' },
  { id: 'osc.progress9_4', group: 'osc', label: 'progress OSC 9;4', method: 'manual' },
  { id: 'osc.bell', group: 'osc', label: 'bell', method: 'manual' },

  // Keyboard — observed in the live readout.
  { id: 'input.bracketedPaste', group: 'keyboard', label: 'bracketed paste (auto)', method: 'auto' },
  { id: 'keyboard.kitty', group: 'keyboard', label: 'Kitty/CSI-u keyboard protocol', method: 'manual' },
  { id: 'keyboard.modifiers', group: 'keyboard', label: 'modifier combinations', method: 'manual' },

  // Mouse — observed in the live readout; SGR from caps.
  { id: 'mouse.sgr', group: 'mouse', label: 'SGR mouse (auto)', method: 'auto' },
  { id: 'mouse.click', group: 'mouse', label: 'click reporting', method: 'manual' },
  { id: 'mouse.drag', group: 'mouse', label: 'drag reporting', method: 'manual' },
  { id: 'mouse.wheel', group: 'mouse', label: 'wheel reporting', method: 'manual' },

  // Host — runtime + manual.
  { id: 'host.altScreen', group: 'host', label: 'alt-screen restore round-trip', method: 'manual' },
  { id: 'host.resize', group: 'host', label: 'resize reporting', method: 'manual' },
  { id: 'host.suspend', group: 'host', label: 'suspend/resume', method: 'manual' },

  // Images — Skip-class: attempt + record availability only.
  { id: 'images.sixel', group: 'images', label: 'Sixel graphics', method: 'manual' },
  { id: 'images.kitty', group: 'images', label: 'Kitty graphics', method: 'manual' },
];

/** The subset of probe ids obtained automatically (populated by `runAutoProbes`). */
export const AUTO_PROBE_IDS: readonly string[] = PROBES.filter((p) => p.method === 'auto').map((p) => p.id);

/** The subset of probe ids confirmed manually (driven by `runManualProbes`). */
export const MANUAL_PROBES: readonly ProbeDescriptor[] = PROBES.filter((p) => p.method === 'manual');
