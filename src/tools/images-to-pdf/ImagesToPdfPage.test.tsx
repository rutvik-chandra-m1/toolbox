import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelledError, ConversionError, convertImages, type Conversion } from './converter';
import ImagesToPdfPage from './ImagesToPdfPage';

const filesApi = vi.hoisted(() => ({
  pickFiles: vi.fn(),
  keepScreenOn: vi.fn(async () => {}),
  isNativePlatform: vi.fn(() => false),
}));

// jsdom can't decode images or run workers: replace those pieces.
vi.mock('@/shared/files', async (importOriginal) => ({ ...(await importOriginal<object>()), ...filesApi }));
vi.mock('./imageProcessor', () => ({
  createImageProcessor: () => ({
    thumbnail: (file: File) => (file.name.startsWith('bad') ? Promise.reject(new Error('corrupt')) : Promise.resolve(new Blob(['x']))),
    dispose: () => {},
  }),
}));
vi.mock('./converter', async (importOriginal) => ({ ...(await importOriginal<object>()), convertImages: vi.fn() }));

const convert = vi.mocked(convertImages);
URL.createObjectURL = () => 'blob:thumbnail';
URL.revokeObjectURL = () => {};

const image = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

async function addImages(...names: string[]) {
  filesApi.pickFiles.mockResolvedValueOnce(names.map(image));
  fireEvent.click(screen.getByRole('button', { name: 'Choose images' }));
  await screen.findByRole('list');
}

const rows = () => screen.getAllByRole('listitem').map((row) => row.textContent);

const conversion = (changes: Partial<Conversion> = {}): Conversion => ({
  pdf: { name: 'out.pdf', size: 2048, location: 'Saved in Downloads/Toolbox.', open: vi.fn(async () => {}), share: vi.fn(async () => {}) },
  textFile: null,
  pageCount: 2,
  pagesWithText: 1,
  skipped: [],
  ...changes,
});

beforeEach(() => {
  vi.clearAllMocks();
  filesApi.isNativePlatform.mockReturnValue(false);
  render(<ImagesToPdfPage />);
});

describe('choosing pages', () => {
  it('starts with a chooser, offering the camera only on the phone', () => {
    expect(screen.getByRole('button', { name: 'Choose images' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
  });

  it('lists picked images with page numbers', async () => {
    await addImages('b.jpg', 'a.jpg');
    expect(rows()).toEqual([expect.stringContaining('1. b.jpg'), expect.stringContaining('2. a.jpg')]);
  });

  it('appends with Add more', async () => {
    await addImages('a.jpg');
    filesApi.pickFiles.mockResolvedValueOnce([image('b.jpg')]);
    fireEvent.click(screen.getByRole('button', { name: 'Add more' }));
    await waitFor(() => expect(rows()).toHaveLength(2));
  });

  it('keeps the first 100 and says so', async () => {
    await addImages(...Array.from({ length: 103 }, (_, i) => `${i}.jpg`));
    await waitFor(() => expect(document.querySelectorAll('li')).toHaveLength(100));
    expect(screen.getByText(/only the first 100/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add more' }) as HTMLButtonElement).disabled).toBe(true);
  }, 30_000);

  it('reorders, sorts, rotates and removes', async () => {
    await addImages('c.jpg', 'a.jpg', 'b.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Move page 3 up' }));
    expect(rows()[1]).toContain('b.jpg');

    fireEvent.click(screen.getByRole('button', { name: 'By file name' }));
    expect(rows().map((row) => row?.slice(0, 7))).toEqual(['1. a.jp', '2. b.jp', '3. c.jp']);

    fireEvent.click(screen.getByRole('button', { name: 'Remove page 1' }));
    expect(rows()).toHaveLength(2);

    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate page 1' }));
    expect(document.querySelector('img')?.style.transform).toBe('rotate(90deg)');
  });

  it('marks an image that cannot be decoded, and keeps going', async () => {
    await addImages('bad.jpg', 'good.jpg');
    expect(await screen.findByLabelText("Can't be read")).toBeTruthy();
    await waitFor(() => expect(document.querySelector('img')).toBeTruthy());
  });
});

describe('options', () => {
  it('has the agreed defaults', async () => {
    await addImages('a.jpg');
    expect((screen.getByLabelText('File name') as HTMLInputElement).value).toMatch(/^images_\d{4}-\d{2}-\d{2}_\d{4}$/);
    expect((screen.getByRole('radio', { name: 'Fit to image' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'None' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Balanced' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Make text readable (OCR)' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Also save a .txt file' }) as HTMLInputElement).checked).toBe(false);
  });
});

describe('converting', () => {
  const create = () => fireEvent.click(screen.getByRole('button', { name: /^Create PDF/ }));

  it('shows the progress and a result with everything asked for', async () => {
    const result = conversion({ skipped: [{ name: 'bad.jpg', reason: 'The file is damaged or could not be read.' }] });
    let finish = (_: Conversion) => {};
    convert.mockImplementationOnce((_pages, _options, _title, { onProgress }) => {
      onProgress?.({ stage: 'page', page: 12, total: 40, reading: true });
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    await addImages('a.jpg', 'b.jpg');
    create();

    expect(await screen.findByText('Reading text: page 12 of 40')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('29');
    expect(filesApi.keepScreenOn).toHaveBeenCalledWith(true);
    finish(result);

    const card = await screen.findByText('Your PDF is ready');
    const box = within(card.closest('[role=status]') as HTMLElement);
    expect(box.getByText(/out\.pdf · 2(\.0)? KB/)).toBeTruthy();
    expect(box.getByText('2 pages')).toBeTruthy();
    expect(box.getByText('Text found on 1 of them')).toBeTruthy();
    expect(box.getByText(/bad\.jpg/)).toBeTruthy();

    fireEvent.click(box.getByRole('button', { name: 'Open' }));
    expect(result.pdf.open).toHaveBeenCalledOnce();
    fireEvent.click(box.getByRole('button', { name: 'Share' }));
    expect(result.pdf.share).toHaveBeenCalledOnce();

    fireEvent.click(box.getByRole('button', { name: 'Convert more' }));
    expect(screen.getByRole('button', { name: 'Choose images' })).toBeTruthy();
    expect(filesApi.keepScreenOn).toHaveBeenLastCalledWith(false);
  });

  it('Cancel stops it and returns to the page list with the pages intact', async () => {
    convert.mockImplementationOnce((_pages, _options, _title, { signal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(new CancelledError()))),
    );
    await addImages('a.jpg');
    create();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Cancelled. Nothing was saved.')).toBeTruthy();
    expect(rows()).toHaveLength(1);
  });

  it('shows why a conversion failed', async () => {
    convert.mockRejectedValueOnce(new ConversionError('None of these images could be read.'));
    await addImages('a.jpg');
    create();
    expect((await screen.findByRole('alert')).textContent).toContain('None of these images');
  });
});
