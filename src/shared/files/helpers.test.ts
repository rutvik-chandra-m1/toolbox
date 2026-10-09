import { describe, expect, it } from 'vitest';
import { sanitizeFilename } from './filename';
import { formatFileSize } from './format';

describe('formatFileSize', () => {
  it.each([
    [0, '0 B'],
    [1, '1 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [12_345, '12.1 KB'],
    [1024 * 1024, '1 MB'],
    [3.25 * 1024 * 1024, '3.3 MB'],
    [20 * 1024 * 1024, '20 MB'],
    [250 * 1024 * 1024, '250 MB'],
    [1024 ** 3, '1 GB'],
  ])('%d bytes -> %s', (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text);
  });

  it('returns an empty string for nonsense input', () => {
    expect(formatFileSize(-1)).toBe('');
    expect(formatFileSize(Number.NaN)).toBe('');
  });
});

describe('sanitizeFilename', () => {
  it('leaves a normal name alone (spaces and dots inside are fine)', () => {
    expect(sanitizeFilename('My Report v2.pdf')).toBe('My Report v2.pdf');
    expect(sanitizeFilename('résumé 2026.pdf')).toBe('résumé 2026.pdf');
  });

  it('replaces characters that are illegal in file names', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j.pdf')).toBe('a_b_c_d_e_f_g_h_i_j.pdf');
    expect(sanitizeFilename('line\nbreak\t.pdf')).toBe('line_break_.pdf');
  });

  it('strips leading dots and trailing dots/spaces', () => {
    expect(sanitizeFilename('..hidden.pdf')).toBe('hidden.pdf');
    expect(sanitizeFilename('name.pdf. ')).toBe('name.pdf');
  });

  it('uses the fallback when nothing usable is left', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('   ')).toBe('file');
    expect(sanitizeFilename('...')).toBe('file');
    expect(sanitizeFilename('///', 'document')).toBe('___');
    expect(sanitizeFilename('', 'document')).toBe('document');
  });

  it('shortens very long names but keeps the extension', () => {
    const name = `${'x'.repeat(300)}.pdf`;
    const result = sanitizeFilename(name);
    expect(result).toHaveLength(120);
    expect(result.endsWith('.pdf')).toBe(true);
  });
});
