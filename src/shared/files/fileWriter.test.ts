import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileWriter } from './fileWriter';

const native = vi.hoisted(() => ({
  isNative: vi.fn(() => false),
  publish: vi.fn(),
  open: vi.fn(async () => {}),
  share: vi.fn(async () => {}),
  saveFile: vi.fn(async () => ({ method: 'download' })),
  appendFile: vi.fn(async () => {}),
  deleteFile: vi.fn(async () => {}),
  getUri: vi.fn(async () => ({ uri: 'file:///cache/out.pdf' })),
}));

vi.mock('./platform', () => ({ isNativePlatform: native.isNative }));
vi.mock('./saveFile', async (importOriginal) => ({ ...(await importOriginal<object>()), saveFile: native.saveFile }));
vi.mock('@capacitor/core', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  registerPlugin: () => ({ publish: native.publish, open: native.open, share: native.share }),
}));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { appendFile: native.appendFile, deleteFile: native.deleteFile, getUri: native.getUri },
}));

const bytes = (...values: number[]) => new Uint8Array(values);

beforeEach(() => {
  vi.clearAllMocks();
  native.isNative.mockReturnValue(false);
});

describe('createFileWriter in a browser', () => {
  it('joins the parts and downloads the result, under a safe name', async () => {
    const writer = await createFileWriter('a/b.pdf', 'application/pdf');
    await writer.write(bytes(1, 2));
    await writer.write(bytes(3));
    const saved = await writer.save();

    const [blob, name] = native.saveFile.mock.calls[0] as unknown as [Blob, string];
    expect(name).toBe('a_b.pdf');
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([1, 2, 3]);
    expect(saved).toMatchObject({ name: 'a_b.pdf', size: 3 });
  });
});

describe('createFileWriter on Android', () => {
  beforeEach(() => {
    native.isNative.mockReturnValue(true);
    native.publish.mockResolvedValue({ uri: 'content://media/1', name: 'out (1).pdf' });
  });

  it('clears a leftover first, and appends in pieces the bridge can carry', async () => {
    const writer = await createFileWriter('out.pdf', 'application/pdf');
    expect(native.deleteFile).toHaveBeenCalledWith({ path: 'out.pdf', directory: 'CACHE' });

    await writer.write(new Uint8Array(7 * 1024 * 1024));
    expect(native.appendFile).toHaveBeenCalledTimes(3);
  });

  it('moves the file to Downloads, keeps the name it got, and removes the cache copy', async () => {
    const writer = await createFileWriter('out.pdf', 'application/pdf');
    await writer.write(bytes(1, 2, 3));
    native.deleteFile.mockClear();
    const saved = await writer.save();

    expect(native.publish).toHaveBeenCalledWith({ uri: 'file:///cache/out.pdf', name: 'out.pdf', mimeType: 'application/pdf' });
    expect(native.deleteFile).toHaveBeenCalledOnce();
    expect(saved).toMatchObject({ name: 'out (1).pdf', size: 3, location: 'Saved in Downloads/Toolbox.' });

    await saved.open();
    expect(native.open).toHaveBeenCalledWith({ uri: 'content://media/1', mimeType: 'application/pdf' });
  });

  it('keeps the cache copy, and says so, when Downloads refuses', async () => {
    native.publish.mockRejectedValue(new Error('Storage permission was refused.'));
    const writer = await createFileWriter('out.pdf', 'application/pdf');
    native.deleteFile.mockClear();
    const saved = await writer.save();

    expect(native.deleteFile).not.toHaveBeenCalled();
    expect(saved.location).toContain('Use Share');
    await saved.share();
    expect(native.share).toHaveBeenCalledWith({ uri: 'file:///cache/out.pdf', mimeType: 'application/pdf', title: 'out.pdf' });
  });

  it('discard deletes the partial file', async () => {
    const writer = await createFileWriter('out.pdf', 'application/pdf');
    native.deleteFile.mockClear();
    await writer.discard();
    expect(native.deleteFile).toHaveBeenCalledWith({ path: 'out.pdf', directory: 'CACHE' });
  });
});
