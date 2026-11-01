import type { Rect } from './logic';

/** Pixels, in the image OCR read. */
export interface OcrWord {
  text: string;
  left: number;
  right: number;
  /** Where the line's baseline passes under this word. */
  baseline: number;
}

export interface OcrLine {
  height: number;
  words: OcrWord[];
}

/** Windows-1252 bytes 0x80-0x9F; every other byte up to 0xFF is its own Unicode value. */
const CP1252_HIGH =
  '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F' +
  '\u0090‘’“”•–—˜™š›œ\u009DžŸ';

const unicodeOf = (byte: number) =>
  byte >= 0x80 && byte <= 0x9f ? (CP1252_HIGH.charCodeAt(byte - 0x80) as number) : byte;

const BYTE_OF = new Map<string, number>();
for (let byte = 0x20; byte <= 0xff; byte++) BYTE_OF.set(String.fromCharCode(unicodeOf(byte)), byte);

const hex = (value: number, length: number) => value.toString(16).toUpperCase().padStart(length, '0');

/** Text as Windows-1252 bytes. Ligatures and the like are spelled out; what remains unknown becomes "?". */
export function encodeText(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const known = BYTE_OF.get(char);
    if (known !== undefined) bytes.push(known);
    else for (const part of char.normalize('NFKC')) bytes.push(BYTE_OF.get(part) ?? 0x3f);
  }
  return bytes;
}

/**
 * The font's ToUnicode map: it tells PDF readers which real character each byte
 * stands for, so copied or extracted text is never garbage.
 */
export function toUnicodeCMap(): string {
  const entries: string[] = [];
  for (let byte = 0x20; byte <= 0xff; byte++) entries.push(`<${hex(byte, 2)}> <${hex(unicodeOf(byte), 4)}>`);

  const sections: string[] = [];
  for (let start = 0; start < entries.length; start += 100) {
    const section = entries.slice(start, start + 100); // a section may have at most 100 entries
    sections.push(`${section.length} beginbfchar\n${section.join('\n')}\nendbfchar`);
  }

  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<00> <FF>',
    'endcodespacerange',
    ...sections,
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
}

/** Every glyph of the font is declared this wide (of 1 em): text is invisible, so only its box matters. */
export const GLYPH_WIDTH = 0.5;

const num = (value: number) => value.toFixed(2);

/**
 * PDF operators for an invisible text layer (render mode 3) over an image placed
 * at `image` on the page. Each word is stretched to its box, so selecting text
 * highlights the word in the photo. Written in reading order, as OCR gave it.
 */
export function textOperators(lines: readonly OcrLine[], ocrWidth: number, ocrHeight: number, image: Rect): string {
  const scaleX = image.width / ocrWidth;
  const scaleY = image.height / ocrHeight;
  const operators: string[] = [];

  for (const line of lines) {
    const fontSize = Math.max(1, line.height * scaleY);
    operators.push(`/F1 ${num(fontSize)} Tf`);

    line.words.forEach((word, index) => {
      const bytes = encodeText(word.text);
      const width = (word.right - word.left) * scaleX;
      const stretch = (100 * width) / (bytes.length * GLYPH_WIDTH * fontSize);
      const x = image.x + word.left * scaleX;
      const y = image.y + image.height - word.baseline * scaleY;
      // A real space between words, so that tools which don't work from positions still separate them.
      if (index < line.words.length - 1) bytes.push(0x20);

      operators.push(
        `${num(stretch)} Tz`,
        `1 0 0 1 ${num(x)} ${num(y)} Tm`,
        `<${bytes.map((byte) => hex(byte, 2)).join('')}> Tj`,
      );
    });
  }

  return operators.length > 0 ? `BT\n3 Tr\n${operators.join('\n')}\nET\n` : '';
}

/** The text of a page: one line per line. */
export function plainText(lines: readonly OcrLine[]): string {
  return lines.map((line) => line.words.map((word) => word.text).join(' ')).join('\n');
}
