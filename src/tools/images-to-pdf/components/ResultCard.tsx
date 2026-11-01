import { CircleCheckBig, ExternalLink, Share2 } from 'lucide-react';
import { formatFileSize } from '@/shared/files';
import { Button } from '@/shared/ui';
import type { Conversion } from '../converter';

export interface ResultCardProps {
  result: Conversion;
  onConvertMore: () => void;
  onProblem: (message: string) => void;
}

export function ResultCard({ result, onConvertMore, onProblem }: ResultCardProps) {
  const { pdf, textFile, pageCount, pagesWithText, skipped } = result;

  const run = (action: () => Promise<void>) => {
    action().catch((error: unknown) => {
      console.error(error);
      onProblem(error instanceof Error ? error.message : 'That did not work. Please try again.');
    });
  };

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
            {pdf.name} · {formatFileSize(pdf.size)}
          </span>
        </span>
      </p>

      <ul className="mt-2 text-sm text-green-900/80 dark:text-green-100/80">
        <li>
          {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </li>
        <li>{pagesWithText === null ? 'Text was not read (OCR was off)' : `Text found on ${pagesWithText} of them`}</li>
        {textFile && <li className="break-all">Text also saved as {textFile.name}</li>}
        <li>{pdf.location}</li>
      </ul>

      {skipped.length > 0 && (
        <div className="mt-3 text-sm text-amber-900 dark:text-amber-200">
          <p className="font-medium">
            {skipped.length} {skipped.length === 1 ? 'image was' : 'images were'} skipped:
          </p>
          <ul className="list-disc pl-5">
            {skipped.map(({ name, reason }) => (
              <li key={name} className="break-all">
                {name}: {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" onClick={() => run(pdf.open)}>
          <ExternalLink className="size-5" aria-hidden />
          Open
        </Button>
        <Button onClick={() => run(pdf.share)}>
          <Share2 className="size-5" aria-hidden />
          Share
        </Button>
        <Button onClick={onConvertMore}>Convert more</Button>
      </div>
    </div>
  );
}
