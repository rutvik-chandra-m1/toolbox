import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convertDocxToPdf } from './converter';
import { ConversionError } from './logic';
import WordToPdfPage from './WordToPdfPage';

const filesApi = vi.hoisted(() => ({
  pickFile: vi.fn(),
  saveFile: vi.fn(),
  isNativePlatform: vi.fn(() => false),
}));

// jsdom cannot render a real document or open file choosers: replace those pieces.
vi.mock('@/shared/files', async (importOriginal) => ({ ...(await importOriginal<object>()), ...filesApi }));
vi.mock('./converter', () => ({ convertDocxToPdf: vi.fn() }));
vi.mock('./components/DocumentPreview', () => ({
  DocumentPreview: ({ file, onError }: { file: File; onError: (message: string) => void }) => (
    <div data-testid="preview">
      preview of {file.name}
      <button onClick={() => onError('Preview failed.')}>fail preview</button>
    </div>
  ),
}));

const convert = vi.mocked(convertDocxToPdf);

/** The smallest file that passes inspection: a ZIP header plus the document part's name. */
const goodBytes = () =>
  new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('....word/document.xml....')]);

function docx(name = 'report.docx', bytes: Uint8Array = goodBytes()): File {
  return new File([bytes as BlobPart], name);
}

function withSize(file: File, size: number): File {
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const region = () => screen.getByRole('region', { name: 'Word to PDF' });
const alertText = () => screen.getByRole('alert').textContent;

async function chooseFile(file: File) {
  filesApi.pickFile.mockResolvedValueOnce(file);
  fireEvent.click(screen.getByRole('button', { name: 'Choose file' }));
}

async function loadFile(file = docx()) {
  await chooseFile(file);
  await screen.findByTestId('preview');
}

/** A conversion we can finish by hand, to look at the "in progress" screen. */
function pendingConversion() {
  let finish!: (blob: Blob) => void;
  let fail!: (error: unknown) => void;
  let report: ((p: Parameters<NonNullable<Parameters<typeof convertDocxToPdf>[1]>['onProgress'] & object>[0]) => void) | undefined;
  convert.mockImplementationOnce(
    (_file, options) =>
      new Promise<Blob>((resolve, reject) => {
        report = options?.onProgress;
        finish = resolve;
        fail = reject;
      }),
  );
  return { finish: (blob = new Blob(['%PDF'])) => finish(blob), fail: (e: unknown) => fail(e), report: (p: Parameters<NonNullable<typeof report>>[0]) => report?.(p) };
}

beforeEach(() => {
  filesApi.pickFile.mockReset();
  filesApi.saveFile.mockReset().mockResolvedValue({ method: 'download' });
  filesApi.isNativePlatform.mockReset().mockReturnValue(false);
  convert.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Word to PDF: choosing a file', () => {
  it('starts with a chooser and the formatting note, and nothing to convert', () => {
    render(<WordToPdfPage />);

    expect(screen.getByText('Choose a Word document')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeTruthy();
    expect(screen.getByText(/may not convert exactly/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Convert to PDF' })).toBeNull();
  });

  it('asks the file picker for .docx files (extension and MIME type)', async () => {
    render(<WordToPdfPage />);
    await chooseFile(docx());
    await screen.findByTestId('preview');

    expect(filesApi.pickFile).toHaveBeenCalledWith([
      '.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
  });

  it('shows the file name, its size, a preview, and the Convert button', async () => {
    render(<WordToPdfPage />);
    await loadFile(withSize(docx('Quarterly report.docx'), 2.5 * 1024 * 1024));

    expect(screen.getByText('Quarterly report.docx')).toBeTruthy();
    expect(screen.getByText('2.5 MB')).toBeTruthy();
    expect(screen.getByTestId('preview').textContent).toContain('Quarterly report.docx');
    expect(screen.getByRole('button', { name: 'Convert to PDF' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does nothing when the chooser is cancelled', async () => {
    render(<WordToPdfPage />);
    filesApi.pickFile.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: 'Choose file' }));

    await waitFor(() => expect(filesApi.pickFile).toHaveBeenCalled());
    expect(screen.queryByTestId('preview')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('accepts a file dropped on the page (laptop)', async () => {
    render(<WordToPdfPage />);
    fireEvent.drop(region(), { dataTransfer: { files: [docx('dropped.docx')], types: ['Files'] } });

    expect((await screen.findByTestId('preview')).textContent).toContain('dropped.docx');
  });

  it('a dropped file replaces the one already loaded', async () => {
    render(<WordToPdfPage />);
    await loadFile(docx('first.docx'));

    fireEvent.drop(region(), { dataTransfer: { files: [docx('second.docx')], types: ['Files'] } });

    await waitFor(() => expect(screen.getByTestId('preview').textContent).toContain('second.docx'));
  });

  it('ignores things that are not files (dragged text)', () => {
    render(<WordToPdfPage />);
    fireEvent.drop(region(), { dataTransfer: { files: [], types: ['text/plain'] } });

    expect(screen.queryByTestId('preview')).toBeNull();
  });
});

describe('Word to PDF: bad files get a clear message', () => {
  const rejected = async (file: File, message: RegExp | string) => {
    render(<WordToPdfPage />);
    await chooseFile(file);

    await waitFor(() => expect(alertText()).toMatch(message));
    expect(screen.queryByTestId('preview')).toBeNull(); // nothing was accepted
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeTruthy();
  };

  it('wrong file type', () => rejected(docx('slides.pdf'), /That's a \.pdf file.*\.docx/));
  it('old .doc format: says it is not supported and what to do', () =>
    rejected(docx('old.doc'), /old Word format \(\.doc\) isn't supported.*Save As/));
  it('an old .doc hiding behind a .docx name', () =>
    rejected(docx('renamed.docx', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])), /old Word \(\.doc\).*password/));
  it('a file that is not a Word document at all (corrupted)', () =>
    rejected(docx('broken.docx', new TextEncoder().encode('not a zip')), /damaged/));
  it('a file over 20 MB, naming its size and the limit', () =>
    rejected(withSize(docx('huge.docx'), 25 * 1024 * 1024), 'That file is 25 MB. The limit is 20 MB.'));
  it('an empty file', () => rejected(withSize(docx('empty.docx'), 0), 'That file is empty.'));

  it('more than one dropped file', async () => {
    render(<WordToPdfPage />);
    fireEvent.drop(region(), { dataTransfer: { files: [docx('a.docx'), docx('b.docx')], types: ['Files'] } });

    expect(alertText()).toBe('Please drop one file at a time.');
    expect(screen.queryByTestId('preview')).toBeNull();
  });

  it('a bad file does not throw away the good one already loaded', async () => {
    render(<WordToPdfPage />);
    await loadFile(docx('good.docx'));

    fireEvent.drop(region(), { dataTransfer: { files: [docx('bad.pdf')], types: ['Files'] } });

    await waitFor(() => expect(alertText()).toMatch(/\.pdf/));
    expect(screen.getByTestId('preview').textContent).toContain('good.docx');
  });

  it('a document that cannot be previewed is dropped, with the reason shown', async () => {
    render(<WordToPdfPage />);
    await loadFile(docx('corrupt-inside.docx'));

    fireEvent.click(screen.getByRole('button', { name: 'fail preview' }));

    await waitFor(() => expect(screen.queryByTestId('preview')).toBeNull());
    expect(alertText()).toBe('Preview failed.');
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeTruthy();
  });
});

describe('Word to PDF: converting', () => {
  it('shows progress, then success, and saves the PDF under the original name with .pdf', async () => {
    const job = pendingConversion();
    render(<WordToPdfPage />);
    await loadFile(docx('My Report.docx'));

    fireEvent.click(screen.getByRole('button', { name: 'Convert to PDF' }));

    // In progress: a progress bar, and the file cannot be swapped meanwhile.
    expect(await screen.findByRole('progressbar')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Convert to PDF' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Change' }) as HTMLButtonElement).disabled).toBe(true);
    job.report({ stage: 'page', page: 2, total: 5 });
    await waitFor(() => expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('Converting page 2 of 5…'));

    const pdf = new Blob(['%PDF-1.3 fake'], { type: 'application/pdf' });
    job.finish(pdf);

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Your PDF is ready');
    expect(status.textContent).toContain('My Report.pdf');
    expect(filesApi.saveFile).toHaveBeenCalledExactlyOnceWith(pdf, 'My Report.pdf');
    expect(convert).toHaveBeenCalledExactlyOnceWith(expect.any(File), expect.objectContaining({ title: 'My Report' }));
  });

  it('on a laptop the success card offers "Download again", which saves again', async () => {
    convert.mockResolvedValueOnce(new Blob(['pdf']));
    render(<WordToPdfPage />);
    await loadFile();
    fireEvent.click(screen.getByRole('button', { name: 'Convert to PDF' }));

    const again = await screen.findByRole('button', { name: 'Download again' });
    expect(screen.queryByRole('button', { name: /Open \/ Share/ })).toBeNull();
    expect(filesApi.saveFile).toHaveBeenCalledTimes(1);

    fireEvent.click(again);
    await waitFor(() => expect(filesApi.saveFile).toHaveBeenCalledTimes(2));
  });

  it('on the phone the success card offers "Open / Share" instead', async () => {
    filesApi.isNativePlatform.mockReturnValue(true);
    convert.mockResolvedValueOnce(new Blob(['pdf']));
    render(<WordToPdfPage />);
    await loadFile();
    fireEvent.click(screen.getByRole('button', { name: 'Convert to PDF' }));

    const share = await screen.findByRole('button', { name: 'Open / Share' });
    expect(screen.queryByRole('button', { name: 'Download again' })).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/share sheet/);

    fireEvent.click(share);
    await waitFor(() => expect(filesApi.saveFile).toHaveBeenCalledTimes(2));
  });

  it('"Convert another file" goes back to the start', async () => {
    convert.mockResolvedValueOnce(new Blob(['pdf']));
    render(<WordToPdfPage />);
    await loadFile();
    fireEvent.click(screen.getByRole('button', { name: 'Convert to PDF' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Convert another file' }));

    expect(screen.getByText('Choose a Word document')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('preview')).toBeNull();
  });

  it('shows our own error message when the conversion fails, and lets the user try again', async () => {
    convert.mockRejectedValueOnce(new ConversionError('The PDF could not be created. Please try again.', 'pdf'));
    render(<WordToPdfPage />);
    await loadFile();
    fireEvent.click(screen.getByRole('button', { name: 'Convert to PDF' }));

    await waitFor(() => expect(alertText()).toBe('The PDF could not be created. Please try again.'));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(filesApi.saveFile).not.toHaveBeenCalled();

    // Retry works.
    convert.mockResolvedValueOnce(new Blob(['pdf']));
    fireEvent.click(screen.getByRole('button', { name: 'Convert to PDF' }));
    await screen.findByText('Your PDF is ready');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hides the internals of an unexpected error', async () => {
    convert.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'x')"));
    render(<WordToPdfPage />);
    await loadFile();
    fireEvent.click(screen.getByRole('button', { name: 'Convert to PDF' }));

    await waitFor(() => expect(alertText()).toMatch(/something went wrong/i));
    expect(alertText()).not.toContain('undefined');
  });

  it('if the PDF was made but saving failed, says so and keeps the result so it can be saved again', async () => {
    convert.mockResolvedValueOnce(new Blob(['pdf']));
    filesApi.saveFile.mockRejectedValueOnce(new Error('disk full'));
    render(<WordToPdfPage />);
    await loadFile();
    fireEvent.click(screen.getByRole('button', { name: 'Convert to PDF' }));

    await waitFor(() => expect(alertText()).toMatch(/created but could not be saved.*Download again/));
    const card = screen.getByRole('status');
    expect(within(card).getByRole('button', { name: 'Download again' })).toBeTruthy();

    fireEvent.click(within(card).getByRole('button', { name: 'Download again' }));
    await waitFor(() => expect(filesApi.saveFile).toHaveBeenCalledTimes(2));
  });

  it('ignores a dropped file while a conversion is running', async () => {
    const job = pendingConversion();
    render(<WordToPdfPage />);
    await loadFile(docx('busy.docx'));
    fireEvent.click(screen.getByRole('button', { name: 'Convert to PDF' }));
    await screen.findByRole('progressbar');

    fireEvent.drop(region(), { dataTransfer: { files: [docx('other.docx')], types: ['Files'] } });

    expect(screen.getByTestId('preview').textContent).toContain('busy.docx');
    job.finish();
    await screen.findByText('Your PDF is ready');
  });
});
