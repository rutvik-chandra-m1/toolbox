import { createFileWriter, type SavedFile } from '@/shared/files';
import { createImageProcessor, type ImageProcessor } from './imageProcessor';
import type { PageResult } from './imageWorker';
import { OCR_LONG_EDGE, QUALITY, formatTextFile, isHeic, isJpeg, layoutPage, type Options, type PageItem } from './logic';
import type { OcrEngine } from './ocr';
import { createPdfWriter, type PdfImage } from './pdfWriter';
import { plainText, textOperators, type OcrLine } from './textLayer';

export const CREATOR = 'Toolbox - Images to PDF';

export type Progress =
  | { stage: 'starting' }
  | { stage: 'page'; page: number; total: number; reading: boolean }
  | { stage: 'saving' };

export interface SkippedImage {
  name: string;
  reason: string;
}

export interface Conversion {
  pdf: SavedFile;
  textFile: SavedFile | null;
  pageCount: number;
  /** null when OCR was off. */
  pagesWithText: number | null;
  skipped: SkippedImage[];
}

/** Stopped by the user. The partial file is already gone. */
export class CancelledError extends Error {}

/** An error whose message can be shown to the user as it is. */
export class ConversionError extends Error {}

/** The parts that need a real browser, injectable for tests. */
export interface ConverterDeps {
  createImageProcessor: () => ImageProcessor;
  createOcrEngines: (count: number) => Promise<OcrEngine[]>;
  createFileWriter: typeof createFileWriter;
  /** How many pages to work on at once when reading text. */
  parallelPages: () => number;
}

const defaultDeps: ConverterDeps = {
  createImageProcessor,
  async createOcrEngines(count) {
    const { createOcrEngine } = await import('./ocr');
    return Promise.all(Array.from({ length: count }, createOcrEngine));
  },
  createFileWriter,
  // Two tesseract workers read about twice as fast, if there are cores to run them.
  parallelPages: () => ((navigator.hardwareConcurrency ?? 1) >= 4 ? 2 : 1),
};

function skipReason(file: File): string {
  return isHeic(file) ? "HEIC photos can't be read on this device. Convert it to JPG first." : 'The file is damaged or could not be read.';
}

function pdfImage(page: PageResult): PdfImage {
  const data = new Uint8Array(page.data);
  const { width, height, palette } = page;
  return palette ? { format: 'indexed', width, height, data, palette } : { format: 'jpeg', width, height, data };
}

/** Rejects when the signal fires, so a long OCR job doesn't have to finish first. */
function whenAborted(signal: AbortSignal): Promise<never> {
  const aborted = new Promise<never>((_, reject) => {
    if (signal.aborted) reject(new CancelledError());
    signal.addEventListener('abort', () => reject(new CancelledError()), { once: true });
  });
  aborted.catch(() => {}); // it is usually never awaited
  return aborted;
}

/**
 * Makes one PDF from the pages, in order, a page at a time: each page is decoded,
 * read and written out before its memory is let go. At most two are in progress.
 */
export async function convertImages(
  pages: readonly PageItem[],
  options: Options,
  title: string,
  { onProgress, signal, deps = defaultDeps }: { onProgress?: (progress: Progress) => void; signal: AbortSignal; deps?: ConverterDeps },
): Promise<Conversion> {
  onProgress?.({ stage: 'starting' });
  const aborted = whenAborted(signal);
  const quality = QUALITY[options.quality];
  const images = deps.createImageProcessor();
  const writer = await deps.createFileWriter(`${title}.pdf`, 'application/pdf');
  let engines: OcrEngine[] = [];

  try {
    if (options.ocr) {
      engines = await Promise.race([
        deps.createOcrEngines(deps.parallelPages()).catch((error: unknown) => {
          throw new ConversionError('The text reader could not start. Turn off "Make text readable" or try again.', { cause: error });
        }),
        aborted,
      ]);
    }

    const pdf = createPdfWriter(writer.write, { title, creator: CREATOR });
    const texts: string[] = [];
    const skipped: SkippedImage[] = [];
    let pageCount = 0;
    let pagesWithText = 0;
    let finished = 0;

    const report = () =>
      onProgress?.({ stage: 'page', page: Math.min(finished + 1, pages.length), total: pages.length, reading: options.ocr });

    const prepare = async (page: PageItem, engine: OcrEngine | undefined) => {
      const image = await images.page({
        file: page.file,
        rotation: page.rotation,
        longEdge: quality.longEdge,
        jpegQuality: quality.jpeg,
        keepLossless: !isJpeg(page.file),
        ocrLongEdge: engine ? OCR_LONG_EDGE : null,
      });

      let lines: OcrLine[] = [];
      if (engine && image.ocr) {
        try {
          lines = await engine.recognize(image.ocr.blob);
        } catch (error) {
          console.error(error); // the page itself is fine: keep it, without text
        }
      }
      return { image, lines };
    };

    const write = async ({ image, lines }: Awaited<ReturnType<typeof prepare>>) => {
      const layout = layoutPage(image.width, image.height, options.pageSize, options.margin);
      const text = image.ocr ? textOperators(lines, image.ocr.width, image.ocr.height, layout.image) : '';
      await pdf.addPage({ image: pdfImage(image), layout, text });
      pageCount++;
      if (lines.length > 0) pagesWithText++;
      texts.push(plainText(lines));
    };

    /** Up to two pages run ahead, but they reach the PDF in order. */
    const inProgress: { page: PageItem; work: ReturnType<typeof prepare> }[] = [];

    const writeOldest = async () => {
      const { page, work } = inProgress.shift() as (typeof inProgress)[number];
      let prepared: Awaited<typeof work> | null = null;
      try {
        prepared = await Promise.race([work, aborted]);
      } catch (error) {
        if (error instanceof CancelledError) throw error;
        console.error(error);
        skipped.push({ name: page.file.name, reason: skipReason(page.file) });
      }
      if (prepared) await write(prepared); // a failed write ends the run: the PDF would be broken
      finished++;
      report();
    };

    report();
    for (const [index, page] of pages.entries()) {
      const work = prepare(page, engines[index % Math.max(engines.length, 1)]);
      work.catch(() => {}); // handled by writeOldest, unless a cancel gets there first
      inProgress.push({ page, work });
      if (inProgress.length >= Math.max(engines.length, 1)) await writeOldest();
    }
    while (inProgress.length > 0) await writeOldest();

    if (pageCount === 0) throw new ConversionError('None of these images could be read, so there is nothing to put in a PDF.');

    onProgress?.({ stage: 'saving' });
    await pdf.finish();
    if (signal.aborted) throw new CancelledError();
    const saved = await writer.save();

    let textFile: SavedFile | null = null;
    if (options.saveText && options.ocr) {
      textFile = await saveText(deps, saved.name.replace(/\.pdf$/i, '.txt'), formatTextFile(texts));
    }
    return { pdf: saved, textFile, pageCount, pagesWithText: options.ocr ? pagesWithText : null, skipped };
  } catch (error) {
    await writer.discard();
    throw error;
  } finally {
    images.dispose();
    for (const engine of engines) void engine.dispose();
  }
}

async function saveText(deps: ConverterDeps, filename: string, text: string): Promise<SavedFile> {
  const writer = await deps.createFileWriter(filename, 'text/plain');
  await writer.write(new TextEncoder().encode(text));
  return writer.save();
}
