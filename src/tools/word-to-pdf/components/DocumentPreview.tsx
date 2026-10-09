import { useEffect, useRef, useState } from 'react';
import { describeError } from '../logic';
import { createRenderFrame, type RenderFrame } from '../renderFrame';
import { renderDocument } from '../renderDocument';

export interface DocumentPreviewProps {
  file: Blob;
  /** Called with a user-facing message if the document cannot be shown. */
  onError: (message: string) => void;
}

/**
 * Scrollable preview of the document: the same render + pagination the PDF
 * conversion uses, shrunk to fit the width of the screen.
 */
export function DocumentPreview({ file, onError }: DocumentPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; pages: number }>({
    status: 'loading',
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let frame: RenderFrame | null = null;
    let observer: ResizeObserver | null = null;
    setState({ status: 'loading' });

    void (async () => {
      try {
        const created = await createRenderFrame({ parent: host, className: 'size-full border-0' });
        frame = created;
        // The effect may have been cleaned up while the frame was being created
        // (React StrictMode does this on purpose): don't leave it behind.
        if (cancelled) {
          created.dispose();
          return;
        }
        const { pages } = await renderDocument(file, created, 'preview');
        if (cancelled) return;

        // Shrink the page to the available width (never enlarge it).
        const fit = () => {
          const first = pages[0]?.element;
          if (!first) return;
          const wanted = first.offsetWidth + 24; // page + the desk margin
          const scrollbar = 16; // room for the vertical scrollbar, so there is no sideways scroll
          const zoom = Math.min(1, (created.iframe.clientWidth - scrollbar) / wanted);
          created.body.style.zoom = String(Math.max(zoom, 0.2));
        };
        fit();
        observer = new ResizeObserver(fit);
        observer.observe(created.iframe);
        setState({ status: 'ready', pages: pages.length });
      } catch (error) {
        if (!cancelled) onErrorRef.current(describeError(error));
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      frame?.dispose();
    };
  }, [file]);

  return (
    <section aria-label="Document preview">
      <div className="mb-2 flex items-baseline justify-between text-sm text-slate-600 dark:text-slate-400">
        <h2 className="font-medium text-slate-800 dark:text-slate-200">Preview</h2>
        <span aria-live="polite">
          {state.status === 'ready' ? `${state.pages} ${state.pages === 1 ? 'page' : 'pages'}` : 'Loading…'}
        </span>
      </div>
      <div
        ref={hostRef}
        className="h-[55vh] min-h-72 max-h-[40rem] overflow-hidden rounded-xl border border-slate-300 bg-slate-300 dark:border-slate-700"
      />
    </section>
  );
}
