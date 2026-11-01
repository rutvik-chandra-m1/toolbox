import { LoaderCircle, X } from 'lucide-react';
import { Button } from '@/shared/ui';
import type { Progress } from '../converter';

/** 0-1 for the progress bar. Starting counts as the first sliver, saving as the last. */
export function progressFraction(progress: Progress | null): number {
  if (!progress || progress.stage === 'starting') return 0.02;
  if (progress.stage === 'saving') return 0.98;
  return 0.03 + (0.94 * (progress.page - 1)) / progress.total;
}

export function progressLabel(progress: Progress | null): string {
  if (!progress || progress.stage === 'starting') return 'Getting ready…';
  if (progress.stage === 'saving') return 'Saving the PDF…';
  return `${progress.reading ? 'Reading text' : 'Adding pages'}: page ${progress.page} of ${progress.total}`;
}

export function ConvertProgress({ progress, onCancel }: { progress: Progress | null; onCancel: () => void }) {
  const percent = Math.round(progressFraction(progress) * 100);
  const label = progressLabel(progress);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div role="progressbar" aria-label="Creating the PDF" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={label}>
        <p className="flex items-center gap-2 font-medium" aria-live="polite">
          <LoaderCircle className="size-5 animate-spin text-accent-600 dark:text-accent-400" aria-hidden />
          {label}
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-accent-600 transition-[width] duration-300 dark:bg-accent-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Keep this screen open until it finishes.</p>
      <Button className="mt-3 w-full" onClick={onCancel}>
        <X className="size-5" aria-hidden />
        Cancel
      </Button>
    </div>
  );
}
