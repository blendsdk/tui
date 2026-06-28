/**
 * Manual probes (RD-03, plan doc 03-03).
 *
 * Renders a labeled test pattern per probe into a {@link ScreenBuffer} and, for
 * fire-and-forget OSC features, emits a program-constant escape sequence to the
 * terminal; the operator then confirms with y/n/s (AR-8). OSC sequences are
 * emitted UNCONDITIONALLY (not via the caps-gated render/* helpers) so the probe
 * genuinely attempts each feature even where detection thinks it is unsupported
 * (AR-14). Every sequence is a program constant — no untrusted text is embedded
 * (AR-17).
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import { Attr, ScreenBuffer } from '@jsvision/core';
import type { CapabilityProfile, Color } from '@jsvision/core';
import type { ProbeDescriptor } from './taxonomy.js';
import type { ProbeResult } from './report.js';

const DEFAULT_FG: Color = 'default';
const DEFAULT_BG: Color = 'default';

/** Paint a horizontal strip of background swatches starting at (col=0, row). */
function paintSwatches(buffer: ScreenBuffer, row: number, colors: readonly Color[]): void {
  let col = 0;
  for (const bg of colors) {
    buffer.set(col, row, ' ', { fg: DEFAULT_FG, bg });
    buffer.set(col + 1, row, ' ', { fg: DEFAULT_FG, bg });
    col += 3;
  }
}

/**
 * Render the visual test pattern (and prompt) for a probe into `buffer`.
 *
 * @param buffer Target screen buffer (cleared by the caller).
 * @param probe The probe descriptor.
 * @param caps Resolved capabilities — used to add an ASCII fallback hint when the
 *   terminal is not expected to render box-drawing glyphs.
 */
export function renderProbePattern(buffer: ScreenBuffer, probe: ProbeDescriptor, caps: CapabilityProfile): void {
  const style = { fg: DEFAULT_FG, bg: DEFAULT_BG };
  buffer.text(0, 0, `Probe: ${probe.label}`, style);

  switch (probe.id) {
    case 'color.swatch.truecolor':
      paintSwatches(buffer, 2, ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']);
      break;
    case 'color.swatch.256':
      paintSwatches(buffer, 2, ['#e4e4e4', '#bcbcbc', '#949494', '#6c6c6c']);
      break;
    case 'color.swatch.16':
      paintSwatches(buffer, 2, ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan', 'white']);
      break;
    case 'attr.bold':
      buffer.text(0, 2, 'Bold sample', { ...style, attrs: Attr.bold });
      break;
    case 'attr.dim':
      buffer.text(0, 2, 'Dim sample', { ...style, attrs: Attr.dim });
      break;
    case 'attr.italic':
      buffer.text(0, 2, 'Italic sample', { ...style, attrs: Attr.italic });
      break;
    case 'attr.underline':
      buffer.text(0, 2, 'Underline sample', { ...style, attrs: Attr.underline });
      break;
    case 'attr.reverse':
      buffer.text(0, 2, 'Reverse sample', { ...style, attrs: Attr.reverse });
      break;
    case 'attr.strikethrough':
      buffer.text(0, 2, 'Strikethrough sample', { ...style, attrs: Attr.strike });
      break;
    case 'attr.blink':
      buffer.text(0, 2, 'Blink sample', { ...style, attrs: Attr.blink });
      break;
    case 'glyph.boxDrawing':
      buffer.text(0, 2, '┌──┬──┐', style);
      buffer.text(0, 3, '└──┴──┘', style);
      if (!caps.glyphs.boxDrawing) buffer.text(0, 4, '(ASCII fallback: +--+--+)', style);
      break;
    case 'glyph.halfBlocks':
      buffer.text(0, 2, '▀▄█ ▌▐ ▖▗▘▝', style);
      break;
    case 'glyph.shade':
      buffer.text(0, 2, '░ ▒ ▓ █', style);
      break;
    case 'unicode.cjkWidth':
      buffer.text(0, 2, '你好世界', style);
      buffer.text(0, 3, 'ABCDEFGH', style);
      break;
    case 'unicode.combining':
      buffer.text(0, 2, 'é  à  ö', style);
      break;
    case 'unicode.emoji':
      buffer.text(0, 2, '😀 👍 🇳🇱', style);
      break;
    default:
      buffer.text(0, 2, '(fire-and-forget — watch your terminal / desktop)', style);
      break;
  }

  buffer.text(0, 6, 'Working?  y = yes   n = no   s = skip', style);
}

/** Map an operator confirmation key to a result (AR-8). */
export function classifyConfirmation(key: 'y' | 'n' | 's'): ProbeResult {
  if (key === 'y') return { supported: true, method: 'manual' };
  if (key === 'n') return { supported: false, method: 'manual' };
  return { supported: null, method: 'manual' };
}

/**
 * The raw, program-constant escape sequence a fire-and-forget OSC probe emits, or
 * null for a purely visual probe. Emitted unconditionally so the probe truly
 * attempts the feature (AR-14); all text is a constant (AR-17).
 */
function oscSequenceFor(id: string): string | null {
  const title = 'capability-probe';
  switch (id) {
    case 'osc.hyperlink8':
      return `\x1b]8;;https://example.com\x1b\\probe-link\x1b]8;;\x1b\\`;
    case 'osc.clipboard52':
      return `\x1b]52;c;${Buffer.from(title, 'utf8').toString('base64')}\x07`;
    case 'osc.title':
      return `\x1b]0;${title}\x07`;
    case 'osc.notify9':
      return `\x1b]9;${title} — OSC 9 test\x07`;
    case 'osc.notify777':
      return `\x1b]777;notify;${title};OSC 777 test\x07`;
    case 'osc.notify99':
      return `\x1b]99;;${title} — OSC 99 test\x1b\\`;
    case 'osc.progress9_4':
      return `\x1b]9;4;1;50\x07`;
    case 'osc.bell':
      return '\x07';
    default:
      return null;
  }
}

/**
 * Drive the manual probe loop. For each probe: render its pattern, emit any OSC
 * side effect, display it, await a confirmation key, and record the result. Never
 * stops early on a "no" — every probe is recorded (AR-15).
 *
 * @param deps Injectable `render` (display a buffer), `emit` (write a raw sequence
 *   to the terminal), `nextKey` (await a y/n/s key), `probes`, and `caps`.
 * @returns A map of probe id → {@link ProbeResult}.
 */
export async function runManualProbes(deps: {
  render: (buffer: ScreenBuffer) => void;
  emit: (sequence: string) => void;
  nextKey: () => Promise<'y' | 'n' | 's'>;
  probes: readonly ProbeDescriptor[];
  caps: CapabilityProfile;
}): Promise<Record<string, ProbeResult>> {
  const results: Record<string, ProbeResult> = {};

  for (const probe of deps.probes) {
    const buffer = new ScreenBuffer(60, 8, { fg: DEFAULT_FG, bg: DEFAULT_BG });
    renderProbePattern(buffer, probe, deps.caps);

    const sequence = oscSequenceFor(probe.id);
    if (sequence !== null) {
      deps.emit(sequence);
    }
    deps.render(buffer);

    const key = await deps.nextKey();
    results[probe.id] = classifyConfirmation(key);
  }

  return results;
}
