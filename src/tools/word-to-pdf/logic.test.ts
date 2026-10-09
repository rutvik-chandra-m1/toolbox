import { describe, expect, it } from 'vitest';
import {
  ConversionError,
  MAX_FILE_BYTES,
  checkFileBasics,
  describeError,
  extensionOf,
  inspectDocxBytes,
  toPdfFilename,
} from './logic';

const MB = 1024 * 1024;
const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

/** The smallest thing that passes inspection: a ZIP header plus the document part's name. */
const fakeDocx = () => new Uint8Array([...bytes(0x50, 0x4b, 0x03, 0x04), ...ascii('....word/document.xml....')]);

describe('extensionOf', () => {
  it.each([
    ['a.docx', '.docx'],
    ['A.DOCX', '.docx'],
    ['my.report.v2.docx', '.docx'],
    ['noext', ''],
    ['.docx', ''], // a dotfile has no extension
    ['trailingdot.', '.'],
  ])('%s -> %j', (name, ext) => {
    expect(extensionOf(name)).toBe(ext);
  });
});

describe('checkFileBasics: file type', () => {
  it('accepts .docx in any letter case', () => {
    expect(checkFileBasics({ name: 'a.docx', size: 10 })).toEqual({ ok: true });
    expect(checkFileBasics({ name: 'A.DOCX', size: 10 })).toEqual({ ok: true });
    expect(checkFileBasics({ name: 'weird.Docx', size: 10 })).toEqual({ ok: true });
  });

  it('says the old .doc format is not supported, and how to fix it', () => {
    const result = checkFileBasics({ name: 'old.doc', size: 100 });
    expect(result).toMatchObject({ ok: false, problem: 'old-doc' });
    if (!result.ok) {
      expect(result.message).toContain('.doc');
      expect(result.message).toContain("isn't supported");
      expect(result.message).toContain('.docx'); // tells the user what to do
    }
    expect(checkFileBasics({ name: 'OLD.DOC', size: 100 })).toMatchObject({ problem: 'old-doc' });
  });

  it.each(['report.pdf', 'notes.txt', 'sheet.xlsx', 'letter.odt', 'letter.rtf', 'photo.png', 'macro.docm'])(
    'rejects %s as the wrong type',
    (name) => {
      expect(checkFileBasics({ name, size: 100 })).toMatchObject({ ok: false, problem: 'wrong-type' });
    },
  );

  it('names the type it was given, and copes with no extension', () => {
    const pdf = checkFileBasics({ name: 'x.pdf', size: 1 });
    expect(!pdf.ok && pdf.message).toContain('.pdf');
    const none = checkFileBasics({ name: 'README', size: 1 });
    expect(none).toMatchObject({ ok: false, problem: 'wrong-type' });
  });

  it('checks the type before the size (a huge PDF is a "wrong type")', () => {
    expect(checkFileBasics({ name: 'big.pdf', size: 50 * MB })).toMatchObject({ problem: 'wrong-type' });
  });
});

describe('checkFileBasics: size', () => {
  it('rejects an empty file', () => {
    expect(checkFileBasics({ name: 'a.docx', size: 0 })).toMatchObject({ ok: false, problem: 'empty' });
  });

  it('accepts a file of exactly 20 MB and rejects one byte more', () => {
    expect(checkFileBasics({ name: 'a.docx', size: MAX_FILE_BYTES })).toEqual({ ok: true });
    expect(checkFileBasics({ name: 'a.docx', size: MAX_FILE_BYTES + 1 })).toMatchObject({
      ok: false,
      problem: 'too-large',
    });
  });

  it('puts the real size and the limit in the message', () => {
    const result = checkFileBasics({ name: 'a.docx', size: 25 * MB });
    expect(!result.ok && result.message).toBe('That file is 25 MB. The limit is 20 MB.');
  });

  it('the limit is 20 MB', () => {
    expect(MAX_FILE_BYTES).toBe(20 * 1024 * 1024);
  });
});

