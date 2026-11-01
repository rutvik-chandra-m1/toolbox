import type { Block } from 'tesseract.js';
import type { OcrLine } from './textLayer';
// Bundled, so OCR works offline from the first use. Without these paths tesseract.js would fetch them from a CDN.
import trainedData from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url';
import workerScript from 'tesseract.js/dist/worker.min.js?url';
// shortcut: SIMD build only (any WebView from 2021 on), bundle tesseract-core-lstm.wasm.js too if a phone can't run it.
import coreScript from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';

export interface OcrEngine {
  recognize: (image: Blob) => Promise<OcrLine[]>;
  dispose: () => Promise<unknown>;
}

/*
 * Tesseract finds "words" in the texture of a plain photo. Measured: those pages
 * average about 20% confidence, real text about 95% even blurred or low-contrast.
 * So a page that averages low is treated as a photo, and only longer words it is
 * very sure of survive (a sign in a street photo, say).
 */
const REAL_TEXT_AVERAGE = 50;
const MIN_CONFIDENCE = 40;
const MIN_CONFIDENCE_ON_A_PHOTO = 85;
const MIN_LENGTH_ON_A_PHOTO = 3;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export function linesFromBlocks(blocks: readonly Block[]): OcrLine[] {
  const allLines = blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines));
  const candidates = allLines.flatMap((line) => line.words).filter((word) => HAS_LETTER_OR_DIGIT.test(word.text));
  const average = candidates.reduce((sum, word) => sum + word.confidence, 0) / (candidates.length || 1);
  const photo = average < REAL_TEXT_AVERAGE;
  const keep = (word: { text: string; confidence: number }) =>
    photo
      ? word.confidence >= MIN_CONFIDENCE_ON_A_PHOTO && word.text.length >= MIN_LENGTH_ON_A_PHOTO
      : word.confidence >= MIN_CONFIDENCE;

  const lines: OcrLine[] = [];

  for (const block of blocks) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const { x0, y0, x1, y1 } = line.baseline;
        const slope = x1 === x0 ? 0 : (y1 - y0) / (x1 - x0);

        const words = line.words
          .filter((word) => keep(word) && HAS_LETTER_OR_DIGIT.test(word.text))
          .map((word) => ({
            text: word.text,
            left: word.bbox.x0,
            right: word.bbox.x1,
            baseline: y0 + slope * ((word.bbox.x0 + word.bbox.x1) / 2 - x0),
          }));

        if (words.length > 0) lines.push({ height: line.bbox.y1 - line.bbox.y0, words });
      }
    }
  }
  return lines;
}

const absolute = (path: string) => new URL(path, location.href).href;

/** One tesseract worker. Everything it needs comes from the app's own files. */
export async function createOcrEngine(): Promise<OcrEngine> {
  const { createWorker, OEM } = await import('tesseract.js');
  // When a start-up step fails, createWorker never settles; only errorHandler hears about it.
  let fail: (reason: unknown) => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    fail = reject;
  });
  const worker = await Promise.race([
    createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: absolute(workerScript),
      corePath: absolute(coreScript),
      // The folder of the model. Its file name is set in vite.config.ts; `gzip: false` only
      // means it has no .gz in its name (tesseract.js unpacks by looking at the bytes).
      langPath: absolute(trainedData).replace(/\/[^/]*$/, ''),
      gzip: false,
      workerBlobURL: false,
      cacheMethod: 'none',
      errorHandler: (error) => fail(error),
    }),
    failed,
  ]);

  return {
    async recognize(image) {
      const result = await worker.recognize(image, {}, { text: false, blocks: true });
      return linesFromBlocks(result.data.blocks ?? []);
    },
    dispose: () => worker.terminate(),
  };
}
