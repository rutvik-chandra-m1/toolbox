import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveFile, type SaveFileDeps } from './saveFile';

// The Android plugins are replaced so we can see exactly how they are used.
const writeFile = vi.fn();
const share = vi.fn();
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: (...args: unknown[]) => writeFile(...args) },
  Directory: { Cache: 'CACHE' },
}));
vi.mock('@capacitor/share', () => ({
  Share: { share: (...args: unknown[]) => share(...args) },
}));

const pdf = () => new Blob(['hello'], { type: 'application/pdf' });

function fakeDeps(native: boolean) {
  const deps = {
    isNativePlatform: vi.fn(() => native),
    download: vi.fn(),
    saveAndShare: vi.fn(async () => 'file:///cache/out.pdf'),
  } satisfies SaveFileDeps;
  return deps;
}

describe('saveFile: platform branching', () => {
  it('in a browser: downloads, and never touches the Android path', async () => {
    const deps = fakeDeps(false);
    const blob = pdf();

    const result = await saveFile(blob, 'report.pdf', deps);

    expect(result).toEqual({ method: 'download' });
    expect(deps.download).toHaveBeenCalledExactlyOnceWith(blob, 'report.pdf');
    expect(deps.saveAndShare).not.toHaveBeenCalled();
  });

  it('on Android: writes + shares, and never triggers a blob download', async () => {
    const deps = fakeDeps(true);
    const blob = pdf();

    const result = await saveFile(blob, 'report.pdf', deps);

    expect(result).toEqual({ method: 'share', uri: 'file:///cache/out.pdf' });
    expect(deps.saveAndShare).toHaveBeenCalledExactlyOnceWith(blob, 'report.pdf');
    expect(deps.download).not.toHaveBeenCalled();
  });

  it('asks the platform check every time (it is not cached)', async () => {
    const deps = fakeDeps(false);
    await saveFile(pdf(), 'a.pdf', deps);
    deps.isNativePlatform.mockReturnValue(true);
    await saveFile(pdf(), 'b.pdf', deps);

    expect(deps.download).toHaveBeenCalledTimes(1);
    expect(deps.saveAndShare).toHaveBeenCalledTimes(1);
  });

  it('sanitises the file name on both platforms', async () => {
    const web = fakeDeps(false);
    await saveFile(pdf(), 'a/b:c?.pdf', web);
    expect(web.download).toHaveBeenCalledWith(expect.anything(), 'a_b_c_.pdf');

    const native = fakeDeps(true);
    await saveFile(pdf(), '../../etc/passwd', native);
    expect(native.saveAndShare).toHaveBeenCalledWith(expect.anything(), '_.._etc_passwd');

    const blank = fakeDeps(false);
    await saveFile(pdf(), '   ', blank);
    expect(blank.download).toHaveBeenCalledWith(expect.anything(), 'download');
  });

  it('propagates a failure from the Android path', async () => {
    const deps = fakeDeps(true);
    deps.saveAndShare.mockRejectedValue(new Error('disk full'));

    await expect(saveFile(pdf(), 'x.pdf', deps)).rejects.toThrow('disk full');
  });

  it('uses the real platform check by default: jsdom is not native, so it downloads', async () => {
    const download = vi.fn();
    const result = await saveFile(pdf(), 'x.pdf', { download });

    expect(result.method).toBe('download');
    expect(download).toHaveBeenCalledOnce();
  });
});

describe('saveFile: browser download', () => {
  // jsdom has no object-URL support, so install fakes and put things back afterwards.
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    document.body.innerHTML = '';
  });

  it('clicks a hidden download link for the blob, then cleans up', async () => {
    const clicked: Array<{ href: string; download: string }> = [];
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });

    const result = await saveFile(pdf(), 'My file.pdf', { isNativePlatform: () => false });

    expect(result.method).toBe('download');
    expect(clicked).toEqual([{ href: 'blob:fake-url', download: 'My file.pdf' }]);
    expect(document.querySelector('a')).toBeNull(); // link removed again
    expect(URL.revokeObjectURL).not.toHaveBeenCalled(); // not yet: the browser may still be reading
    vi.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    spy.mockRestore();
  });
});

describe('saveFile: Android path (Filesystem + Share plugins)', () => {
  beforeEach(() => {
    writeFile.mockReset().mockResolvedValue({ uri: 'file:///data/cache/report.pdf' });
    share.mockReset().mockResolvedValue({});
  });

  const onAndroid = { isNativePlatform: () => true };

  it('writes the file base64-encoded into the app cache, then shares that file', async () => {
    const result = await saveFile(new Blob(['hello']), 'report.pdf', onAndroid);

    expect(writeFile).toHaveBeenCalledExactlyOnceWith({
      path: 'report.pdf',
      data: 'aGVsbG8=', // base64("hello"), with no "data:" prefix
      directory: 'CACHE',
    });
    expect(share).toHaveBeenCalledExactlyOnceWith({
      title: 'report.pdf',
      files: ['file:///data/cache/report.pdf'],
      dialogTitle: 'Open or share',
    });
    expect(result).toEqual({ method: 'share', uri: 'file:///data/cache/report.pdf' });
  });

  it('writes before it shares', async () => {
    const order: string[] = [];
    writeFile.mockImplementation(async () => {
      order.push('write');
      return { uri: 'file:///x.pdf' };
    });
    share.mockImplementation(async () => {
      order.push('share');
      return {};
    });

    await saveFile(new Blob(['x']), 'x.pdf', onAndroid);
    expect(order).toEqual(['write', 'share']);
  });

  it('treats dismissing the share sheet as success (the file is already saved)', async () => {
    share.mockRejectedValue(new Error('Share canceled'));

    await expect(saveFile(new Blob(['x']), 'x.pdf', onAndroid)).resolves.toMatchObject({ method: 'share' });
  });

  it('surfaces real share errors', async () => {
    share.mockRejectedValue(new Error('No app can handle this'));

    await expect(saveFile(new Blob(['x']), 'x.pdf', onAndroid)).rejects.toThrow('No app can handle this');
  });

  it('does not share when the file could not be written', async () => {
    writeFile.mockRejectedValue(new Error('Storage full'));

    await expect(saveFile(new Blob(['x']), 'x.pdf', onAndroid)).rejects.toThrow('Storage full');
    expect(share).not.toHaveBeenCalled();
  });

  it('handles binary data (every byte value) without corrupting it', async () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    await saveFile(new Blob([bytes]), 'bin.pdf', onAndroid);

    const sent = (writeFile.mock.calls[0]?.[0] as { data: string }).data;
    const decoded = Uint8Array.from(atob(sent), (c) => c.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
});
