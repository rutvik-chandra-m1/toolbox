import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickFile } from './pickFile';

const input = () => document.querySelector<HTMLInputElement>('input[type="file"]');

function chooseFile(el: HTMLInputElement, file: File | null) {
  Object.defineProperty(el, 'files', { configurable: true, value: file ? [file] : [] });
  el.dispatchEvent(new Event('change'));
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('pickFile', () => {
  it('opens a file chooser limited to the accepted types', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    const promise = pickFile(['.docx', 'application/msword']);
    expect(click).toHaveBeenCalledOnce();
    expect(input()?.accept).toBe('.docx,application/msword');

    input()?.dispatchEvent(new Event('cancel'));
    await promise;
  });

  it('resolves with the file the user picked and removes its input', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const file = new File(['x'], 'a.docx');

    const promise = pickFile(['.docx']);
    chooseFile(input() as HTMLInputElement, file);

    await expect(promise).resolves.toBe(file);
    expect(input()).toBeNull();
  });

  it('resolves null when the user cancels, and cleans up', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    const promise = pickFile(['.docx']);
    input()?.dispatchEvent(new Event('cancel'));

    await expect(promise).resolves.toBeNull();
    expect(input()).toBeNull();
  });

  it('resolves null when the chooser closes with no file', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    const promise = pickFile(['.docx']);
    chooseFile(input() as HTMLInputElement, null);

    await expect(promise).resolves.toBeNull();
  });

  it('a second call abandons a chooser that was never answered (no leaked inputs)', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    const first = pickFile(['.docx']);
    const second = pickFile(['.docx']);

    await expect(first).resolves.toBeNull();
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1);

    const file = new File(['x'], 'b.docx');
    chooseFile(input() as HTMLInputElement, file);
    await expect(second).resolves.toBe(file);
  });
});
