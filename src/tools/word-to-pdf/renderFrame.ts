export interface RenderFrame {
  iframe: HTMLIFrameElement;
  doc: Document;
  head: HTMLElement;
  body: HTMLElement;
  /** Removes the frame from the page. */
  dispose: () => void;
}

export interface RenderFrameOptions {
  /** Where to put the frame. Defaults to `document.body`. */
  parent?: HTMLElement;
  /** Off-screen and invisible: used for the conversion itself. */
  hidden?: boolean;
  className?: string;
}

const EMPTY_DOCUMENT =
  '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"></body></html>';

/**
 * Creates an iframe to render a Word document into.
 *
 * An iframe is used (rather than a <div>) because it has its own stylesheet
 * scope: the app's Tailwind reset would otherwise strip list bullets, resize
 * headings and squash images in the document. It is also sandboxed without
 * `allow-scripts`, so nothing inside a document - such as a `javascript:` link
 * from an untrusted file - can ever run; `allow-same-origin` only lets *us*
 * reach into the frame to fill it.
 */
export function createRenderFrame({
  parent = document.body,
  hidden = false,
  className,
}: RenderFrameOptions = {}): Promise<RenderFrame> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.title = hidden ? 'Conversion workspace' : 'Document preview';
    if (className) iframe.className = className;
    if (hidden) {
      iframe.setAttribute('aria-hidden', 'true');
      iframe.tabIndex = -1;
      // Laid out normally (so measurements work) but far off-screen.
      Object.assign(iframe.style, {
        position: 'fixed',
        left: '-100000px',
        top: '0',
        width: '1600px',
        height: '1600px',
        border: '0',
        pointerEvents: 'none',
      });
    }

    const timeout = setTimeout(() => {
      iframe.remove();
      reject(new Error('The document workspace did not load.'));
    }, 10_000);

    iframe.addEventListener(
      'load',
      () => {
        clearTimeout(timeout);
        const doc = iframe.contentDocument;
        if (!doc) {
          iframe.remove();
          reject(new Error('The document workspace is not available.'));
          return;
        }
        // Links in a document must not navigate anywhere while previewing.
        doc.addEventListener('click', (event) => {
          if ((event.target as Element | null)?.closest?.('a')) event.preventDefault();
        });
        resolve({ iframe, doc, head: doc.head, body: doc.body, dispose: () => iframe.remove() });
      },
      { once: true },
    );

    iframe.srcdoc = EMPTY_DOCUMENT;
    parent.appendChild(iframe);
  });
}
