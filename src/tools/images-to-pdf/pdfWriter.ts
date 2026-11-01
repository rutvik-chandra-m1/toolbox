import { GLYPH_WIDTH, toUnicodeCMap } from './textLayer';
import type { PageLayout } from './logic';

export type PdfImage =
  | { format: 'jpeg'; width: number; height: number; data: Uint8Array }
  /** Deflated palette indices. */
  | { format: 'indexed'; width: number; height: number; data: Uint8Array; palette: Uint8Array };

export interface PdfPage {
  image: PdfImage;
  layout: PageLayout;
  /** Operators drawn over the image (the invisible text layer). */
  text: string;
}

export interface PdfWriter {
  addPage: (page: PdfPage) => Promise<void>;
  finish: () => Promise<void>;
}

// Objects that exist once; pages take the numbers after these.
const CATALOG = 1;
const PAGES = 2;
const FONT = 3;
const FONT_DESCRIPTOR = 4;
const TO_UNICODE = 5;
const INFO = 6;
const FIRST_FREE = 7;

const encoder = new TextEncoder();
const num = (value: number) => value.toFixed(2);
const hex = (bytes: Iterable<number>) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** A text string in a PDF dictionary, as UTF-16 so any file name survives. */
function textString(text: string): string {
  const units = Array.from(text, (char) => char.charCodeAt(0).toString(16).padStart(4, '0'));
  return `<FEFF${units.join('')}>`;
}

function pdfDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `D:${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * Writes a PDF front to back, handing the bytes to `sink` a page at a time, so
 * nothing but the page in progress is ever in memory. (jsPDF and pdf-lib both
 * keep every image until the end, which 100 photos on a phone cannot afford.)
 *
 * The font is Helvetica, not embedded: it is only used for invisible text. Its
 * ToUnicode map makes the text extract as real characters.
 */
export function createPdfWriter(
  sink: (bytes: Uint8Array) => Promise<void>,
  { title, creator, created = new Date() }: { title: string; creator: string; created?: Date },
): PdfWriter {
  const offsets = new Map<number, number>();
  const pageObjects: number[] = [];
  let position = 0;
  let nextObject = FIRST_FREE;

  async function write(chunk: string | Uint8Array) {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    position += bytes.length;
    await sink(bytes);
  }

  async function object(id: number, body: string) {
    offsets.set(id, position);
    await write(`${id} 0 obj\n${body}\nendobj\n`);
  }

  async function stream(id: number, dictionary: string, data: string | Uint8Array) {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    offsets.set(id, position);
    await write(`${id} 0 obj\n<< ${dictionary} /Length ${bytes.length} >>\nstream\n`);
    await write(bytes);
    await write('\nendstream\nendobj\n');
  }

  let started = false;
  async function start() {
    if (started) return;
    started = true;
    await write('%PDF-1.4\n%âãÏÓ\n');
    const widths = new Array(224).fill(GLYPH_WIDTH * 1000).join(' ');
    await object(
      FONT,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 255 /Widths [${widths}] /FontDescriptor ${FONT_DESCRIPTOR} 0 R /ToUnicode ${TO_UNICODE} 0 R >>`,
    );
    await object(
      FONT_DESCRIPTOR,
      '<< /Type /FontDescriptor /FontName /Helvetica /Flags 32 /FontBBox [-166 -225 1000 931] /ItalicAngle 0 /Ascent 718 /Descent -207 /CapHeight 718 /StemV 88 >>',
    );
    await stream(TO_UNICODE, '', toUnicodeCMap());
  }

  return {
    async addPage({ image, layout, text }) {
      await start();
      const [imageId, contentId, pageId] = [nextObject, nextObject + 1, nextObject + 2];
      nextObject += 3;

      const colour =
        image.format === 'jpeg'
          ? '/ColorSpace /DeviceRGB /Filter /DCTDecode'
          : `/ColorSpace [/Indexed /DeviceRGB ${image.palette.length / 3 - 1} <${hex(image.palette)}>] /Filter /FlateDecode`;
      await stream(
        imageId,
        `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /BitsPerComponent 8 ${colour}`,
        image.data,
      );

      const { x, y, width, height } = layout.image;
      await stream(contentId, '', `q\n${num(width)} 0 0 ${num(height)} ${num(x)} ${num(y)} cm\n/Im0 Do\nQ\n${text}`);

      await object(
        pageId,
        `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${num(layout.width)} ${num(layout.height)}] /Contents ${contentId} 0 R /Resources << /XObject << /Im0 ${imageId} 0 R >> /Font << /F1 ${FONT} 0 R >> >> >>`,
      );
      pageObjects.push(pageId);
    },

    async finish() {
      await start();
      const kids = pageObjects.map((id) => `${id} 0 R`).join(' ');
      await object(PAGES, `<< /Type /Pages /Count ${pageObjects.length} /Kids [${kids}] >>`);
      await object(CATALOG, `<< /Type /Catalog /Pages ${PAGES} 0 R >>`);
      await object(
        INFO,
        `<< /Title ${textString(title)} /Creator ${textString(creator)} /Producer ${textString(creator)} /CreationDate (${pdfDate(created)}) >>`,
      );

      const xref = position;
      const entries = ['0000000000 65535 f \n'];
      for (let id = 1; id < nextObject; id++) entries.push(`${String(offsets.get(id)).padStart(10, '0')} 00000 n \n`);
      await write(
        `xref\n0 ${nextObject}\n${entries.join('')}trailer\n<< /Size ${nextObject} /Root ${CATALOG} 0 R /Info ${INFO} 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
      );
    },
  };
}
