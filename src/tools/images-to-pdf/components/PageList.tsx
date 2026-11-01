import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, ImageOff, RotateCw, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { IconButton } from '@/shared/ui';
import type { PageItem } from '../logic';

export interface PageListProps {
  pages: readonly PageItem[];
  /** Page ids in tap order while "Tap to set order" is on; rows are then one big button. */
  tapped: readonly string[] | null;
  onTap: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onRotate: (page: PageItem) => void;
  onRemove: (page: PageItem) => void;
}

/** How close to the top or bottom of the screen a dragged page starts to scroll the list. */
const SCROLL_ZONE = 96;
const SCROLL_STEP = 24;

export function PageList({ pages, tapped, onTap, onMove, onRotate, onRemove }: PageListProps) {
  const [dragging, setDragging] = useState<string | null>(null);

  /*
   * Pointer events rather than HTML drag-and-drop, which does nothing on a touch
   * screen. They are heard on the window because moving a row in the DOM ends any
   * pointer capture on its handle. No dependency list: always the latest `pages`.
   */
  useEffect(() => {
    if (!dragging) return;

    const dragOver = (event: PointerEvent) => {
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-page-id]');
      const to = pages.findIndex((page) => page.id === row?.getAttribute('data-page-id'));
      const from = pages.findIndex((page) => page.id === dragging);
      if (to !== -1 && to !== from) onMove(from, to);

      if (event.clientY < SCROLL_ZONE) window.scrollBy(0, -SCROLL_STEP);
      else if (event.clientY > window.innerHeight - SCROLL_ZONE) window.scrollBy(0, SCROLL_STEP);
    };
    const stop = () => setDragging(null);

    window.addEventListener('pointermove', dragOver);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', dragOver);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  });

  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {pages.map((page, index) => {
        const tapNumber = tapped ? tapped.indexOf(page.id) + 1 : 0;
        return (
        <li
          key={page.id}
          data-page-id={page.id}
          className={cn(
            'relative flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900',
            (dragging === page.id || tapNumber > 0) && 'border-accent-500 ring-2 ring-accent-500',
          )}
        >
          {tapped && (
            <button
              type="button"
              aria-label={tapNumber > 0 ? `${page.file.name}: position ${tapNumber}. Tap to undo` : `Choose ${page.file.name} next`}
              onClick={() => onTap(page.id)}
              className="absolute inset-0 z-10 flex items-center justify-end rounded-2xl pr-4 focus-visible:outline-2 focus-visible:outline-accent-500"
            >
              {tapNumber > 0 && (
                <span className="flex size-10 items-center justify-center rounded-full bg-accent-600 text-lg font-semibold text-white">
                  {tapNumber}
                </span>
              )}
            </button>
          )}
          <span
            role="button"
            aria-hidden
            title="Drag to move"
            className="flex h-16 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-slate-400"
            onPointerDown={() => setDragging(page.id)}
          >
            <GripVertical className="size-5" />
          </span>

          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
            {page.thumbnail ? (
              <img
                src={page.thumbnail}
                alt=""
                className="size-full object-contain transition-transform"
                style={{ transform: `rotate(${page.rotation}deg)` }}
              />
            ) : page.broken ? (
              <ImageOff className="size-6 text-red-500" aria-label="Can't be read" />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <span className="font-semibold">{index + 1}.</span> {page.file.name}
            </p>
            <div className={cn('-ml-1 flex', tapped && 'invisible')}>
              <IconButton
                label={`Move page ${index + 1} up`}
                className="size-11"
                disabled={index === 0}
                onClick={() => onMove(index, index - 1)}
              >
                <ChevronUp className="size-5" aria-hidden />
              </IconButton>
              <IconButton
                label={`Move page ${index + 1} down`}
                className="size-11"
                disabled={index === pages.length - 1}
                onClick={() => onMove(index, index + 1)}
              >
                <ChevronDown className="size-5" aria-hidden />
              </IconButton>
              <IconButton label={`Rotate page ${index + 1}`} className="size-11" onClick={() => onRotate(page)}>
                <RotateCw className="size-5" aria-hidden />
              </IconButton>
              <IconButton label={`Remove page ${index + 1}`} className="size-11" onClick={() => onRemove(page)}>
                <Trash2 className="size-5" aria-hidden />
              </IconButton>
            </div>
          </div>
        </li>
        );
      })}
    </ol>
  );
}
