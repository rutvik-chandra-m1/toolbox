import { describe, expect, it, vi } from 'vitest';
import { CancelledError, ConversionError, convertImages, type ConverterDeps } from './converter';
import type { PageResult } from './imageWorker';
import { defaultOptions, type PageItem } from './logic';
import type { OcrLine } from './textLayer';

const line: OcrLine = { height: 10, words: [{ text: 'hello', left: 0, right: 50, baseline: 20 }] };

const item = (name: string): PageItem => ({ id: name, file: new File(['x'], name), rotation: 0, takenAt: 0 });

const image = (): PageResult => ({
  width: 100,
  height: 200,
  data: new Uint8Array([1, 2, 3]).buffer,
  ocr: { blob: new Blob(['x']), width: 100, height: 200 },
});

function setup(overrides: Partial<ConverterDeps> = {}, read: (blob: Blob) => Promise<OcrLine[]> = async () => [line]) {
  const writer = {
    write: vi.fn(async () => {}),
    save: vi.fn(async () => ({ name: 'out.pdf', size: 3, location: '', open: async () => {}, share: async () => {} })),
    discard: vi.fn(async () => {}),
  };
  const page = vi.fn(async () => image());
  const dispose = vi.fn();
  const recognize = vi.fn(read);
  const engineDispose = vi.fn(async () => {});

  const deps: ConverterDeps = {
    createImageProcessor: () => ({ thumbnail: async () => new Blob(), page, dispose }),
    createOcrEngines: async (count) => Array.from({ length: count }, () => ({ recognize, dispose: engineDispose })),
    createFileWriter: vi.fn(async () => writer),
    parallelPages: () => 2,
    ...overrides,
  };
  return { deps, writer, page, dispose, recognize, engineDispose };
}

const options = { ...defaultOptions(new Date()), filename: 'out' };
const run = (pages: PageItem[], deps: ConverterDeps, extra: Partial<typeof options> = {}, signal = new AbortController().signal) =>
  convertImages(pages, { ...options, ...extra }, 'out', { deps, signal });

describe('convertImages', () => {
  it('counts pages and pages with text, and releases its workers', async () => {
    const empty = setup({}, vi.fn<(blob: Blob) => Promise<OcrLine[]>>().mockResolvedValueOnce([line]).mockResolvedValue([]));
    const result = await run([item('a.jpg'), item('b.jpg'), item('c.jpg')], empty.deps);

    expect(result).toMatchObject({ pageCount: 3, pagesWithText: 1, skipped: [] });
    expect(empty.writer.save).toHaveBeenCalledOnce();
    expect(empty.writer.discard).not.toHaveBeenCalled();
    expect(empty.dispose).toHaveBeenCalledOnce();
    expect(empty.engineDispose).toHaveBeenCalledTimes(2);
  });

  it('never has more than two pages in progress, and writes them in order', async () => {
    let running = 0;
    let peak = 0;
    const order: string[] = [];
    const slow = setup();
    slow.page.mockImplementation(async () => {
      peak = Math.max(peak, ++running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      return image();
    });
    slow.recognize.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
      return [line];
    });
    slow.writer.write.mockImplementation(async (bytes?: unknown) => {
      const text = new TextDecoder('latin1').decode(bytes as Uint8Array);
      if (text.includes('/Type /Page ')) order.push(text);
    });

    const pages = Array.from({ length: 7 }, (_, i) => item(`${i}.jpg`));
    await run(pages, slow.deps);

    expect(peak).toBeLessThanOrEqual(2);
    expect(order).toHaveLength(7);
    expect(slow.page.mock.calls.map((call) => (call as unknown[])[0] as { file: File }).map((job) => job.file.name)).toEqual(pages.map((p) => p.file.name));
  });

  it('skips an unreadable image, carries on, and names it', async () => {
    const { deps, page } = setup();
    page.mockImplementationOnce(async () => {
      throw new Error('decode failed');
    });
    const result = await run([item('bad.jpg'), item('good.jpg')], deps);

    expect(result.pageCount).toBe(1);
    expect(result.skipped).toEqual([{ name: 'bad.jpg', reason: 'The file is damaged or could not be read.' }]);
  });

  it('explains a HEIC photo the device cannot decode', async () => {
    const { deps, page } = setup();
    page.mockImplementationOnce(async () => {
      throw new Error('decode failed');
    });
    const result = await run([item('photo.heic'), item('good.jpg')], deps);
    expect(result.skipped[0]?.reason).toContain('HEIC photos');
  });

  it('fails clearly when no image can be read, and removes the partial file', async () => {
    const { deps, page, writer } = setup();
    page.mockRejectedValue(new Error('nope'));

    await expect(run([item('a.jpg')], deps)).rejects.toBeInstanceOf(ConversionError);
    expect(writer.discard).toHaveBeenCalledOnce();
    expect(writer.save).not.toHaveBeenCalled();
  });

  it('keeps a page whose OCR failed, without text', async () => {
    const { deps } = setup({}, async () => {
      throw new Error('ocr crashed');
    });
    expect(await run([item('a.jpg')], deps)).toMatchObject({ pageCount: 1, pagesWithText: 0 });
  });

  it('with OCR off, no engine starts and no OCR image is made', async () => {
    const createOcrEngines = vi.fn(async () => []);
    const { deps, page } = setup({ createOcrEngines });
    const result = await run([item('a.jpg')], deps, { ocr: false, saveText: true });

    expect(createOcrEngines).not.toHaveBeenCalled();
    expect(result).toMatchObject({ pagesWithText: null, textFile: null });
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ ocrLongEdge: null }));
  });

  it('asks for a lossless check only on images that are not already JPEG', async () => {
    const { deps, page } = setup();
    await run([item('a.jpg'), item('b.png')], deps);
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ keepLossless: false }));
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ keepLossless: true }));
  });

  it('cancelling stops at once, even in the middle of OCR, and deletes the partial file', async () => {
    const controller = new AbortController();
    const { deps, writer, dispose } = setup({}, () => new Promise(() => {})); // OCR that never ends
    const running = run([item('a.jpg'), item('b.jpg'), item('c.jpg')], deps, {}, controller.signal);
    setTimeout(() => controller.abort(), 5);

    await expect(running).rejects.toBeInstanceOf(CancelledError);
    expect(writer.discard).toHaveBeenCalledOnce();
    expect(writer.save).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('a failed disk write ends the run; it is not reported as a skipped image', async () => {
    const { deps, writer } = setup();
    writer.write.mockRejectedValue(new Error('disk full'));

    await expect(run([item('a.jpg')], deps)).rejects.toThrow('disk full');
    expect(writer.discard).toHaveBeenCalledOnce();
  });

  it('saves the .txt under the name the PDF really got', async () => {
    const { deps, writer } = setup();
    writer.save.mockResolvedValueOnce({ name: 'out (1).pdf', size: 3, location: '', open: async () => {}, share: async () => {} });
    await run([item('a.jpg')], deps, { saveText: true });

    expect(deps.createFileWriter).toHaveBeenCalledWith('out (1).txt', 'text/plain');
    const written = writer.write.mock.calls.at(-1) as unknown as [Uint8Array];
    expect(new TextDecoder().decode(written[0])).toBe('=== Page 1 ===\nhello\n');
  });
});
