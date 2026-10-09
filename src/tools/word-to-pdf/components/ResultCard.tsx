import { CircleCheckBig, Download, Share2 } from 'lucide-react';
import { formatFileSize } from '@/shared/files';
import { Button } from '@/shared/ui';

export interface ResultCardProps {
  filename: string;
  size: number;
  /** On the phone the PDF goes through the share sheet; on a laptop it is downloaded. */
  native: boolean;
  onSaveAgain: () => void;
  onStartOver: () => void;
}

export function ResultCard({ filename, size, native, onSaveAgain, onStartOver }: ResultCardProps) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-green-300 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40"
    >
      <p className="flex items-start gap-2 font-semibold text-green-900 dark:text-green-100">
        <CircleCheckBig className="mt-0.5 size-5 shrink-0" aria-hidden />
        <span className="min-w-0">
          Your PDF is ready
          <span className="block break-all text-sm font-normal">
            {filename} · {formatFileSize(size)}
          </span>
        </span>
      </p>
      <p className="mt-2 text-sm text-green-900/80 dark:text-green-100/80">
        {native
          ? 'Use the share sheet to open it, save it to Files or Drive, or send it.'
          : 'Your browser has downloaded it. Check your Downloads if you cannot see it.'}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" onClick={onSaveAgain}>
          {native ? <Share2 className="size-5" aria-hidden /> : <Download className="size-5" aria-hidden />}
          {native ? 'Open / Share' : 'Download again'}
        </Button>
        <Button variant="secondary" onClick={onStartOver}>
          Convert another file
        </Button>
      </div>
    </div>
  );
}
