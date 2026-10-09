import { formatFileSize, sanitizeFilename } from '@/shared/files';

/* ------------------------------------------------------------------ */
/* Limits and accepted types                                           */
/* ------------------------------------------------------------------ */

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Both the extension and the MIME type: Android pickers filter by MIME type. */
export const ACCEPTED_TYPES = ['.docx', DOCX_MIME] as const;

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type FileProblem = 'wrong-type' | 'old-doc' | 'empty' | 'too-large' | 'corrupt';

export type FileCheck = { ok: true } | { ok: false; problem: FileProblem; message: string };

const OK: FileCheck = { ok: true };

function fail(problem: FileProblem, message: string): FileCheck {
  return { ok: false, problem, message };
}

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot).toLowerCase() : '';
}

const OLD_DOC_MESSAGE =
  "The old Word format (.doc) isn't supported. Open the file in Word, choose Save As, pick Word Document (.docx), and try again.";

/**
 * Checks what is known without reading the file: its name and size.
 * (The type is judged by extension; MIME types are empty or wrong too often
 * on Android and Windows to be trusted.)
 */
export function checkFileBasics(file: { name: string; size: number }): FileCheck {
  const ext = extensionOf(file.name);

  if (ext === '.doc') return fail('old-doc', OLD_DOC_MESSAGE);
  if (ext !== '.docx') {
    const what = ext ? `a ${ext} file` : 'not a Word document';
    return fail('wrong-type', `That's ${what}. Please choose a Word document (.docx).`);
  }
  if (file.size === 0) return fail('empty', 'That file is empty.');
  if (file.size > MAX_FILE_BYTES) {
    return fail(
      'too-large',
      `That file is ${formatFileSize(file.size)}. The limit is ${formatFileSize(MAX_FILE_BYTES)}.`,
    );
  }
  return OK;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\3\4"
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // old .doc and encrypted Office files
const DOCUMENT_PART = new TextEncoder().encode('word/document.xml');

const startsWith = (bytes: Uint8Array, magic: readonly number[]) =>
  bytes.length >= magic.length && magic.every((byte, i) => bytes[i] === byte);

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  const last = haystack.length - needle.length;
  outer: for (let i = 0; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Looks inside the file: a real .docx is a ZIP archive that contains
 * `word/document.xml`. Catches renamed files, damaged downloads, and old
 * .doc / password-protected files that were given a .docx name.
 */
export function inspectDocxBytes(bytes: Uint8Array): FileCheck {
  if (startsWith(bytes, OLE_MAGIC)) {
    return fail(
      'old-doc',
      "This looks like an old Word (.doc) file or a password-protected document, and neither is supported. Open it in Word and save an unprotected copy as a Word Document (.docx).",
    );
  }
  if (!startsWith(bytes, ZIP_MAGIC)) {
    return fail('corrupt', "This file looks damaged, or it isn't really a Word document.");
  }
  if (!containsBytes(bytes, DOCUMENT_PART)) {
    return fail('corrupt', "This file is a valid archive but doesn't contain a Word document, so it can't be converted.");
  }
  return OK;
}

/* ------------------------------------------------------------------ */
/* Output file name                                                    */
/* ------------------------------------------------------------------ */

/** "Report.docx" -> "Report.pdf" (only the final extension changes; unsafe characters are removed). */
export function toPdfFilename(original: string): string {
  const withoutExtension = original.replace(/\.(docx|pdf)$/i, '');
  return `${sanitizeFilename(withoutExtension, 'document')}.pdf`;
}

/* ------------------------------------------------------------------ */
/* Conversion errors                                                   */
/* ------------------------------------------------------------------ */

export type ConversionErrorCode = 'unreadable' | 'empty' | 'render' | 'pdf';

/** An error whose message is safe to show to the user as-is. */
export class ConversionError extends Error {
  readonly code: ConversionErrorCode;

  constructor(message: string, code: ConversionErrorCode, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConversionError';
    this.code = code;
  }
}

export const UNREADABLE_MESSAGE =
  "This document couldn't be read. It may be damaged, password-protected, or not a real Word file.";

/** What to tell the user about any error thrown while previewing or converting. */
export function describeError(error: unknown): string {
  if (error instanceof ConversionError) return error.message;
  return 'Something went wrong while converting. Please try again, or try a different file.';
}
