import { describe, expect, it } from 'vitest';
import { linesFromBlocks } from './ocr';
import { createPdfWriter, type PdfPage } from './pdfWriter';
import { encodeText, plainText, textOperators, toUnicodeCMap, type OcrLine } from './textLayer';
import type { Block } from 'tesseract.js';

const image = { x: 0, y: 0, width: 400, height: 800 };
const line: OcrLine = {
  height: 40,
  words: [
    { text: 'Hello', left: 100, right: 300, baseline: 150 },
    { text: 'world', left: 340, right: 540, baseline: 150 },
  ],
};

describe('text encoding', () => {
  it('keeps Windows-1252 characters as single bytes', () => {
    expect(encodeText('A“é€')).toEqual([0x41, 0x93, 0xe9, 0x80]);
  });

  it('spells out ligatures and marks the unknown', () => {
    expect(encodeText('ﬁx中')).toEqual([0x66, 0x69, 0x78, 0x3f]);
  });

  it('maps every byte in ToUnicode, in sections of at most 100', () => {
    const cmap = toUnicodeCMap();
    expect(cmap).toContain('<41> <0041>');
    expect(cmap).toContain('<80> <20AC>');
    expect(cmap).toContain('<E9> <00E9>');
    const sections = [...cmap.matchAll(/(\d+) beginbfchar/g)].map((match) => Number(match[1]));
    expect(sections.reduce((sum, count) => sum + count, 0)).toBe(224);
    expect(Math.max(...sections)).toBeLessThanOrEqual(100);
  });
});

describe('text layer', () => {
  // The page is half the OCR image's size, and PDF y runs upward.
  const operators = textOperators([line], 800, 1600, image);

  it('is invisible (render mode 3)', () => {
    expect(operators.startsWith('BT\n3 Tr\n')).toBe(true);
    expect(operators.endsWith('ET\n')).toBe(true);
  });

  it('places words at their box, scaled to the page', () => {
    expect(operators).toContain('/F1 20.00 Tf'); // 40 px line on a half-size page
    expect(operators).toContain('1 0 0 1 50.00 725.00 Tm'); // y: 800 - 150/2
    expect(operators).toContain('1 0 0 1 170.00 725.00 Tm');
  });

  it('stretches each word to the width of its box', () => {
    // 100 pt wide; 5 glyphs of 0.5 em at 20 pt would be 50 pt.
    expect(operators).toContain('200.00 Tz');
  });

  it('separates words with a real space, but not after the last', () => {
    expect(operators).toContain('<48656C6C6F20> Tj');
    expect(operators).toContain('<776F726C64> Tj');
  });

  it('is empty for a page with no text', () => {
    expect(textOperators([], 800, 1600, image)).toBe('');
  });

  it('gives plain text line by line', () => {
    expect(plainText([line, { height: 10, words: [{ text: 'bye', left: 0, right: 1, baseline: 1 }] }])).toBe('Hello world\nbye');
  });
});

describe('reading OCR results', () => {
  const word = (text: string, confidence: number, x0: number, x1: number) => ({ text, confidence, bbox: { x0, x1, y0: 100, y1: 150 } });
  const blocks = (words: ReturnType<typeof word>[], baseline = { x0: 0, y0: 150, x1: 100, y1: 160 }) =>
    [{ paragraphs: [{ lines: [{ baseline, bbox: { x0: 0, y0: 100, x1: 900, y1: 160 }, words }] }] }] as unknown as Block[];

  it('follows a slanted baseline from word to word', () => {
    const [first] = linesFromBlocks(blocks([word('tilted', 90, 40, 60), word('text', 90, 90, 110)]));
    expect(first?.words.map((w) => w.baseline)).toEqual([155, 160]);
    expect(first?.height).toBe(60);
  });

  it('drops low-confidence specks and punctuation-only noise, and lines left empty', () => {
    expect(linesFromBlocks(blocks([word('kept', 90, 0, 10), word('junk', 20, 20, 30), word('—|', 95, 40, 50)]))[0]?.words).toHaveLength(1);
    expect(linesFromBlocks(blocks([word('junk', 20, 0, 10)]))).toEqual([]);
  });

  it('on a page that reads as a photo, keeps only what it is very sure of', () => {
    const noisy = [word('aid', 45, 0, 10), word('pt', 15, 20, 30), word('of', 90, 40, 50), word('or', 3, 60, 70), word('xy', 5, 70, 75), word('STOP', 96, 80, 90)];
    expect(linesFromBlocks(blocks(noisy))[0]?.words.map((w) => w.text)).toEqual(['STOP']);
  });

  it('keeps an unsure word on a page of real text', () => {
    const real = [word('clear', 96, 0, 10), word('text', 95, 20, 30), word('smudgd', 45, 40, 50)];
    expect(linesFromBlocks(blocks(real))[0]?.words).toHaveLength(3);
  });
});

describe('PDF writer', () => {
  const page: PdfPage = {
    image: { format: 'jpeg', width: 10, height: 20, data: new Uint8Array([1, 2, 3]) },
    layout: { width: 100, height: 200, image: { x: 0, y: 0, width: 100, height: 200 } },
    text: 'BT\n3 Tr\nET\n',
  };

  async function build(pages: PdfPage[]) {
    const chunks: Uint8Array[] = [];
    const pdf = createPdfWriter(
      async (bytes) => {
        chunks.push(bytes);
      },
      { title: 'Notes é', creator: 'Toolbox - Images to PDF', created: new Date(2026, 0, 2, 3, 4, 5) },
    );
    for (const item of pages) await pdf.addPage(item);
    await pdf.finish();
    return { chunks, text: new TextDecoder('latin1').decode(await new Blob(chunks as BlobPart[]).arrayBuffer()) };
  }

  it('writes one page tree with every page', async () => {
    const { text } = await build([page, page]);
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text.match(/\/Type \/Page /g)).toHaveLength(2);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('has a cross-reference table whose offsets point at the real objects', async () => {
    const { text } = await build([page, page]);
    const start = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(start, start + 4)).toBe('xref');

    const entries = text.slice(start).split('\n').slice(2).filter((row) => row.endsWith(' n '));
    expect(entries.length).toBeGreaterThan(8);
    entries.forEach((row, index) => {
      expect(text.slice(Number(row.slice(0, 10))).startsWith(`${index + 1} 0 obj`)).toBe(true);
    });
  });

  it('sets the title and creator, in a form any file name survives', async () => {
    const { text } = await build([page]);
    expect(text).toContain('/Title <FEFF004e006f00740065007300200' + '0e9>');
    expect(text).toContain('/Creator <FEFF');
  });

  it('marks JPEG and palette images correctly', async () => {
    const { text } = await build([
      page,
      { ...page, image: { format: 'indexed', width: 1, height: 1, data: new Uint8Array([1]), palette: new Uint8Array([0, 0, 0, 255, 255, 255]) } },
    ]);
    expect(text).toContain('/ColorSpace /DeviceRGB /Filter /DCTDecode');
    expect(text).toContain('/ColorSpace [/Indexed /DeviceRGB 1 <000000ffffff>] /Filter /FlateDecode');
  });

  it('hands over the bytes as it goes instead of holding them until the end', async () => {
    const seen: number[] = [];
    let received = 0;
    const pdf = createPdfWriter(
      async (bytes) => {
        received += bytes.length;
      },
      { title: 't', creator: 'c' },
    );
    await pdf.addPage(page);
    seen.push(received);
    await pdf.addPage(page);
    seen.push(received);
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[1]).toBeGreaterThan(seen[0] as number);
  });
});
