import type { Rotation } from './logic';
import { toIndexed } from './pixels';

/*
 * Web worker: all image decoding and encoding happens here, away from the UI
 * thread. createImageBitmap already applies a photo's EXIF orientation.
 */

export type ImageJob =
  | { kind: 'thumbnail'; file: File; longEdge: number }
  | { kind: 'page'; file: File; rotation: Rotation; longEdge: number; jpegQuality: number; keepLossless: boolean; ocrLongEdge: number | null };

export interface ThumbnailResult {
  blob: Blob;
}

export interface PageResult {
  width: number;
  height: number;
  data: ArrayBuffer;
  /** Set when the page is palette pixels (see `data`) instead of a JPEG. */
  palette?: Uint8Array;
  ocr?: { blob: Blob; width: number; height: number };
}

/** A lossless page must beat the JPEG by this much to be worth keeping. */
const CLEARLY_SMALLER = 0.8;
const OCR_JPEG_QUALITY = 0.92;

function draw(bitmap: ImageBitmap, rotation: Rotation, longEdge: number): OffscreenCanvas {
  const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const sideways = rotation % 180 !== 0;

  const canvas = new OffscreenCanvas(sideways ? height : width, sideways ? width : height);
  const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  // Transparent parts of a PNG would otherwise turn black in the JPEG.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(bitmap, -width / 2, -height / 2, width, height);
  return canvas;
}

async function deflate(bytes: Uint8Array): Promise<ArrayBuffer> {
  const compressed = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Response(compressed).arrayBuffer();
}

async function encodePage(canvas: OffscreenCanvas, jpegQuality: number, keepLossless: boolean) {
  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });

  if (keepLossless) {
    const { data } = (canvas.getContext('2d') as OffscreenCanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height);
    const indexed = toIndexed(data);
    if (indexed) {
      const lossless = await deflate(indexed.indices);
      if (lossless.byteLength < jpeg.size * CLEARLY_SMALLER) return { data: lossless, palette: indexed.palette };
    }
  }
  return { data: await jpeg.arrayBuffer() };
}

async function runJob(job: ImageJob): Promise<ThumbnailResult | PageResult> {
  const bitmap = await createImageBitmap(job.file);
  try {
    if (job.kind === 'thumbnail') {
      const canvas = draw(bitmap, 0, job.longEdge);
      return { blob: await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 }) };
    }

    const canvas = draw(bitmap, job.rotation, job.longEdge);
    const page: PageResult = {
      width: canvas.width,
      height: canvas.height,
      ...(await encodePage(canvas, job.jpegQuality, job.keepLossless)),
    };
    if (job.ocrLongEdge !== null) {
      const ocr = draw(bitmap, job.rotation, job.ocrLongEdge);
      const blob = await ocr.convertToBlob({ type: 'image/jpeg', quality: OCR_JPEG_QUALITY });
      page.ocr = { blob, width: ocr.width, height: ocr.height };
    }
    return page;
  } finally {
    bitmap.close();
  }
}

self.onmessage = async ({ data: { id, job } }: MessageEvent<{ id: number; job: ImageJob }>) => {
  try {
    const result = await runJob(job);
    self.postMessage({ id, result }, { transfer: 'data' in result ? [result.data] : [] });
  } catch (error) {
    self.postMessage({ id, failed: String(error) });
  }
};
