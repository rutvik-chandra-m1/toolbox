import { FileText } from 'lucide-react';
import { formatFileSize } from '@/shared/files';
import { Button } from '@/shared/ui';

export interface FileSummaryProps {
  name: string;
  size: number;
  /** Disable "change file" while a conversion is running. */
  busy?: boolean;
  onChange: () => void;
}

/** The chosen file: name, size, and a way to pick a different one. */
export function FileSummary({ name, size, busy = false, onChange }: FileSummaryProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
        <FileText className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={name}>
          {name}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">{formatFileSize(size)}</p>
      </div>
      <Button variant="secondary" disabled={busy} onClick={onChange}>
        Change
      </Button>
    </div>
  );
}
