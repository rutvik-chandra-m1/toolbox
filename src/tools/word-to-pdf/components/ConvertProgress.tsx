import { LoaderCircle } from 'lucide-react';
import type { ConvertProgress as Progress } from '../converter';

/** 0-1 for the progress bar. Reading counts as the first sliver, finishing as the last. */
export function progressFraction(progress: Progress | null): number {
  if (!progress) return 0;
  switch (progress.stage) {
    case 'reading':
      return 0.03;
    case 'page':
      return 0.05 + (0.9 * (progress.page - 1)) / progress.total;
    case 'finishing':
      return 0.97;
  }
}

export function progressLabel(progress: Progress | null): string {
  if (!progress || progress.stage === 'reading') return 'Reading the document…';
  if (progress.stage === 'finishing') return 'Creating the PDF…';
  return `Converting page ${progress.page} of ${progress.total}…`;
}

export function ConvertProgress({ progress }: { progress: Progress | null }) {
  const percent = Math.round(progressFraction(progress) * 100);
  const label = progressLabel(progress);

  return (
    <div
      role="progressbar"
      aria-label="Converting to PDF"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={label}
      className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <p className="flex items-center gap-2 font-medium" aria-live="polite">
        <LoaderCircle className="size-5 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden />
        {label}
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-indigo-600 transition-[width] duration-300 dark:bg-indigo-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
