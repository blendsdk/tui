/**
 * `Text` — a non-focusable static label (Turbo Vision `TStaticText`, RD-06 AR-100/PA-14).
 *
 * Renders a string or a reactive getter, word-wrapped on spaces and left-aligned, in the
 * `staticText` theme role. The wrap replicates `TStaticText::draw` (`tstatict.cpp:44-105`): greedily
 * fit whole words within the view width, hard-breaking a single word that is itself wider than the
 * view. Center/right alignment (TV's leading `0x03`) and the hardware caret are out of v1 (PA-14;
 * DEF-18). The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import { charWidth } from '@jsvision/core';
import type { WidthMode } from '@jsvision/core';
import { View } from '../view/index.js';
import type { DrawContext } from '../view/index.js';

/** Width-resolution mode — matches `ScreenBuffer`/`DrawContext` so wrap math agrees with the buffer. */
const WIDTH_MODE: WidthMode = 'wcwidth';

/** Display width of a single glyph (wide CJK/emoji = 2, zero-width = 0). */
function glyphWidth(ch: string): number {
  return charWidth(ch.codePointAt(0) ?? 0, WIDTH_MODE);
}

/** Display width of a string, summed over its glyphs. */
function stringWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += glyphWidth(ch);
  return w;
}

/**
 * Greedy word-wrap to `width` display columns, faithful to `TStaticText::draw` (`tstatict.cpp:74-88`):
 * pack whole space-separated words onto a line until the next word would overflow, then wrap; a word
 * wider than the whole line is hard-broken at the width boundary. Explicit `\n` forces a line break.
 *
 * @param content The text to wrap.
 * @param width   The view width in display columns.
 * @returns The wrapped lines (at least one, possibly empty, per source paragraph).
 */
function wrapText(content: string, width: number): string[] {
  const lines: string[] = [];
  if (width <= 0) return lines;
  for (const paragraph of content.split('\n')) {
    let cur = '';
    let curW = 0;
    for (const word of paragraph.match(/\S+/g) ?? []) {
      const wordW = stringWidth(word);
      if (wordW > width) {
        // The word alone overflows the line → hard-break it into width-sized chunks (tstatict.cpp:74).
        if (cur !== '') {
          lines.push(cur);
          cur = '';
          curW = 0;
        }
        let chunk = '';
        let chunkW = 0;
        for (const ch of word) {
          const cw = glyphWidth(ch);
          if (chunkW + cw > width) {
            lines.push(chunk);
            chunk = '';
            chunkW = 0;
          }
          chunk += ch;
          chunkW += cw;
        }
        cur = chunk;
        curW = chunkW;
        continue;
      }
      const sep = cur === '' ? 0 : 1; // a separating space between words
      if (curW + sep + wordW > width) {
        lines.push(cur);
        cur = word;
        curW = wordW;
      } else {
        cur = cur === '' ? word : `${cur} ${word}`;
        curW += sep + wordW;
      }
    }
    lines.push(cur); // flush the paragraph's last (or only/empty) line
  }
  return lines;
}

/**
 * A static text view. Non-focusable (Tab skips it); paints word-wrapped, left-aligned text in the
 * `staticText` role.
 */
export class Text extends View {
  /** The literal text, or a reactive getter that repaints the view when its signals change. */
  protected readonly content: string | (() => string);

  /**
   * @param content A literal string, or a getter (`() => string`) that repaints `Text` on change.
   */
  constructor(content: string | (() => string)) {
    super();
    this.content = content;
    if (typeof content === 'function') {
      // Subscribe to the getter's signals so a change repaints (PA-14). Canonical site: onMount (PA-2).
      this.onMount(() => this.bind(content));
    }
  }

  /**
   * Paint the (resolved) content word-wrapped to the view width in the `staticText` role; rows beyond
   * the view height are clipped.
   *
   * @param ctx The clipped, view-local paint context.
   */
  override draw(ctx: DrawContext): void {
    const content = typeof this.content === 'function' ? this.content() : this.content;
    const style = ctx.color('staticText');
    const { width, height } = ctx.size;
    ctx.fillRect(0, 0, width, height, ' ', style); // fill the field (TV moveChar ' ' per row)
    const lines = wrapText(content, width);
    for (let y = 0; y < height && y < lines.length; y += 1) {
      const line = lines[y];
      if (line !== undefined && line !== '') ctx.text(0, y, line, style);
    }
  }
}