describe('inspectDocxBytes', () => {
  it('accepts a ZIP that contains word/document.xml', () => {
    expect(inspectDocxBytes(fakeDocx())).toEqual({ ok: true });
  });

  it('flags a real old .doc (OLE2 container) renamed to .docx, or an encrypted file', () => {
    const ole = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0);
    const result = inspectDocxBytes(ole);
    expect(result).toMatchObject({ ok: false, problem: 'old-doc' });
    expect(!result.ok && result.message).toMatch(/\.doc.*password/);
  });

  it.each([
    ['plain text', ascii('this is not a word document')],
    ['an empty buffer', bytes()],
    ['a truncated ZIP header', bytes(0x50, 0x4b)],
    ['a PDF', ascii('%PDF-1.7 ...')],
    ['random bytes', bytes(1, 2, 3, 4, 5, 6, 7, 8, 9)],
  ])('flags %s as damaged / not a Word file', (_label, data) => {
    expect(inspectDocxBytes(data)).toMatchObject({ ok: false, problem: 'corrupt' });
  });

  it('flags a ZIP that is not a Word document (e.g. a renamed .xlsx)', () => {
    const xlsx = new Uint8Array([...bytes(0x50, 0x4b, 0x03, 0x04), ...ascii('xl/workbook.xml')]);
    const result = inspectDocxBytes(xlsx);
    expect(result).toMatchObject({ ok: false, problem: 'corrupt' });
    expect(!result.ok && result.message).toContain("doesn't contain a Word document");
  });

  it('finds the document part wherever it is in the file (start, middle, very end)', () => {
    const name = ascii('word/document.xml');
    const pad = new Uint8Array(5000).fill(7);
    const zip = bytes(0x50, 0x4b, 0x03, 0x04);
    for (const parts of [[zip, name, pad], [zip, pad, name, pad], [zip, pad, name]]) {
      expect(inspectDocxBytes(new Uint8Array(parts.flatMap((p) => [...p])))).toEqual({ ok: true });
    }
  });
});

describe('toPdfFilename', () => {
  it.each([
    ['Report.docx', 'Report.pdf'],
    ['Report.DOCX', 'Report.pdf'],
    ['my.report.v2.docx', 'my.report.v2.pdf'], // only the last extension is replaced
    ['Q3 Budget (final).docx', 'Q3 Budget (final).pdf'],
    ['résumé.docx', 'résumé.pdf'],
    ['no-extension', 'no-extension.pdf'],
    ['already.pdf', 'already.pdf'], // no "already.pdf.pdf"
    ['.docx', 'document.pdf'],
    ['', 'document.pdf'],
    ['   .docx', 'document.pdf'],
  ])('%j -> %j', (input, output) => {
    expect(toPdfFilename(input)).toBe(output);
  });

  it('removes characters that are illegal in file names', () => {
    expect(toPdfFilename('a/b:c*d?.docx')).toBe('a_b_c_d_.pdf');
    expect(toPdfFilename('..\\..\\evil.docx')).toBe('_.._evil.pdf');
  });

  it('always ends in .pdf', () => {
    for (const name of ['x.docx', 'x.doc', 'x', 'x.', '..', 'a.b.c']) {
      expect(toPdfFilename(name).endsWith('.pdf')).toBe(true);
    }
  });
});

describe('describeError', () => {
  it('shows our own messages as they are', () => {
    expect(describeError(new ConversionError('Nothing to show.', 'empty'))).toBe('Nothing to show.');
  });

  it('hides internals of unexpected errors behind a generic message', () => {
    const message = describeError(new TypeError("Cannot read properties of undefined (reading 'x')"));
    expect(message).not.toContain('undefined');
    expect(message).toMatch(/something went wrong/i);
    expect(describeError('a string')).toMatch(/something went wrong/i);
  });

  it('keeps the original error as the cause', () => {
    const cause = new Error('inner');
    expect(new ConversionError('outer', 'render', { cause }).cause).toBe(cause);
  });
});
