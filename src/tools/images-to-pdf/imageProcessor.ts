import type { ImageJob, PageResult, ThumbnailResult } from './imageWorker';
import { THUMBNAIL_LONG_EDGE } from './logic';

export interface ImageProcessor {
  thumbnail: (file: File) => Promise<Blob>;
  page: (job: Omit<Extract<ImageJob, { kind: 'page' }>, 'kind'>) => Promise<PageResult>;
  dispose: () => void;
}

/** A background worker that decodes and encodes images; a job that fails rejects its own promise only. */
export function createImageProcessor(): ImageProcessor {
  const worker = new Worker(new URL('./imageWorker.ts', import.meta.url), { type: 'module' });
  const waiting = new Map<number, { resolve: (result: never) => void; reject: (reason: Error) => void }>();
  let nextId = 0;

  worker.onmessage = ({ data }: MessageEvent<{ id: number; result?: never; failed?: string }>) => {
    const job = waiting.get(data.id);
    waiting.delete(data.id);
    if (data.failed === undefined) job?.resolve(data.result as never);
    else job?.reject(new Error(data.failed));
  };
  worker.onerror = (event) => {
    for (const job of waiting.values()) job.reject(new Error(event.message));
    waiting.clear();
  };

  function run<T>(job: ImageJob): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve: resolve as (result: never) => void, reject });
      worker.postMessage({ id, job });
    });
  }

  return {
    async thumbnail(file) {
      const { blob } = await run<ThumbnailResult>({ kind: 'thumbnail', file, longEdge: THUMBNAIL_LONG_EDGE });
      return blob;
    },
    page: (job) => run<PageResult>({ kind: 'page', ...job }),
    dispose: () => worker.terminate(),
  };
}
