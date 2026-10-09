import { ConversionError, UNREADABLE_MESSAGE } from './logic';
import { paginateSections, type Page } from './paginate';
import type { RenderFrame } from './renderFrame';

/** How the rendered pages are presented inside the frame. */
export type RenderMode = 'preview' | 'capture';

const MODE_CSS: Record<RenderMode, string> = {
  // Pages as sheets on a grey desk, separated by a gap.
  preview: `
    html, body { background: #cbd5e1; }
    .docx-wrapper { background: transparent !important; padding: 12px !important; }
    .docx-wrapper > section.docx { margin: 0 auto 12px !important; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.35) !important; }
  `,
  // Bare pages on white, so each one can be photographed exactly.
  capture: `
    html, body { background: #ffffff; }
    .docx-wrapper { background: #ffffff !important; padding: 0 !important; }
    .docx-wrapper > section.docx { margin: 0 !important; box-shadow: none !important; }
  `,
};

/** Renders a .docx into the frame (library loaded on first use). */
async function renderDocx(file: Blob, frame: RenderFrame): Promise<void> {
  const { renderAsync } = await import('docx-preview');
  try {
    await renderAsync(file, frame.body, frame.head, {
      className: 'docx',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true, // new page at explicit page breaks
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: true, // inline images as data: URLs, so they can be drawn onto a canvas
    });
  } catch (cause) {
    throw new ConversionError(UNREADABLE_MESSAGE, 'unreadable', { cause });
  }
}

/** Never wait longer than this for fonts and images (a stalled decode must not hang a conversion). */
const ASSET_WAIT_MS = 5_000;

/** Waits until fonts and images are ready, so nothing is photographed half-loaded. */
async function waitForAssets(doc: Document): Promise<void> {
  const ready = Promise.all([
    doc.fonts?.ready,
    ...Array.from(doc.images).map((image) => image.decode().catch(() => undefined)),
  ]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ASSET_WAIT_MS);
  });
  await Promise.race([ready, timeout]);
  clearTimeout(timer);
}

export interface RenderedDocument {
  pages: Page[];
}

/**
 * Renders the document into `frame` and splits it into page-sized elements.
 * Used for both the on-screen preview and the conversion, so what you preview
 * is what you get.
 */
export async function renderDocument(
  file: Blob,
  frame: RenderFrame,
  mode: RenderMode,
): Promise<RenderedDocument> {
  await renderDocx(file, frame);

  const style = frame.doc.createElement('style');
  style.textContent = MODE_CSS[mode];
  frame.head.appendChild(style);

  await waitForAssets(frame.doc);

  const pages = paginateSections(frame.doc);
  if (pages.length === 0) {
    throw new ConversionError('This document has nothing to convert.', 'empty');
  }
  return { pages };
}
