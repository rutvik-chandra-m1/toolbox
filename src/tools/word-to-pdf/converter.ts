import { ConversionError } from './logic';
import { createRenderFrame } from './renderFrame';
import { renderDocument } from './renderDocument';

export type ConvertProgress =
  | { stage: 'reading' }
  | { stage: 'page'; page: number; total: number }
  | { stage: 'finishing' };

export interface ConvertOptions {
  onProgress?: (progress: ConvertProgress) => void;
  /** Document title stored in the PDF's properties. */
  title?: string;
}

const A4_MM = { width: 210, height: 297 } as const;
const JPEG_QUALITY = 0.92;

/** Lets the browser paint progress between heavy steps. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Capture resolution: sharper for short documents, lighter for long ones (memory). */
const captureScale = (pageCount: number) => (pageCount > 40 ? 1.5 : 2);

/**
 * Converts a .docx to a paginated A4 PDF, entirely on this device.
 *
 * 1. Render the document to HTML in a hidden, isolated frame.
 * 2. Split it into pages (see paginate.ts).
 * 3. Photograph each page with html2canvas and place it on an A4 page of a
 *    jsPDF document. Pages with other proportions (US Letter, landscape) are
 *    scaled to fit and centred.
 *
 * Both heavy libraries are loaded on demand, so none of this costs anything
 * until the user presses Convert. The pages are images: the PDF looks like the
 * document but its text can't be selected or searched.
 */
export async function convertDocxToPdf(file: Blob, { onProgress, title }: ConvertOptions = {}): Promise<Blob> {
  onProgress?.({ stage: 'reading' });

  const [{ default: html2canvas }, { jsPDF }, frame] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
    createRenderFrame({ hidden: true }),
  ]);

  try {
    const { pages } = await renderDocument(file, frame, 'capture');
    const scale = captureScale(pages.length);

    let pdf: InstanceType<typeof jsPDF> | null = null;

    for (const [index, page] of pages.entries()) {
      onProgress?.({ stage: 'page', page: index + 1, total: pages.length });
      await breathe();

      const canvas = await html2canvas(page.element, {
        scale,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });

      const width = page.element.offsetWidth;
      const landscape = width > page.pageHeight;
      const slices = sliceCanvas(canvas, page.pageHeight * scale);

      for (const slice of slices) {
        const orientation = landscape ? 'landscape' : 'portrait';
        if (!pdf) pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
        else pdf.addPage('a4', orientation);

        const sheet = landscape ? { width: A4_MM.height, height: A4_MM.width } : A4_MM;
        // Fit the whole logical page on the sheet; a short last slice keeps the page's scale.
        const mmPerPx = Math.min(sheet.width / width, sheet.height / page.pageHeight);
        const drawWidth = width * mmPerPx;
        const drawHeight = (slice.height / scale) * mmPerPx;
        const x = (sheet.width - drawWidth) / 2;
        const y = (sheet.height - page.pageHeight * mmPerPx) / 2;

        pdf.addImage(slice.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', x, y, drawWidth, drawHeight, undefined, 'FAST');
        if (slice !== canvas) releaseCanvas(slice);
      }
      releaseCanvas(canvas);
    }

    if (!pdf) throw new ConversionError('This document has nothing to convert.', 'empty');
    onProgress?.({ stage: 'finishing' });
    pdf.setProperties({ title: title ?? 'Document', creator: 'Toolbox' });
    return pdf.output('blob');
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError('The PDF could not be created. Please try again.', 'pdf', { cause: error });
  } finally {
    frame.dispose();
  }
}

/**
 * A page that is taller than one sheet (one unsplittable block bigger than a
 * page) is cut into sheet-sized strips. Normal pages come back as-is.
 */
function sliceCanvas(canvas: HTMLCanvasElement, sliceHeight: number): HTMLCanvasElement[] {
  if (canvas.height <= sliceHeight * 1.02) return [canvas];

  const slices: HTMLCanvasElement[] = [];
  for (let top = 0; top < canvas.height; top += sliceHeight) {
    const height = Math.min(sliceHeight, canvas.height - top);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = height;
    slice.getContext('2d')?.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height);
    slices.push(slice);
  }
  return slices;
}

/** Frees the pixel memory of a canvas right away (matters on phones). */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
