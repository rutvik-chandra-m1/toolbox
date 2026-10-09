import { useState } from 'react';
import { CircleAlert, FileOutput, Info } from 'lucide-react';
import { isNativePlatform, pickFile, saveFile, useDropTarget } from '@/shared/files';
import { cn } from '@/shared/lib/cn';
import { Button, PageContainer } from '@/shared/ui';
import { ConvertProgress } from './components/ConvertProgress';
import { DocumentPreview } from './components/DocumentPreview';
import { DropZone } from './components/DropZone';
import { FileSummary } from './components/FileSummary';
import { ResultCard } from './components/ResultCard';
import { convertDocxToPdf, type ConvertProgress as Progress } from './converter';
import {
  ACCEPTED_TYPES,
  UNREADABLE_MESSAGE,
  checkFileBasics,
  describeError,
  inspectDocxBytes,
  toPdfFilename,
  type FileCheck,
} from './logic';

type Phase = 'idle' | 'converting' | 'done';

interface Result {
  blob: Blob;
  filename: string;
}

export default function WordToPdfPage() {
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const native = isNativePlatform();
  const busy = phase === 'converting';

  /** Forgets the file and any result, but leaves a shown message alone. */
  function discardFile() {
    setFile(null);
    setResult(null);
    setProgress(null);
    setPhase('idle');
  }

  function startOver() {
    discardFile();
    setProblem(null);
  }

  /** Validates a picked / dropped file; only a good one replaces the current file. */
  async function accept(candidate: File) {
    const basics = checkFileBasics(candidate);
    if (!basics.ok) {
      setProblem(basics.message);
      return;
    }

    let inside: FileCheck;
    try {
      inside = inspectDocxBytes(new Uint8Array(await candidate.arrayBuffer()));
    } catch {
      inside = { ok: false, problem: 'corrupt', message: UNREADABLE_MESSAGE };
    }
    if (!inside.ok) {
      setProblem(inside.message);
      return;
    }

    setFile(candidate);
    setProblem(null);
    setResult(null);
    setProgress(null);
    setPhase('idle');
  }

  async function choose() {
    if (busy) return;
    const picked = await pickFile(ACCEPTED_TYPES);
    if (picked) await accept(picked);
  }

  const drop = useDropTarget({
    disabled: busy,
    onDropFiles(files) {
      const [first] = files;
      if (files.length > 1) setProblem('Please drop one file at a time.');
      else if (first) void accept(first);
    },
  });

  async function save({ blob, filename }: Result) {
    try {
      await saveFile(blob, filename);
    } catch (error) {
      console.error(error);
      setProblem(
        `The PDF was created but could not be saved. Try "${native ? 'Open / Share' : 'Download again'}".`,
      );
    }
  }

  async function convert() {
    if (!file || busy) return;
    const filename = toPdfFilename(file.name);

    setProblem(null);
    setProgress({ stage: 'reading' });
    setPhase('converting');

    let blob: Blob;
    try {
      blob = await convertDocxToPdf(file, { onProgress: setProgress, title: filename.replace(/\.pdf$/, '') });
    } catch (error) {
      console.error(error);
      setProblem(describeError(error));
      setProgress(null);
      setPhase('idle');
      return;
    }

    const done = { blob, filename };
    setResult(done);
    setProgress(null);
    setPhase('done');
    await save(done);
  }

  return (
    <PageContainer>
      {/* The whole page accepts a dropped file, also to replace the current one. */}
      <div
        role="region"
        aria-label="Word to PDF"
        {...drop.handlers}
        className={cn('space-y-5 rounded-2xl', drop.dragging && file && 'ring-2 ring-indigo-500 ring-offset-8 ring-offset-transparent')}
      >
        {!file ? (
          <DropZone disabled={busy} dragging={drop.dragging} onChoose={() => void choose()} />
        ) : (
          <>
            <FileSummary name={file.name} size={file.size} busy={busy} onChange={() => void choose()} />

            {phase === 'converting' ? (
              <ConvertProgress progress={progress} />
            ) : phase === 'done' && result ? (
              <ResultCard
                filename={result.filename}
                size={result.blob.size}
                native={native}
                onSaveAgain={() => void save(result)}
                onStartOver={startOver}
              />
            ) : (
              <Button variant="primary" className="w-full" onClick={() => void convert()}>
                <FileOutput className="size-5" aria-hidden />
                Convert to PDF
              </Button>
            )}
          </>
        )}

        {problem && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {problem}
          </p>
        )}

        {file && (
          <DocumentPreview
            file={file}
            onError={(message) => {
              // A document that cannot be previewed cannot be converted either.
              setProblem(message);
              discardFile();
            }}
          />
        )}

        <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Complex formatting (text boxes, advanced layouts, unusual fonts) may not convert exactly. Pages are saved
            as images, so text in the PDF can&apos;t be selected or searched. Everything happens on this device:
            your file is never uploaded.
          </span>
        </p>
      </div>
    </PageContainer>
  );
}
