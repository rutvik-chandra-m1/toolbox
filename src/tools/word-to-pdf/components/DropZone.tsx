import { FileUp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';

export interface DropZoneProps {
  disabled?: boolean;
  /** A file is being dragged over the page: highlight the box. */
  dragging?: boolean;
  /** The user wants the file chooser (button). */
  onChoose: () => void;
}

/** Big target for "choose a file". (Dropping is handled by the page around it.) */
export function DropZone({ disabled = false, dragging = false, onChoose }: DropZoneProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
        dragging
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
          : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900',
      )}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
        <FileUp className="size-7" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">Choose a Word document</h2>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        A .docx file, up to 20 MB.
        <span className="max-sm:hidden"> You can also drag it onto this page.</span>
      </p>
      <Button variant="primary" className="mt-5 min-w-44" disabled={disabled} onClick={onChoose}>
        Choose file
      </Button>
    </div>
  );
}
